-- =============================================================================
-- 04 RLS PER PERAN: pengguna login tanpa profil / profil nonaktif tidak melihat apa pun;
-- petugas hanya membaca; admin mengubah master data; tulis operasional hanya via RPC.
-- Semua data dummy.
-- =============================================================================
begin;
select plan(18);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'petugas.uji@example.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'admin.uji@example.test'),
  ('00000000-0000-4000-8000-0000000000a3', 'tanpa.profil@example.test'),
  ('00000000-0000-4000-8000-0000000000a4', 'nonaktif@example.test');
insert into public.profiles (id, full_name, role, active) values
  ('00000000-0000-4000-8000-0000000000a1', 'Petugas Uji', 'officer', true),
  ('00000000-0000-4000-8000-0000000000a2', 'Admin Uji', 'admin', true),
  ('00000000-0000-4000-8000-0000000000a4', 'Petugas Nonaktif', 'officer', false);

select public.svc_create_submission(jsonb_build_object(
  'idempotency_key', '00000000-0000-4000-8000-000000000101',
  'entry_date', app_private.local_today(), 'source', 'Workshop Uji', 'sender_name', 'Uji Coba 02',
  'entity', 'PT Dummy', 'phone_e164', '+6281200000002',
  'confirm_sealed', true, 'confirm_no_leak', true, 'confirm_labeled', true,
  'items', jsonb_build_array(jsonb_build_object('waste_code', 'B105d', 'weight_kg', 150, 'package_count', 1))
), repeat('b', 64));

-- ---- login tanpa profil
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select is((select count(*)::int from public.submissions), 0, 'tanpa profil: 0 kiriman terlihat');
select is((select count(*)::int from public.waste_types), 0, 'tanpa profil: 0 master terlihat');
select is((select count(*)::int from public.profiles), 0, 'tanpa profil: 0 profil terlihat');
select throws_ok($$ select public.verify_submission((select null::uuid), 'reject', null, 'spam') $$,
  'LB003', null, 'tanpa profil: verify_submission ditolak (LB003)');
reset role;

-- ---- petugas nonaktif
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated"}';
select is((select count(*)::int from public.submissions), 0, 'petugas nonaktif: 0 kiriman terlihat');
reset role;

-- ---- petugas
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select is((select count(*)::int from public.submissions
            where idempotency_key = '00000000-0000-4000-8000-000000000101'), 1, 'petugas: melihat kiriman');
select is((select count(*)::int from public.waste_types), 22, 'petugas: melihat 22 jenis limbah');
select is((select count(*)::int from public.profiles), 1, 'petugas: hanya melihat profil sendiri');
select is((select count(*)::int from public.audit_log), 0, 'petugas: audit_log tidak terlihat (khusus admin)');
select throws_ok($$ insert into public.waste_types (code, name, group_code, default_packaging)
                    values ('X999', 'Uji', 'G1', 'drum200') $$,
  '42501', null, 'petugas: tidak bisa menambah master data');
select throws_ok($$ insert into public.submissions (ticket_code) values ('x') $$,
  '42501', null, 'petugas: tidak bisa INSERT langsung ke submissions (hanya via RPC)');
select throws_ok($$ insert into public.stock_movements (lot_id, type, qty_kg, qty_packages, occurred_on)
                    values (gen_random_uuid(), 'inbound', 1, 1, current_date) $$,
  '42501', null, 'petugas: tidak bisa INSERT langsung ke stock_movements');
update public.app_config set value = '99' where key = 'backdate_max_days';
select throws_ok($$ select public.svc_create_submission('{}'::jsonb, repeat('c', 64)) $$,
  '42501', null, 'petugas: tidak bisa memanggil fungsi service_role');
reset role;
select is((select value #>> '{}' from public.app_config where key = 'backdate_max_days'), '7',
  'petugas: UPDATE app_config tidak berefek (khusus admin)');

-- ---- admin
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
update public.waste_types set kg_per_package = 175 where code = 'B105d';
select is((select count(*)::int from public.profiles where id in (
              '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2',
              '00000000-0000-4000-8000-0000000000a4')), 3, 'admin: melihat semua profil (termasuk orang lain)');
select ok((select count(*) from public.audit_log) > 0, 'admin: melihat audit_log');
select throws_ok($$ delete from public.waste_types where code = 'B105d' $$,
  '42501', null, 'admin: hapus master ditolak (pakai kolom active)');
reset role;
select is((select kg_per_package from public.waste_types where code = 'B105d'), 175.00::numeric,
  'admin: bisa mengubah master data');

select * from finish();
rollback;
