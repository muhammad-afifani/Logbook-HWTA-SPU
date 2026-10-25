-- =============================================================================
-- 06 ALUR RPC: kirim (idempoten) → cek status tanpa PII → verifikasi → stok →
-- keluar FIFO → status publik. Semua data dummy.
-- =============================================================================
begin;
select plan(27);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000c1', 'petugas.rpc@example.test');
insert into public.profiles (id, full_name, role) values ('00000000-0000-4000-8000-0000000000c1', 'Petugas RPC', 'officer');

create temp table fx (k text primary key, v jsonb);
grant all on fx to authenticated;
insert into fx values ('today', to_jsonb(app_private.local_today()));

insert into fx select 'a', public.svc_create_submission(jsonb_build_object(
  'idempotency_key', '00000000-0000-4000-8000-000000000301',
  'entry_date', app_private.local_today() - 2, 'source', 'Workshop Uji', 'sender_name', 'Uji Coba 05',
  'entity', 'PT Dummy', 'phone_e164', '+6281200000005', 'photo_count', 2,
  'confirm_sealed', true, 'confirm_no_leak', true, 'confirm_labeled', true,
  'items', jsonb_build_array(
    jsonb_build_object('waste_code', 'B105d', 'weight_kg', 720, 'package_count', 4),
    jsonb_build_object('waste_code', 'B110d', 'weight_kg', 130))   -- jumlah kemasan kosong → estimasi
), repeat('e', 64));

-- ---- kiriman
select matches((select v ->> 'ticket_code' from fx where k = 'a'), '^SPU-[0-9]{4}-[0-9]{4}-[2-9A-HJKMNP-TV-Z]{4}$',
  'kode tiket SPU-YYMM-NNNN-XXXX');
select is((select (v ->> 'created')::boolean from fx where k = 'a'), true, 'kiriman baru dibuat');
select is((select jsonb_array_length(v -> 'photo_paths') from fx where k = 'a'), 2, '2 path foto disiapkan');
select is(
  (public.svc_create_submission(jsonb_build_object(
     'idempotency_key', '00000000-0000-4000-8000-000000000301', 'entry_date', app_private.local_today(),
     'items', '[]'::jsonb), repeat('e', 64)) ->> 'ticket_code'),
  (select v ->> 'ticket_code' from fx where k = 'a'),
  'kirim ulang dengan idempotency_key sama → tiket sama (aman bila koneksi putus)');
select is((select count(*)::int from public.submissions
            where idempotency_key = '00000000-0000-4000-8000-000000000301'), 1, 'kirim ulang tidak membuat duplikat');
select is((select package_count from public.submission_items
            where submission_id = (select (v ->> 'submission_id')::uuid from fx where k = 'a') and line_no = 2), 3,
  'jumlah kemasan kosong diestimasi ceil(130 / 60) = 3');
select is((select package_count_estimated from public.submission_items
            where submission_id = (select (v ->> 'submission_id')::uuid from fx where k = 'a') and line_no = 2), true,
  'item estimasi ditandai');
select is((select count(*)::int from public.suggestion_terms
            where approved and value in ('Workshop Uji', 'PT Dummy')), 0,
  'saran baru masuk sebagai usulan (belum disetujui)');

select throws_ok($$ select public.svc_create_submission(jsonb_build_object(
    'idempotency_key', gen_random_uuid(), 'entry_date', app_private.local_today() + 1, 'source', 'Workshop Uji', 'sender_name', 'Uji Coba 06', 'entity', 'PT Dummy', 'phone_e164', '+6281200000006', 'confirm_sealed', true, 'confirm_no_leak', true, 'confirm_labeled', true,
    'items', jsonb_build_array(jsonb_build_object('waste_code', 'B105d', 'weight_kg', 1))), repeat('e', 64)) $$,
  'LB002', null, 'tanggal masuk di masa depan ditolak');
select throws_ok($$ select public.svc_create_submission(jsonb_build_object(
    'idempotency_key', gen_random_uuid(), 'entry_date', app_private.local_today() - 8, 'source', 'Workshop Uji', 'sender_name', 'Uji Coba 06', 'entity', 'PT Dummy', 'phone_e164', '+6281200000006', 'confirm_sealed', true, 'confirm_no_leak', true, 'confirm_labeled', true,
    'items', jsonb_build_array(jsonb_build_object('waste_code', 'B105d', 'weight_kg', 1))), repeat('e', 64)) $$,
  'LB002', null, 'tanggal masuk lebih dari 7 hari lalu ditolak');
select throws_ok($$ select public.svc_create_submission(jsonb_build_object(
    'idempotency_key', gen_random_uuid(), 'entry_date', app_private.local_today(), 'source', 'Workshop Uji', 'sender_name', 'Uji Coba 06', 'entity', 'PT Dummy', 'phone_e164', '+6281200000006', 'confirm_sealed', true, 'confirm_no_leak', true, 'confirm_labeled', true,
    'items', jsonb_build_array(jsonb_build_object('waste_code', 'ZZZ', 'weight_kg', 1))), repeat('e', 64)) $$,
  'LB002', null, 'jenis limbah tak dikenal ditolak');

select throws_ok($$ select public.svc_create_submission(jsonb_build_object(
    'idempotency_key', gen_random_uuid(), 'entry_date', app_private.local_today(),
    'items', jsonb_build_array(jsonb_build_object('waste_code', 'B105d', 'weight_kg', 1))), repeat('e', 64)) $$,
  'LB002', null, 'header kosong (sumber/nama/entity/telepon/konfirmasi) ditolak LB002');

-- ---- cek status tanpa PII
select is(public.svc_ticket_status((select v ->> 'ticket_code' from fx where k = 'a')) ->> 'status', 'pending',
  'cek status: menunggu verifikasi');
select ok(
  not (public.svc_ticket_status((select v ->> 'ticket_code' from fx where k = 'a'))::text
       ~* '(sender_name|phone|Uji Coba 05|6281200000005|entity|PT Dummy|weight|ip_hash)'),
  'cek status tidak memuat nama, telepon, entity, berat, atau hash IP');
select is(public.svc_ticket_status('SPU-0000-0000-AAAA'), null, 'tiket tak dikenal → null');

-- ---- verifikasi
insert into fx values ('pct_before', public.public_status() -> 'capacity_pct'),
                      ('other_stock', to_jsonb(exists (select 1 from public.lot_stock where stock_kg > 0)));
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
select throws_ok($$ select public.verify_submission((select (v ->> 'submission_id')::uuid from fx where k = 'a'),
                                                    'reject', null, '') $$,
  'LB002', null, 'tolak tanpa alasan ditolak');
select throws_ok($$ select public.verify_submission((select (v ->> 'submission_id')::uuid from fx where k = 'a'),
                                                    'accept', '[]'::jsonb) $$,
  'LB002', null, 'terima tanpa hasil timbang semua item ditolak');
select lives_ok($$ select public.verify_submission(
    (select (v ->> 'submission_id')::uuid from fx where k = 'a'), 'accept',
    (select jsonb_agg(jsonb_build_object('item_id', i.id,
                                         'actual_weight_kg', case i.line_no when 1 then 700 else 120 end,
                                         'actual_package_count', i.package_count))
       from public.submission_items i
      where i.submission_id = (select (v ->> 'submission_id')::uuid from fx where k = 'a'))) $$,
  'terima dengan hasil timbang aktual');
reset role;
create temp view fx_lots as
  select l.* from public.lots l join public.submission_items i on i.id = l.submission_item_id
   where i.submission_id = (select (v ->> 'submission_id')::uuid from fx where k = 'a');
grant select on fx_lots to authenticated;

select is((select count(*)::int from fx_lots), 2, '1 lot per item');
select matches((select lot_code from fx_lots l join public.waste_types w on w.id = l.waste_type_id
                 where w.code = 'B105d'), '^L[0-9]{4}-B105d-[0-9]{4}$', 'kode lot L<YYMM>-<kode>-NNNN');
select is((select array_agg(distinct expires_on - received_on) from fx_lots), array[30], 'kedaluwarsa = terima + 30 hari');
select is((select array_agg(distinct received_on) from fx_lots), array[app_private.local_today() - 2],
  'tanggal terima lot = tanggal masuk kiriman');
select is((select sum(stock_kg) from public.lot_stock where lot_id in (select id from fx_lots)),
  820.00::numeric, 'stok = 700 + 120 kg');

-- ---- status publik
select is((public.public_status() ->> 'has_waste')::boolean, true, 'publik: ada limbah');
-- Nilai pasti hanya bisa diuji pada DB tanpa stok lain; selain itu cek monoton naik.
select case when (select (v)::boolean from fx where k = 'other_stock')
  then cmp_ok((public.public_status() ->> 'capacity_pct')::int, '>=', (select (v)::int from fx where k = 'pct_before'),
              'publik: persen kapasitas tidak turun setelah stok bertambah (DB berisi stok lain)')
  else is((public.public_status() ->> 'capacity_pct')::int, 5,
          'publik: persen kapasitas = round(100 x (1 + 1) / 42) = 5')
end;

-- ---- keluar
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
select throws_ok($$ select public.create_outbound(
    jsonb_build_object('out_date', (select v #>> '{}' from fx where k = 'today'), 'transporter', 'PT Angkut Dummy',
                       'destination', 'Pengolah Dummy', 'manifest_no', 'MNF-UJI-1', 'vehicle_no', 'kt 1234 xx'),
    jsonb_build_array(jsonb_build_object('lot_id', (select id from fx_lots order by lot_code limit 1),
                                         'qty_kg', 999999, 'qty_packages', 0))) $$,
  'LB002', null, 'keluar melebihi stok ditolak');
select matches(public.create_outbound(
    jsonb_build_object('out_date', (select v #>> '{}' from fx where k = 'today'), 'transporter', 'PT Angkut Dummy',
                       'destination', 'Pengolah Dummy', 'manifest_no', 'MNF-UJI-2', 'vehicle_no', 'kt 1234 xx'),
    (select jsonb_agg(jsonb_build_object('lot_id', ls.lot_id, 'qty_kg', ls.stock_kg, 'qty_packages', ls.stock_packages))
       from public.lot_stock ls where ls.lot_id in (select id from fx_lots))) ->> 'doc_code',
  '^OUT-[0-9]{4}-[0-9]{4}$', 'keluar semua lot → kode dokumen OUT-YYMM-NNNN');
reset role;

select * from finish();
rollback;
