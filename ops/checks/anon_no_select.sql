-- =============================================================================
-- Pemeriksaan hak ANON (hanya baca) — jalankan di SQL Editor Supabase atau:
--   psql "$DB_URL" -f ops/checks/anon_no_select.sql
-- Setiap blok "PELANGGARAN" harus 0 baris. Versi pgTAP: supabase/tests/database/01–03.
--
-- Catatan perbedaan Supabase vs Postgres polos (dibuktikan Fase 1):
--   Default privileges Supabase SENGAJA memberi anon hak pada objek BARU di `public`
--   (dan `storage`). Proyek ini tidak mengubahnya (syarat 2); setiap migrasi me-REVOKE
--   per objek. Karena itu pemeriksaan "default privileges tidak memberi anon" dari Fase 0
--   pasti gagal di Supabase dan diganti blok 1 (hak efektif) + blok 5 (informasi).
-- =============================================================================

\echo '== 1. PELANGGARAN: relasi yang bisa di-SELECT/ditulis anon (public, graphql_public, app_private)'
select n.nspname as skema, c.relname as relasi, c.relkind,
       has_table_privilege('anon', c.oid, 'SELECT') as sel,
       has_table_privilege('anon', c.oid, 'INSERT') as ins
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p', 'v', 'm', 'f')
  and n.nspname in ('public', 'graphql_public', 'app_private')
  and (has_table_privilege('anon', c.oid, 'SELECT') or has_any_column_privilege('anon', c.oid, 'SELECT')
       or has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE'))
order by 1, 2;

\echo '== 2. PELANGGARAN: tabel tanpa RLS (public, app_private)'
select n.nspname as skema, c.relname as tabel
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'app_private') and c.relkind in ('r', 'p') and not c.relrowsecurity;

\echo '== 3. PELANGGARAN: fungsi yang bisa dieksekusi anon selain ping & public_status'
select n.nspname as skema, p.proname as fungsi
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'app_private')
  and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname not in ('ping', 'public_status');

\echo '== 4. PELANGGARAN: bucket publik atau policy apa pun di storage.objects'
select 'bucket publik' as jenis, id as nama from storage.buckets where public
union all
select 'policy storage', policyname from pg_policies where schemaname = 'storage' and tablename = 'objects';

\echo '== 5. INFORMASI: default privileges untuk anon di public/storage (bawaan Supabase, tidak diubah)'
select d.defaclrole::regrole as pemilik, d.defaclnamespace::regnamespace as skema,
       d.defaclobjtype as jenis, d.defaclacl
from pg_default_acl d
where d.defaclnamespace::regnamespace::text in ('public', 'storage')
order by 1, 2, 3;
