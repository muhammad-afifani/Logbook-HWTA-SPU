-- =============================================================================
-- 08 PENGERASAN KIRIMAN PUBLIK (submit-waste).
--   service_role : svc_find_submission(uuid) — BARU. Cari kiriman lewat idempotency_key
--                  agar Edge Function bisa menjawab kirim ulang (respons pertama hilang)
--                  tanpa verifikasi Turnstile ulang. Hasil TANPA PII.
--   service_role : svc_create_submission(jsonb, text) — diganti: tahan balapan dua request
--                  bersamaan dengan kunci sama (unique_violation pada idempotency_key
--                  ditangkap → kiriman yang sudah ada, created = false), tanpa nomor tiket
--                  ganda atau bolong (penambahan counter ikut dibatalkan).
--   internal     : app_private.insert_submission(jsonb, text) — isi lama svc_create_submission
--                  (validasi + insert) tanpa pengecekan awal; tidak diekspos API.
-- Migrasi 01–07 tidak diubah.
-- =============================================================================

-- ---------------------------------------------------------------- svc_find_submission
/**
 * Kiriman untuk idempotency_key: {submission_id, ticket_code, status, photo_paths} atau null.
 * Tanpa nama, telepon, entity, catatan, berat, atau hash IP.
 */
create function public.svc_find_submission(p_idempotency_key uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'submission_id', s.id,
    'ticket_code', s.ticket_code,
    'status', s.status,
    'photo_paths', (select coalesce(jsonb_agg(ph.storage_path order by ph.storage_path), '[]'::jsonb)
                      from public.submission_photos ph where ph.submission_id = s.id))
  from public.submissions s
  where s.idempotency_key = p_idempotency_key
$$;

revoke execute on function public.svc_find_submission(uuid) from public, anon, authenticated;
grant execute on function public.svc_find_submission(uuid) to service_role;

-- ---------------------------------------------------------------- insert (internal)
/**
 * Validasi + insert kiriman baru (isi svc_create_submission versi 05, tanpa pengecekan awal).
 * Counter tiket, insert, item, foto, dan saran berada dalam satu blok EXCEPTION: bila insert
 * bentrok pada idempotency_key (request lain dengan kunci sama baru saja commit), seluruh
 * blok — termasuk penambahan counter — dibatalkan (subtransaksi), lalu kiriman yang sudah
 * ada dikembalikan dengan created = false. Bentrok constraint lain dilempar ulang.
 */
create function app_private.insert_submission(p jsonb, p_ip_hash text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  sub public.submissions;
  today date := app_private.local_today();
  backdate integer := (app_private.cfg('backdate_max_days', '7') #>> '{}')::integer;
  v_key uuid := (p ->> 'idempotency_key')::uuid;
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
  v_constraint text;
  existing jsonb;
begin
  -- Validasi header sebelum insert (lapis akhir; Edge Function sudah memvalidasi lebih ramah).
  if v_key is null then
    raise exception 'Kunci kiriman wajib diisi.' using errcode = 'LB002';
  end if;
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
  if jsonb_typeof(p -> 'items') is distinct from 'array'
     or jsonb_array_length(p -> 'items') not between 1 and 20 then
    raise exception 'Jumlah item limbah harus 1–20.' using errcode = 'LB002';
  end if;
  photos := coalesce((p ->> 'photo_count')::integer, 0);
  if photos not between 0 and 3 then
    raise exception 'Foto maksimal 3.' using errcode = 'LB002';
  end if;

  begin
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
      photos, v_key, p_ip_hash)
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
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'submissions_idempotency_key_key' then
      raise;
    end if;
    -- Pernyataan baru = snapshot baru (READ COMMITTED): baris request lain sudah commit.
    existing := public.svc_find_submission(v_key);
    if existing is null then
      raise;
    end if;
    return existing || jsonb_build_object('created', false);
  end;

  return jsonb_build_object('submission_id', sub.id, 'ticket_code', sub.ticket_code,
                            'status', sub.status, 'created', true, 'photo_paths', to_jsonb(paths));
end;
$$;

revoke execute on function app_private.insert_submission(jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- svc_create_submission
/**
 * Buat kiriman publik (dipanggil Edge Function submit-waste SETELAH validasi skema, rate
 * limit, dan verifikasi Turnstile). Idempoten via idempotency_key: kunci sama = tiket sama
 * (created = false), juga saat dua request dengan kunci sama tiba bersamaan.
 * Keluaran: {submission_id, ticket_code, status, created, photo_paths} — tanpa PII.
 */
create or replace function public.svc_create_submission(p jsonb, p_ip_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing jsonb;
begin
  existing := public.svc_find_submission(nullif(p ->> 'idempotency_key', '')::uuid);
  if existing is not null then
    return existing || jsonb_build_object('created', false);
  end if;
  return app_private.insert_submission(p, p_ip_hash);
end;
$$;

revoke execute on function public.svc_create_submission(jsonb, text) from public, anon, authenticated;
grant execute on function public.svc_create_submission(jsonb, text) to service_role;
