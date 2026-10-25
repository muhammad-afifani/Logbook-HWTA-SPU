-- =============================================================================
-- 05 RPC.
--   anon          : ping(), public_status()                 — HANYA dua ini.
--   authenticated : verify_submission, create_outbound, correct_movement,
--                   officer_list_photos (masing-masing cek is_officer()).
--   service_role  : svc_* — dipanggil Edge Functions (submit-waste, check-status,
--                   form-options). Tidak bisa dipanggil anon/authenticated.
-- Kode error: LB002 = validasi, LB003 = tidak berwenang, LB004 = rate limit/duplikat.
-- =============================================================================

-- ---------------------------------------------------------------- helper internal
create function app_private.cfg(p_key text, p_default jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.value from public.app_config c where c.key = p_key), p_default)
$$;

create function app_private.local_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone (app_private.cfg('timezone', '"Asia/Makassar"') #>> '{}'))::date
$$;

create function app_private.next_counter(p_kind text, p_period text)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  insert into app_private.counters as c (kind, period, last_value)
  values (p_kind, p_period, 1)
  on conflict (kind, period) do update set last_value = c.last_value + 1
  returning c.last_value
$$;

-- Sufiks acak tanpa karakter ambigu (tanpa 0/O/1/I/L/U). Rejection sampling: tanpa bias modulo.
create function app_private.random_suffix(p_len integer)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ'; -- 30 karakter
  out_text text := '';
  b integer;
begin
  while length(out_text) < p_len loop
    b := get_byte(extensions.gen_random_bytes(1), 0);
    if b < 240 then -- 240 = 8 x 30
      out_text := out_text || substr(alphabet, (b % 30) + 1, 1);
    end if;
  end loop;
  return out_text;
end;
$$;

create function app_private.require_officer()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_officer() then
    raise exception 'Hanya petugas SPU yang berwenang.' using errcode = 'LB003';
  end if;
end;
$$;

-- ---------------------------------------------------------------- PUBLIK (anon)
create function public.ping()
returns text
language sql
stable
set search_path = ''
as $$ select 'ok'::text $$;

/**
 * Status publik: HANYA persen kapasitas (bulat) dan ada/tidak ada limbah.
 * Tanpa kg, jumlah drum, lot, jenis, nama, telepon.
 * Slot terpakai: dari slot_units aktif bila sudah ada penempatan (Fase 5);
 * sebelum itu estimasi ceil(kemasan tersisa / unit per pallet) per lot.
 */
create function public.public_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  total_slots integer;
  used_slots integer;
  stock_exists boolean;
  last_change timestamptz;
begin
  select count(*) into total_slots from public.pallet_slots s where s.active;
  if total_slots = 0 then
    total_slots := (app_private.cfg('capacity_slots_total', '42') #>> '{}')::integer;
  end if;

  if exists (select 1 from public.slot_units u where u.removed_at is null) then
    select count(distinct u.slot_id) into used_slots from public.slot_units u where u.removed_at is null;
  else
    select coalesce(sum(
             case when ls.stock_packages > 0
                  then ceil(ls.stock_packages::numeric / p.units_per_pallet)
                  else 1 end), 0)::integer
      into used_slots
      from public.lot_stock ls
      join public.packaging_types p on p.code = ls.packaging_code
     where ls.stock_kg > 0;
  end if;

  select exists (select 1 from public.lot_stock ls where ls.stock_kg > 0) into stock_exists;
  select max(m.created_at) into last_change from public.stock_movements m;

  return jsonb_build_object(
    'capacity_pct', case when total_slots > 0
                         then least(100, round(100.0 * used_slots / total_slots))::integer
                         else 0 end,
    'has_waste', stock_exists,
    'updated_at', last_change
  );
end;
$$;

-- ---------------------------------------------------------------- SERVICE ROLE (Edge Functions)
create function public.svc_rate_limit(p_ip_hash text, p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  win timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'ip_hash tidak valid' using errcode = 'LB002';
  end if;
  delete from app_private.rate_limits r where r.window_start < now() - interval '2 days';
  insert into app_private.rate_limits as r (ip_hash, bucket, window_start, hits)
  values (p_ip_hash, p_bucket, win, 1)
  on conflict (ip_hash, bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into n;
  return n <= p_limit;
end;
$$;

create function public.svc_form_options()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'site', 'SPU',
    'backdate_max_days', app_private.cfg('backdate_max_days', '7'),
    'timezone', app_private.cfg('timezone', '"Asia/Makassar"'),
    'today', app_private.local_today(),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object(
                 'code', g.code, 'name', g.name, 'color_dark', g.color_dark,
                 'color_light', g.color_light) order by g.sort), '[]')
               from public.waste_groups g where g.active),
    'waste_types', (select coalesce(jsonb_agg(jsonb_build_object(
                 'code', w.code, 'name', w.name, 'group_code', w.group_code,
                 'default_packaging', w.default_packaging, 'kg_per_package', w.kg_per_package)
                 order by w.code), '[]')
               from public.waste_types w where w.active),
    'packaging_types', (select coalesce(jsonb_agg(jsonb_build_object(
                 'code', p.code, 'name', p.name) order by p.sort), '[]')
               from public.packaging_types p where p.active),
    'suggestions', jsonb_build_object(
      'source', (select coalesce(jsonb_agg(t.value order by lower(t.value)), '[]')
                 from public.suggestion_terms t where t.kind = 'source' and t.approved),
      'entity', (select coalesce(jsonb_agg(t.value order by lower(t.value)), '[]')
                 from public.suggestion_terms t where t.kind = 'entity' and t.approved))
  )
$$;

/**
 * Buat kiriman publik (dipanggil Edge Function submit-waste SETELAH verifikasi Turnstile,
 * validasi skema, dan rate limit). Idempoten via idempotency_key: kunci sama = tiket sama.
 */
create function public.svc_create_submission(p jsonb, p_ip_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing public.submissions;
  sub public.submissions;
  today date := app_private.local_today();
  backdate integer := (app_private.cfg('backdate_max_days', '7') #>> '{}')::integer;
  v_entry date;
  period text;
  seq integer;
  item jsonb;
  line integer := 0;
  wt public.waste_types;
  pkg text;
  cnt integer;
  est boolean;
  kg numeric;
  photos integer;
  paths text[] := '{}';
  i integer;
begin
  -- Idempotensi: kirim ulang setelah koneksi putus mengembalikan tiket yang sama.
  select * into existing from public.submissions s
   where s.idempotency_key = (p ->> 'idempotency_key')::uuid;
  if found then
    select coalesce(array_agg(ph.storage_path order by ph.storage_path), '{}') into paths
      from public.submission_photos ph where ph.submission_id = existing.id;
    return jsonb_build_object('submission_id', existing.id, 'ticket_code', existing.ticket_code,
                              'created', false, 'photo_paths', to_jsonb(paths));
  end if;

  -- Validasi header sebelum insert (lapis akhir; Edge Function sudah memvalidasi lebih ramah).
  if length(trim(coalesce(p ->> 'source', ''))) not between 2 and 120
     or length(trim(coalesce(p ->> 'sender_name', ''))) not between 2 and 120
     or length(trim(coalesce(p ->> 'entity', ''))) not between 2 and 120 then
    raise exception 'Sumber, nama pengirim, dan entity wajib diisi (2–120 karakter).' using errcode = 'LB002';
  end if;
  if coalesce(p ->> 'phone_e164', '') !~ '^\+62[0-9]{8,13}$' then
    raise exception 'Nomor telepon harus format +62.' using errcode = 'LB002';
  end if;
  if not (coalesce((p ->> 'confirm_sealed')::boolean, false)
          and coalesce((p ->> 'confirm_no_leak')::boolean, false)
          and coalesce((p ->> 'confirm_labeled')::boolean, false)) then
    raise exception 'Ketiga konfirmasi kemasan wajib dicentang.' using errcode = 'LB002';
  end if;

  v_entry := (p ->> 'entry_date')::date;
  if v_entry is null or v_entry > today or v_entry < today - backdate then
    raise exception 'Tanggal masuk harus antara % dan %.', today - backdate, today using errcode = 'LB002';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array'
     or jsonb_array_length(p -> 'items') not between 1 and 20 then
    raise exception 'Jumlah item limbah harus 1–20.' using errcode = 'LB002';
  end if;
  photos := coalesce((p ->> 'photo_count')::integer, 0);
  if photos not between 0 and 3 then
    raise exception 'Foto maksimal 3.' using errcode = 'LB002';
  end if;

  period := to_char(today, 'YYMM');
  seq := app_private.next_counter('ticket', period);
  if seq > 9999 then
    raise exception 'Nomor tiket bulan ini habis.' using errcode = 'LB002';
  end if;

  insert into public.submissions (
    ticket_code, entry_date, source, sender_name, entity, phone_e164, notes,
    confirm_sealed, confirm_no_leak, confirm_labeled, photo_count, idempotency_key, ip_hash)
  values (
    format('SPU-%s-%s-%s', period, lpad(seq::text, 4, '0'), app_private.random_suffix(4)),
    v_entry, trim(p ->> 'source'), trim(p ->> 'sender_name'), trim(p ->> 'entity'),
    p ->> 'phone_e164', nullif(trim(p ->> 'notes'), ''),
    coalesce((p ->> 'confirm_sealed')::boolean, false),
    coalesce((p ->> 'confirm_no_leak')::boolean, false),
    coalesce((p ->> 'confirm_labeled')::boolean, false),
    photos, (p ->> 'idempotency_key')::uuid, p_ip_hash)
  returning * into sub;

  for item in select * from jsonb_array_elements(p -> 'items') loop
    line := line + 1;
    select * into wt from public.waste_types w where w.code = item ->> 'waste_code' and w.active;
    if not found then
      raise exception 'Jenis limbah % tidak dikenal.', item ->> 'waste_code' using errcode = 'LB002';
    end if;
    pkg := coalesce(nullif(item ->> 'packaging_code', ''), wt.default_packaging);
    if not exists (select 1 from public.packaging_types pt where pt.code = pkg and pt.active) then
      raise exception 'Jenis kemasan % tidak dikenal.', pkg using errcode = 'LB002';
    end if;
    kg := (item ->> 'weight_kg')::numeric;
    cnt := nullif(item ->> 'package_count', '')::integer;
    est := cnt is null;
    if est then
      cnt := greatest(1, ceil(kg / coalesce(wt.kg_per_package, kg))::integer);
    end if;
    insert into public.submission_items (submission_id, line_no, waste_type_id, packaging_code,
                                         package_count, package_count_estimated, weight_kg)
    values (sub.id, line, wt.id, pkg, cnt, est, kg);
  end loop;

  for i in 1..photos loop
    paths := paths || format('submissions/%s/%s.webp', sub.id, i);
    insert into public.submission_photos (submission_id, storage_path)
    values (sub.id, format('submissions/%s/%s.webp', sub.id, i));
  end loop;

  -- Usulan saran combobox (belum disetujui; tidak tampil publik sampai petugas setuju).
  insert into public.suggestion_terms (kind, value) values ('source', trim(p ->> 'source'))
    on conflict do nothing;
  insert into public.suggestion_terms (kind, value) values ('entity', trim(p ->> 'entity'))
    on conflict do nothing;

  return jsonb_build_object('submission_id', sub.id, 'ticket_code', sub.ticket_code,
                            'created', true, 'photo_paths', to_jsonb(paths));
end;
$$;

/** Status tiket untuk halaman "Cek status": TANPA data pribadi dan tanpa kg. */
create function public.svc_ticket_status(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ticket_code', s.ticket_code,
    'status', s.status,
    'reject_reason', s.reject_reason,
    'entry_date', s.entry_date,
    'submitted_at', s.submitted_at,
    'verified_at', s.verified_at,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                 'waste_code', w.code, 'waste_name', w.name,
                 'package_count', i.package_count, 'packaging', pt.name) order by i.line_no), '[]')
              from public.submission_items i
              join public.waste_types w on w.id = i.waste_type_id
              join public.packaging_types pt on pt.code = i.packaging_code
             where i.submission_id = s.id))
  from public.submissions s
  where s.ticket_code = upper(trim(p_code))
$$;

-- ---------------------------------------------------------------- PETUGAS (authenticated)
/**
 * Verifikasi kiriman. accept: p_items = [{item_id, actual_weight_kg, actual_package_count}]
 * untuk SEMUA item → buat lot + movement inbound per item. reject: alasan wajib.
 * Tanggal terima lot = tanggal masuk kiriman (jam simpan mulai saat limbah masuk SPU).
 */
create function public.verify_submission(
  p_submission_id uuid, p_decision text, p_items jsonb default null, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  sub public.submissions;
  officer uuid := auth.uid();
  officer_name text;
  it record;
  inp jsonb;
  default_days integer := (app_private.cfg('default_storage_days', '30') #>> '{}')::integer;
  new_lot public.lots;
  lot_ids uuid[] := '{}';
  period text;
begin
  perform app_private.require_officer();
  officer_name := app_private.current_officer_name();

  select * into sub from public.submissions s where s.id = p_submission_id for update;
  if not found then
    raise exception 'Kiriman tidak ditemukan.' using errcode = 'LB002';
  end if;
  if sub.status <> 'pending' then
    raise exception 'Kiriman % sudah %.', sub.ticket_code, sub.status using errcode = 'LB002';
  end if;

  if p_decision = 'reject' then
    if p_reason is null or length(trim(p_reason)) < 3 then
      raise exception 'Alasan penolakan wajib diisi.' using errcode = 'LB002';
    end if;
    update public.submissions
       set status = 'rejected', reject_reason = trim(p_reason), verified_by = officer,
           verified_by_name = officer_name, verified_at = now()
     where id = sub.id;
    return jsonb_build_object('status', 'rejected', 'lot_ids', '[]'::jsonb);
  elsif p_decision <> 'accept' then
    raise exception 'Keputusan harus accept atau reject.' using errcode = 'LB002';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) <> (select count(*) from public.submission_items i where i.submission_id = sub.id) then
    raise exception 'Hasil timbang wajib diisi untuk semua item.' using errcode = 'LB002';
  end if;

  for it in
    select i.*, w.code as waste_code, w.storage_days
      from public.submission_items i
      join public.waste_types w on w.id = i.waste_type_id
     where i.submission_id = sub.id
     order by i.line_no
  loop
    inp := null;
    select e into inp from jsonb_array_elements(p_items) e where (e ->> 'item_id')::uuid = it.id;
    if inp is null then
      raise exception 'Hasil timbang item % belum diisi.', it.line_no using errcode = 'LB002';
    end if;
    if coalesce((inp ->> 'actual_weight_kg')::numeric, 0) <= 0
       or coalesce((inp ->> 'actual_package_count')::integer, -1) < 0 then
      raise exception 'Berat aktual item % harus > 0 dan jumlah kemasan >= 0.', it.line_no
        using errcode = 'LB002';
    end if;

    update public.submission_items
       set actual_weight_kg = (inp ->> 'actual_weight_kg')::numeric,
           actual_package_count = (inp ->> 'actual_package_count')::integer
     where id = it.id;

    period := to_char(sub.entry_date, 'YYMM');
    insert into public.lots (lot_code, site, submission_item_id, waste_type_id, packaging_code,
                             received_on, expires_on, initial_kg, initial_packages,
                             created_by, created_by_name)
    values (
      format('L%s-%s-%s', period, it.waste_code,
             lpad(app_private.next_counter('lot', period)::text, 4, '0')),
      sub.site, it.id, it.waste_type_id, it.packaging_code,
      sub.entry_date, sub.entry_date + coalesce(it.storage_days, default_days),
      (inp ->> 'actual_weight_kg')::numeric, (inp ->> 'actual_package_count')::integer,
      officer, officer_name)
    returning * into new_lot;

    insert into public.stock_movements (lot_id, type, qty_kg, qty_packages, occurred_on,
                                        created_by, created_by_name)
    values (new_lot.id, 'inbound', new_lot.initial_kg, new_lot.initial_packages,
            new_lot.received_on, officer, officer_name);
    lot_ids := lot_ids || new_lot.id;
  end loop;

  update public.submissions
     set status = 'verified', verified_by = officer, verified_by_name = officer_name, verified_at = now()
   where id = sub.id;

  return jsonb_build_object('status', 'verified', 'lot_ids', to_jsonb(lot_ids));
end;
$$;

/**
 * Limbah keluar. p_header = {out_date, transporter, destination, manifest_no, vehicle_no, notes}
 * p_items = [{lot_id, qty_kg, qty_packages}] (FIFO disarankan UI). Stok dicek dengan lot terkunci.
 */
create function public.create_outbound(p_header jsonb, p_items jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  officer uuid := auth.uid();
  officer_name text;
  v_out_date date := (p_header ->> 'out_date')::date;
  ob public.outbound;
  inp jsonb;
  lot public.lots;
  st record;
  oi public.outbound_items;
  period text;
begin
  perform app_private.require_officer();
  officer_name := app_private.current_officer_name();

  if v_out_date is null or v_out_date > app_private.local_today() then
    raise exception 'Tanggal keluar wajib dan tidak boleh di masa depan.' using errcode = 'LB002';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pilih minimal satu lot.' using errcode = 'LB002';
  end if;

  -- Kunci lot yang terlibat (urutan tetap mencegah deadlock).
  perform 1 from public.lots l
   where l.id in (select (e ->> 'lot_id')::uuid from jsonb_array_elements(p_items) e)
   order by l.id for update;

  period := to_char(v_out_date, 'YYMM');
  insert into public.outbound (doc_code, out_date, transporter, destination, manifest_no, vehicle_no,
                               notes, created_by, created_by_name)
  values (
    format('OUT-%s-%s', period, lpad(app_private.next_counter('outbound', period)::text, 4, '0')),
    v_out_date, trim(p_header ->> 'transporter'), trim(p_header ->> 'destination'),
    trim(p_header ->> 'manifest_no'), upper(trim(p_header ->> 'vehicle_no')),
    nullif(trim(p_header ->> 'notes'), ''), officer, officer_name)
  returning * into ob;

  for inp in select * from jsonb_array_elements(p_items) loop
    select * into lot from public.lots l where l.id = (inp ->> 'lot_id')::uuid;
    if not found then
      raise exception 'Lot tidak ditemukan.' using errcode = 'LB002';
    end if;
    if v_out_date < lot.received_on then
      raise exception 'Tanggal keluar lebih awal dari tanggal terima lot %.', lot.lot_code
        using errcode = 'LB002';
    end if;
    select ls.stock_kg, ls.stock_packages into st from public.lot_stock ls where ls.lot_id = lot.id;
    if (inp ->> 'qty_kg')::numeric <= 0
       or (inp ->> 'qty_kg')::numeric > st.stock_kg
       or coalesce((inp ->> 'qty_packages')::integer, 0) < 0
       or coalesce((inp ->> 'qty_packages')::integer, 0) > st.stock_packages then
      raise exception 'Jumlah keluar lot % melebihi stok (% kg, % kemasan).',
        lot.lot_code, st.stock_kg, st.stock_packages using errcode = 'LB002';
    end if;

    insert into public.outbound_items (outbound_id, lot_id, qty_kg, qty_packages)
    values (ob.id, lot.id, (inp ->> 'qty_kg')::numeric, coalesce((inp ->> 'qty_packages')::integer, 0))
    returning * into oi;

    insert into public.stock_movements (lot_id, type, qty_kg, qty_packages, occurred_on,
                                        outbound_item_id, created_by, created_by_name)
    values (lot.id, 'outbound', -oi.qty_kg, -oi.qty_packages, v_out_date, oi.id, officer, officer_name);
  end loop;

  return jsonb_build_object('outbound_id', ob.id, 'doc_code', ob.doc_code);
end;
$$;

/** Koreksi = movement baru (selisih bertanda) yang mereferensikan movement asal. */
create function public.correct_movement(
  p_movement_id bigint, p_qty_kg numeric, p_qty_packages integer, p_reason text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  orig public.stock_movements;
  st record;
  new_id bigint;
begin
  perform app_private.require_officer();
  select * into orig from public.stock_movements m where m.id = p_movement_id;
  if not found then
    raise exception 'Movement asal tidak ditemukan.' using errcode = 'LB002';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Alasan koreksi wajib diisi.' using errcode = 'LB002';
  end if;
  perform 1 from public.lots l where l.id = orig.lot_id for update;
  select ls.stock_kg, ls.stock_packages into st from public.lot_stock ls where ls.lot_id = orig.lot_id;
  if st.stock_kg + coalesce(p_qty_kg, 0) < 0 or st.stock_packages + coalesce(p_qty_packages, 0) < 0 then
    raise exception 'Koreksi membuat stok negatif.' using errcode = 'LB002';
  end if;

  insert into public.stock_movements (lot_id, type, qty_kg, qty_packages, occurred_on,
                                      corrects_movement_id, reason, created_by, created_by_name)
  values (orig.lot_id, 'correction', coalesce(p_qty_kg, 0), coalesce(p_qty_packages, 0),
          app_private.local_today(), orig.id, trim(p_reason), auth.uid(),
          app_private.current_officer_name())
  returning id into new_id;
  return new_id;
end;
$$;

/** Path foto kiriman — dipakai Edge Function photo-url (dengan JWT petugas) sebelum signing. */
create function public.officer_list_photos(p_submission_id uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.require_officer();
  return query select ph.storage_path from public.submission_photos ph
                where ph.submission_id = p_submission_id order by ph.storage_path;
end;
$$;

-- ---------------------------------------------------------------- PRIVILESE FUNGSI
-- Sapu: cabut EXECUTE dari PUBLIC/anon/authenticated untuk semua fungsi, lalu beri eksplisit.
-- (Ini REVOKE pada objek yang ada, bukan perubahan default privileges.)
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app_private from public, anon, authenticated;

grant execute on function public.ping() to anon, authenticated;
grant execute on function public.public_status() to anon, authenticated;

grant execute on function public.verify_submission(uuid, text, jsonb, text) to authenticated;
grant execute on function public.create_outbound(jsonb, jsonb) to authenticated;
grant execute on function public.correct_movement(bigint, numeric, integer, text) to authenticated;
grant execute on function public.officer_list_photos(uuid) to authenticated;
grant execute on function app_private.is_officer() to authenticated;
grant execute on function app_private.is_admin() to authenticated;

grant execute on function public.svc_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.svc_form_options() to service_role;
grant execute on function public.svc_create_submission(jsonb, text) to service_role;
grant execute on function public.svc_ticket_status(text) to service_role;
