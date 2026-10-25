-- =============================================================================
-- 08 PENGERASAN KIRIMAN: svc_find_submission (kirim ulang tanpa Turnstile) dan
-- svc_create_submission yang tahan balapan kunci sama. Semua data dummy.
-- =============================================================================
begin;
select plan(20);

create temp table fx (k text primary key, v jsonb);

insert into fx select 'a', public.svc_create_submission(jsonb_build_object(
  'idempotency_key', '00000000-0000-4000-8000-000000000801',
  'entry_date', app_private.local_today(), 'source', 'Workshop Uji', 'sender_name', 'Uji Coba 08',
  'entity', 'PT Dummy', 'phone_e164', '+6281200000008', 'notes', 'Catatan Uji 08', 'photo_count', 2,
  'confirm_sealed', true, 'confirm_no_leak', true, 'confirm_labeled', true,
  'items', jsonb_build_array(jsonb_build_object('waste_code', 'B105d', 'weight_kg', 180, 'package_count', 1))
), repeat('8', 64));
insert into fx select 'found', public.svc_find_submission('00000000-0000-4000-8000-000000000801');

-- ---- svc_find_submission
select is(public.svc_find_submission('00000000-0000-4000-8000-0000000008ff'), null,
  'svc_find_submission: kunci tak dikenal → null');
select is((select v ->> 'ticket_code' from fx where k = 'found'), (select v ->> 'ticket_code' from fx where k = 'a'),
  'svc_find_submission: tiket sama dengan hasil create');
select is((select v ->> 'submission_id' from fx where k = 'found'), (select v ->> 'submission_id' from fx where k = 'a'),
  'svc_find_submission: submission_id sama');
select is((select v -> 'photo_paths' from fx where k = 'found'), (select v -> 'photo_paths' from fx where k = 'a'),
  'svc_find_submission: path foto sama dengan hasil create (2 foto)');
select is((select v ->> 'status' from fx where k = 'found'), 'pending', 'svc_find_submission: status pending');
select is(
  array(select k from jsonb_object_keys((select v from fx where k = 'found')) k order by 1),
  array['photo_paths', 'status', 'submission_id', 'ticket_code'],
  'svc_find_submission: hanya submission_id, ticket_code, status, photo_paths');
select ok(
  not ((select v from fx where k = 'found')::text
       ~* '(sender|phone|Uji Coba 08|6281200000008|entity|PT Dummy|Workshop|Catatan|weight|ip_hash|8{64})'),
  'svc_find_submission: tanpa nama, telepon, entity, sumber, catatan, berat, atau hash IP');
select is(
  array(select k from jsonb_object_keys((select v from fx where k = 'a')) k order by 1),
  array['created', 'photo_paths', 'status', 'submission_id', 'ticket_code'],
  'svc_create_submission: keluaran tanpa PII (5 kunci)');

-- ---- hak eksekusi
select ok(not has_function_privilege('anon', 'public.svc_find_submission(uuid)', 'EXECUTE'),
  'anon tidak bisa EXECUTE svc_find_submission');
select ok(not has_function_privilege('authenticated', 'public.svc_find_submission(uuid)', 'EXECUTE'),
  'authenticated tidak bisa EXECUTE svc_find_submission');
select ok(has_function_privilege('service_role', 'public.svc_find_submission(uuid)', 'EXECUTE'),
  'service_role bisa EXECUTE svc_find_submission');
select ok(
  not has_function_privilege('anon', 'app_private.insert_submission(jsonb, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'app_private.insert_submission(jsonb, text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'app_private.insert_submission(jsonb, text)', 'EXECUTE'),
  'app_private.insert_submission hanya internal (tanpa EXECUTE untuk anon/authenticated/service_role)');
set local role anon;
select throws_ok($$ select public.svc_find_submission('00000000-0000-4000-8000-000000000801') $$,
  '42501', null, 'SET ROLE anon: svc_find_submission ditolak');
reset role;
set local role authenticated;
select throws_ok($$ select public.svc_find_submission('00000000-0000-4000-8000-000000000801') $$,
  '42501', null, 'SET ROLE authenticated: svc_find_submission ditolak');
reset role;

-- ---- idempotensi create tetap terjaga
select is(
  (public.svc_create_submission(jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000801'),
                                repeat('8', 64)) - 'created'),
  (select v from fx where k = 'found'),
  'kirim ulang kunci sama → kiriman yang sama (tanpa validasi ulang isi)');

-- ---- balapan: request kedua lolos pengecekan awal lalu bentrok unique_violation saat insert.
-- Disimulasikan dengan memanggil insert internal (tanpa pengecekan awal) memakai kunci yang sudah ada.
insert into fx select 'counter_before', to_jsonb(c.last_value)
  from app_private.counters c where c.kind = 'ticket' and c.period = to_char(app_private.local_today(), 'YYMM');
insert into fx select 'race', app_private.insert_submission(jsonb_build_object(
  'idempotency_key', '00000000-0000-4000-8000-000000000801',
  'entry_date', app_private.local_today(), 'source', 'Workshop Uji', 'sender_name', 'Uji Coba 09',
  'entity', 'PT Dummy', 'phone_e164', '+6281200000009', 'photo_count', 0,
  'confirm_sealed', true, 'confirm_no_leak', true, 'confirm_labeled', true,
  'items', jsonb_build_array(jsonb_build_object('waste_code', 'B105d', 'weight_kg', 10))
), repeat('9', 64));
select is((select (v ->> 'created')::boolean from fx where k = 'race'), false,
  'balapan unique_violation pada idempotency_key → created = false');
select is((select v ->> 'ticket_code' from fx where k = 'race'), (select v ->> 'ticket_code' from fx where k = 'a'),
  'balapan → tiket kiriman yang sudah ada');
select is((select count(*)::int from public.submissions
            where idempotency_key = '00000000-0000-4000-8000-000000000801'), 1,
  'balapan tidak membuat kiriman ganda');
select is(
  (select to_jsonb(c.last_value) from app_private.counters c
    where c.kind = 'ticket' and c.period = to_char(app_private.local_today(), 'YYMM')),
  (select v from fx where k = 'counter_before'),
  'balapan tidak memakan nomor tiket (counter dikembalikan, tanpa nomor bolong)');
select is((select count(*)::int from public.submissions where sender_name = 'Uji Coba 09'), 0,
  'isi request yang kalah balapan tidak tersimpan');

select * from finish();
rollback;
