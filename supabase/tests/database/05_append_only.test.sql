-- =============================================================================
-- 05 APPEND-ONLY: data terverifikasi tidak bisa UPDATE/DELETE/TRUNCATE, bahkan oleh
-- service_role dan postgres. Koreksi = movement baru. Kiriman pending boleh dihapus.
-- =============================================================================
begin;
select plan(17);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000b1', 'petugas.ao@example.test');
insert into public.profiles (id, full_name, role) values ('00000000-0000-4000-8000-0000000000b1', 'Petugas AO', 'officer');

create temp table fx (k text primary key, v text);
grant all on fx to authenticated, service_role;
insert into fx select 'sub', public.svc_create_submission(jsonb_build_object(
  'idempotency_key', '00000000-0000-4000-8000-000000000201',
  'entry_date', app_private.local_today(), 'source', 'Workshop Uji', 'sender_name', 'Uji Coba 03',
  'entity', 'PT Dummy', 'phone_e164', '+6281200000003',
  'confirm_sealed', true, 'confirm_no_leak', true, 'confirm_labeled', true,
  'items', jsonb_build_array(jsonb_build_object('waste_code', 'B105d', 'weight_kg', 400, 'package_count', 2))
), repeat('d', 64)) ->> 'submission_id';
insert into fx select 'pending', public.svc_create_submission(jsonb_build_object(
  'idempotency_key', '00000000-0000-4000-8000-000000000202',
  'entry_date', app_private.local_today(), 'source', 'Workshop Uji', 'sender_name', 'Uji Coba 04',
  'entity', 'PT Dummy', 'phone_e164', '+6281200000004',
  'confirm_sealed', true, 'confirm_no_leak', true, 'confirm_labeled', true,
  'items', jsonb_build_array(jsonb_build_object('waste_code', 'A108d', 'weight_kg', 50, 'package_count', 1))
), repeat('d', 64)) ->> 'submission_id';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select public.verify_submission((select v::uuid from fx where k = 'sub'), 'accept',
  (select jsonb_agg(jsonb_build_object('item_id', i.id, 'actual_weight_kg', 390, 'actual_package_count', 2))
     from public.submission_items i where i.submission_id = (select v::uuid from fx where k = 'sub')));
reset role;
insert into fx select 'lot', l.id::text from public.lots l
  join public.submission_items i on i.id = l.submission_item_id
 where i.submission_id = (select v::uuid from fx where k = 'sub');
insert into fx select 'mv', min(m.id)::text from public.stock_movements m
 where m.lot_id = (select v::uuid from fx where k = 'lot');

select is((select stock_kg from public.lot_stock where lot_id = (select v::uuid from fx where k = 'lot')),
  390.00::numeric, 'stok awal 390 kg dari movement inbound');

-- postgres (pemilik tabel) tetap ditolak trigger
select throws_ok($$ update public.stock_movements set qty_kg = 1 $$, 'LB001', null, 'UPDATE stock_movements ditolak');
select throws_ok($$ delete from public.stock_movements $$, 'LB001', null, 'DELETE stock_movements ditolak');
select throws_ok($$ truncate public.stock_movements cascade $$, 'LB001', null, 'TRUNCATE stock_movements ditolak');
select throws_ok($$ update public.lots set initial_kg = 1 $$, 'LB001', null, 'UPDATE lots ditolak');
select throws_ok($$ delete from public.lots $$, 'LB001', null, 'DELETE lots ditolak');
select throws_ok($$ update public.audit_log set action = 'INSERT' $$, 'LB001', null, 'UPDATE audit_log ditolak');
select throws_ok($$ delete from public.audit_log $$, 'LB001', null, 'DELETE audit_log ditolak');
select throws_ok($$ update public.submissions set sender_name = 'Ubah' where status = 'verified' $$,
  'LB001', null, 'UPDATE kiriman terverifikasi ditolak');
select throws_ok($$ delete from public.submissions where status = 'verified' $$,
  'LB001', null, 'DELETE kiriman terverifikasi ditolak');
select throws_ok($$ update public.submission_items set weight_kg = 1
                    where submission_id = (select v::uuid from fx where k = 'sub') $$,
  'LB001', null, 'UPDATE item kiriman terverifikasi ditolak');

-- service_role (BYPASSRLS) juga ditolak trigger
set local role service_role;
select throws_ok($$ update public.stock_movements set qty_kg = 1 $$, 'LB001', null,
  'service_role: UPDATE stock_movements tetap ditolak');
select throws_ok($$ delete from public.lots $$, 'LB001', null, 'service_role: DELETE lots tetap ditolak');
reset role;

-- Kiriman pending (mis. spam) boleh dihapus; item ikut terhapus.
delete from public.submissions where id = (select v::uuid from fx where k = 'pending');
select is((select count(*)::int from public.submission_items
            where submission_id = (select v::uuid from fx where k = 'pending')), 0,
  'kiriman pending bisa dihapus beserta itemnya');

-- Koreksi = movement baru
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select lives_ok($$ select public.correct_movement((select v::bigint from fx where k = 'mv'), -10, 0,
                                                  'Salah input timbangan (uji)') $$,
  'koreksi via correct_movement berhasil');
select throws_ok($$ select public.correct_movement((select v::bigint from fx where k = 'mv'), -1000, 0,
                                                   'Uji stok negatif') $$,
  'LB002', null, 'koreksi yang membuat stok negatif ditolak');
reset role;
select is((select stock_kg from public.lot_stock where lot_id = (select v::uuid from fx where k = 'lot')), 380.00::numeric,
  'stok = SUM(movements): 390 - 10 = 380 kg, movement asal tetap utuh');

select * from finish();
rollback;
