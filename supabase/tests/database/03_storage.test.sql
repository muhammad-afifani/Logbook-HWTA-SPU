-- =============================================================================
-- 03 STORAGE: bucket foto privat; anon & authenticated tidak bisa SELECT/INSERT
-- storage.objects (tanpa policy → RLS menolak). Signed URL hanya dari Edge Function
-- (service_role) — dibuktikan via HTTP di ops/checks/anon-curl.sh.
-- =============================================================================
begin;
select plan(10);

select is((select public from storage.buckets where id = 'submission-photos'), false,
  'bucket submission-photos privat (public = false)');
select is((select public from storage.buckets where id = 'outbound-docs'), false,
  'bucket outbound-docs privat (public = false)');
select is((select count(*)::int from storage.buckets where public), 0, 'tidak ada bucket publik sama sekali');
select is((select file_size_limit::int from storage.buckets where id = 'submission-photos'), 1048576,
  'foto dibatasi 1 MB (sudah dikompres di browser)');

-- Objek dummy (dibuat sebagai postgres, setara upload via signed URL).
insert into storage.objects (bucket_id, name)
values ('submission-photos', 'submissions/00000000-0000-4000-8000-0000000000aa/1.webp');

insert into auth.users (id, email) values
  ('22222222-2222-4222-8222-222222222222', 'petugas.storage@example.test');
insert into public.profiles (id, full_name, role) values
  ('22222222-2222-4222-8222-222222222222', 'Petugas Uji Storage', 'officer');

set local role anon;
select is((select count(*)::int from storage.objects), 0, 'anon: SELECT storage.objects → 0 baris');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('submission-photos', 'submissions/x/2.webp') $$,
  '42501', null, 'anon: INSERT storage.objects ditolak RLS');
select is((select count(*)::int from storage.buckets), 0, 'anon: daftar bucket pun tidak terlihat');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from storage.objects), 0,
  'petugas: SELECT langsung storage.objects → 0 baris (signed URL hanya via Edge Function)');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('submission-photos', 'submissions/x/3.webp') $$,
  '42501', null, 'petugas: INSERT langsung storage.objects ditolak');
reset role;

select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'), 0,
  'tidak ada policy apa pun di storage.objects');

select * from finish();
rollback;
