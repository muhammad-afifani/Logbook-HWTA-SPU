-- =============================================================================
-- 07 REALTIME: perubahan data memicu broadcast publik TERSANITASI di topik
-- 'spu:public' — payload hanya {scope, at} (+ id pesan dari realtime.send), tanpa baris/PII.
-- =============================================================================
begin;
select plan(4);

select public.svc_create_submission(jsonb_build_object(
  'idempotency_key', '00000000-0000-4000-8000-000000000401',
  'entry_date', app_private.local_today(), 'source', 'Workshop Uji', 'sender_name', 'Uji Coba 07',
  'entity', 'PT Dummy', 'phone_e164', '+6281200000007',
  'confirm_sealed', true, 'confirm_no_leak', true, 'confirm_labeled', true,
  'items', jsonb_build_array(jsonb_build_object('waste_code', 'B105d', 'weight_kg', 150, 'package_count', 1))
), repeat('f', 64));

select ok(exists (select 1 from realtime.messages m where m.topic = 'spu:public' and m.event = 'changed'
                   and m.payload ->> 'scope' = 'submissions'),
  'kiriman baru memicu broadcast spu:public / changed');
select is((select bool_and(not m.private) from realtime.messages m where m.topic = 'spu:public'), true,
  'broadcast dikirim sebagai kanal publik (tanpa membuka tabel)');
select is(
  (select array_agg(distinct k order by k) from realtime.messages m, jsonb_object_keys(m.payload) k
    where m.topic = 'spu:public'),
  array['at', 'id', 'scope'],
  'payload hanya berisi scope, at, dan id pesan (id ditambahkan realtime.send sendiri)');
select ok(
  not exists (select 1 from realtime.messages m where m.topic = 'spu:public'
               and m.payload::text ~* '(Uji Coba|6281200000007|PT Dummy|B105d|kg)'),
  'payload tidak memuat nama, telepon, entity, kode limbah, atau kg');

select * from finish();
rollback;
