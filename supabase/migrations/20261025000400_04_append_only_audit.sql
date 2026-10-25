-- =============================================================================
-- 04 APPEND-ONLY + AUDIT.
-- Trigger berlaku untuk SEMUA role termasuk service_role dan postgres (trigger tidak
-- dilewati oleh BYPASSRLS). Kode error:
--   LB001 = perubahan pada data append-only / terverifikasi ditolak
-- =============================================================================

create function app_private.deny_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Logbook append-only: % pada tabel % tidak diizinkan. Gunakan koreksi (movement baru).',
    tg_op, tg_table_name
    using errcode = 'LB001';
end;
$$;

-- Kiriman boleh berubah/dihapus HANYA selama masih pending (verifikasi atau hapus spam).
create function app_private.guard_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'pending' then
    raise exception 'Kiriman % sudah %, tidak bisa diubah/dihapus.', old.ticket_code, old.status
      using errcode = 'LB001';
  end if;
  if tg_op = 'UPDATE' then
    -- Identitas kiriman tidak boleh diubah, hanya status & hasil verifikasi.
    if new.id <> old.id or new.ticket_code <> old.ticket_code
       or new.idempotency_key <> old.idempotency_key or new.submitted_at <> old.submitted_at then
      raise exception 'Identitas kiriman tidak boleh diubah.' using errcode = 'LB001';
    end if;
    return new;
  end if;
  return old;
end;
$$;

create function app_private.guard_submission_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st public.submission_status;
begin
  select s.status into st from public.submissions s where s.id = old.submission_id;
  -- Saat kiriman pending dihapus (cascade), parent sudah tidak terbaca: izinkan.
  if st is not null and st <> 'pending' then
    raise exception 'Item kiriman yang sudah % tidak bisa diubah/dihapus.', st using errcode = 'LB001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- slot_units: satu-satunya perubahan sah = menandai unit diangkat (removed_at sekali).
create function app_private.guard_slot_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Riwayat slot tidak boleh dihapus.' using errcode = 'LB001';
  end if;
  if old.removed_at is not null
     or new.slot_id <> old.slot_id or new.unit_index <> old.unit_index
     or new.lot_id <> old.lot_id or new.placed_at <> old.placed_at
     or new.removed_at is null then
    raise exception 'slot_units hanya boleh diubah untuk menandai unit diangkat (sekali).'
      using errcode = 'LB001';
  end if;
  return new;
end;
$$;

revoke all on function app_private.deny_change() from public, anon, authenticated;
revoke all on function app_private.guard_submission() from public, anon, authenticated;
revoke all on function app_private.guard_submission_item() from public, anon, authenticated;
revoke all on function app_private.guard_slot_unit() from public, anon, authenticated;

-- Append-only penuh
do $$
declare t text;
begin
  foreach t in array array['stock_movements', 'lots', 'outbound', 'outbound_items',
                           'outbound_attachments', 'audit_log'] loop
    execute format(
      'create trigger %1$s_append_only before update or delete on public.%1$I
         for each row execute function app_private.deny_change()', t);
    execute format(
      'create trigger %1$s_no_truncate before truncate on public.%1$I
         for each statement execute function app_private.deny_change()', t);
  end loop;
end $$;

create trigger submissions_guard before update or delete on public.submissions
  for each row execute function app_private.guard_submission();
create trigger submissions_no_truncate before truncate on public.submissions
  for each statement execute function app_private.deny_change();
create trigger submission_items_guard before update or delete on public.submission_items
  for each row execute function app_private.guard_submission_item();
create trigger submission_items_no_truncate before truncate on public.submission_items
  for each statement execute function app_private.deny_change();
create trigger slot_units_guard before update or delete on public.slot_units
  for each row execute function app_private.guard_slot_unit();
create trigger slot_units_no_truncate before truncate on public.slot_units
  for each statement execute function app_private.deny_change();

-- ---------------------------------------------------------------- audit generik
create function app_private.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_j jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  pk text;
begin
  pk := coalesce(new_j, old_j) ->> 'id';
  if pk is null then pk := coalesce(new_j, old_j) ->> 'key'; end if;
  if pk is null then pk := coalesce(new_j, old_j) ->> 'code'; end if;
  insert into public.audit_log (actor, actor_role, action, table_name, row_pk, old_data, new_data)
  values (
    nullif(claims ->> 'sub', '')::uuid,
    coalesce(claims ->> 'role', current_user),
    tg_op,
    tg_table_name,
    pk,
    old_j,
    new_j
  );
  return null;
end;
$$;
revoke all on function app_private.audit() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['app_config', 'profiles', 'waste_groups', 'packaging_types', 'waste_types',
                           'submissions', 'submission_items', 'submission_photos', 'lots',
                           'stock_movements', 'outbound', 'outbound_items', 'outbound_attachments',
                           'pallet_slots', 'slot_units', 'suggestion_terms'] loop
    execute format(
      'create trigger %1$s_audit after insert or update or delete on public.%1$I
         for each row execute function app_private.audit()', t);
  end loop;
end $$;
