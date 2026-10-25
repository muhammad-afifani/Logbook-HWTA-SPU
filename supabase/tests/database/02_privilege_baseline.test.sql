-- =============================================================================
-- 02 MIGRASI TIDAK MENGUBAH DEFAULT PRIVILEGES & TIDAK MENAMBAH GRANT AUTH/STORAGE.
-- Nilai harapan = baseline Supabase CLI 2.122.0 / postgres 17.11.0.006 SEBELUM migrasi
-- proyek diterapkan (dicatat 25/10/2026). Bila image Supabase berubah baseline-nya,
-- test ini gagal dan baseline harus dicek ulang secara sadar.
-- =============================================================================
begin;
select plan(4);

select is(
  array(select v from (
          select format('%s|%s|%s|%s', d.defaclrole::regrole, d.defaclnamespace::regnamespace,
                        d.defaclobjtype, d.defaclacl) as v
            from pg_default_acl d
           where d.defaclnamespace::regnamespace::text in ('public', 'storage')) q
         order by v collate "C"),
  array(select v from unnest(array[
    'postgres|public|S|{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}',
    'postgres|public|f|{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}',
    'postgres|public|r|{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}',
    'postgres|storage|S|{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}',
    'postgres|storage|f|{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}',
    'postgres|storage|r|{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}',
    'supabase_admin|public|S|{postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}',
    'supabase_admin|public|f|{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}',
    'supabase_admin|public|r|{postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}'
  ]) v order by v collate "C"),
  'default privileges public & storage sama dengan baseline Supabase (tidak diubah migrasi)');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'auth' and grantee in ('anon', 'authenticated')),
  0, 'tidak ada grant tabel skema auth untuk anon/authenticated');

select is(
  array(select v from (
          select format('%s|%s|%s', g.grantee, g.table_name,
                        string_agg(g.privilege_type, ',' order by g.privilege_type)) as v
            from information_schema.role_table_grants g
           where g.table_schema = 'storage' and g.grantee in ('anon', 'authenticated')
           group by g.grantee, g.table_name) q
         order by v collate "C"),
  array(select v from unnest(array[
    'anon|buckets|DELETE,INSERT,SELECT,UPDATE',
    'anon|buckets_analytics|DELETE,INSERT,SELECT,UPDATE',
    'anon|buckets_vectors|SELECT',
    'anon|iceberg_namespaces|SELECT',
    'anon|iceberg_tables|SELECT',
    'anon|objects|DELETE,INSERT,SELECT,UPDATE',
    'anon|s3_multipart_uploads|SELECT',
    'anon|s3_multipart_uploads_parts|SELECT',
    'anon|vector_indexes|SELECT',
    'authenticated|buckets|DELETE,INSERT,SELECT,UPDATE',
    'authenticated|buckets_analytics|DELETE,INSERT,SELECT,UPDATE',
    'authenticated|buckets_vectors|SELECT',
    'authenticated|iceberg_namespaces|SELECT',
    'authenticated|iceberg_tables|SELECT',
    'authenticated|objects|DELETE,INSERT,SELECT,UPDATE',
    'authenticated|s3_multipart_uploads|SELECT',
    'authenticated|s3_multipart_uploads_parts|SELECT',
    'authenticated|vector_indexes|SELECT'
  ]) v order by v collate "C"),
  'grant storage untuk anon/authenticated sama dengan baseline (migrasi tidak menambah grant)');

select is(
  (select count(*)::int from pg_policies where schemaname in ('storage', 'auth')),
  0, 'migrasi tidak menambah policy di skema storage/auth');

select * from finish();
rollback;
