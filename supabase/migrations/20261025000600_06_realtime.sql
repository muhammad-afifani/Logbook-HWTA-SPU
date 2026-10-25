-- =============================================================================
-- 06 REALTIME: event broadcast TERSANITASI. Klien publik tidak pernah menerima baris
-- data — hanya {scope, at}. Klien lalu memanggil ulang public_status() (publik) atau
-- RPC/tabel petugas (dengan RLS).
-- Topik publik 'spu:public' (private = false). Tidak ada perubahan pada realtime.messages.
-- =============================================================================

create function app_private.broadcast_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('scope', tg_argv[0], 'at', now()),
    'changed',
    'spu:public',
    false
  );
  return null;
exception when others then
  -- Realtime tidak boleh menggagalkan transaksi logbook.
  raise warning 'broadcast_changed gagal: %', sqlerrm;
  return null;
end;
$$;
revoke all on function app_private.broadcast_changed() from public, anon, authenticated;

create trigger stock_movements_broadcast after insert on public.stock_movements
  for each statement execute function app_private.broadcast_changed('stock');
create trigger submissions_broadcast after insert or update on public.submissions
  for each statement execute function app_private.broadcast_changed('submissions');
create trigger slot_units_broadcast after insert or update on public.slot_units
  for each statement execute function app_private.broadcast_changed('slots');
