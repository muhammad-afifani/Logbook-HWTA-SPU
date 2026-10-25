-- =============================================================================
-- 01 HAK ANON. Versi pgTAP dari ops/checks/anon_no_select.sql, dijalankan terhadap
-- migrasi asli di Supabase CLI lokal (supabase test db).
-- =============================================================================
begin;
select plan(9);

-- Data dummy agar uji perilaku bermakna (ada baris yang BISA bocor bila hak salah).
select public.svc_create_submission(jsonb_build_object(
  'idempotency_key', '00000000-0000-4000-8000-000000000001',
  'entry_date', app_private.local_today(), 'source', 'Workshop Uji', 'sender_name', 'Uji Coba 01',
  'entity', 'PT Dummy', 'phone_e164', '+6281200000001',
  'confirm_sealed', true, 'confirm_no_leak', true, 'confirm_labeled', true,
  'items', jsonb_build_array(jsonb_build_object('waste_code', 'B105d', 'weight_kg', 150, 'package_count', 1))
), repeat('a', 64));

-- 1) Kueri 1 anon_no_select.sql: relasi di skema yang diekspos API + skema aplikasi.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm', 'f')
      and n.nspname in ('public', 'graphql_public', 'app_private')
      and (has_table_privilege('anon', c.oid, 'SELECT') or has_any_column_privilege('anon', c.oid, 'SELECT'))),
  0, 'anon tidak punya hak SELECT (tabel/kolom) pada relasi apa pun di public, graphql_public, app_private');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm', 'f') and n.nspname in ('public', 'app_private')
      and (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
           or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('anon', c.oid, 'TRUNCATE'))),
  0, 'anon tidak punya hak INSERT/UPDATE/DELETE/TRUNCATE pada relasi apa pun');

-- 2) Uji perilaku: SET ROLE anon lalu SELECT setiap tabel & view di public.
create temp table anon_probe (rel text, outcome text);
grant insert on anon_probe to anon;
do $$
declare r record; n bigint;
begin
  for r in select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
            where ns.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') order by 1 loop
    begin
      execute 'set local role anon';
      execute format('select count(*) from public.%I', r.relname) into n;
      execute 'reset role';
      insert into anon_probe values (r.relname, 'TERBACA ' || n || ' baris');
    exception when insufficient_privilege then
      execute 'reset role';
      insert into anon_probe values (r.relname, 'permission denied');
    end;
  end loop;
end $$;
select is((select count(*)::int from anon_probe), 18, '18 relasi public diuji (17 tabel + view lot_stock)');
select is((select count(*)::int from anon_probe where outcome <> 'permission denied'), 0,
  'SET ROLE anon: SELECT ditolak (permission denied) di setiap tabel & view public');

-- 3) Kueri 3: setiap tabel public & app_private RLS aktif.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'app_private') and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'setiap tabel di public & app_private RLS aktif');

-- 4) Kueri 4: fungsi yang bisa dieksekusi anon persis ping & public_status.
select is(
  array(select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'app_private') and has_function_privilege('anon', p.oid, 'EXECUTE')
         order by 1),
  array['ping', 'public_status'],
  'anon hanya bisa EXECUTE ping() dan public_status()');

select ok(not has_schema_privilege('anon', 'app_private', 'USAGE'), 'anon tidak punya USAGE pada skema app_private');

-- 5) Tidak ada policy RLS apa pun yang ditujukan ke anon/public di skema aplikasi.
select is(
  (select count(*)::int from pg_policies
    where schemaname in ('public', 'app_private') and (roles && array['anon', 'public']::name[])),
  0, 'tidak ada policy untuk anon/public');

-- 6) Kontrak public_status: hanya 3 kunci, tanpa kg/drum/lot/PII.
select is(
  array(select k from jsonb_object_keys(public.public_status()) k order by 1),
  array['capacity_pct', 'has_waste', 'updated_at'],
  'public_status() hanya mengembalikan capacity_pct, has_waste, updated_at');

select * from finish();
rollback;
