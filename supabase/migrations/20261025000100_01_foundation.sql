-- =============================================================================
-- 01 FONDASI: skema internal, enum, helper peran.
--
-- Aturan privilese proyek (lihat CLAUDE.md):
--  * Default privileges bawaan Supabase TIDAK diubah (tidak ada ALTER DEFAULT PRIVILEGES).
--    Karena default Supabase memberi anon/authenticated hak penuh pada objek baru di
--    `public`, SETIAP objek di migrasi ini di-REVOKE eksplisit lalu diberi grant minimal.
--  * Tidak ada grant ke skema auth/storage.
-- =============================================================================

-- Skema internal: tidak diekspos PostgREST (config.toml api.schemas = public, graphql_public).
create schema if not exists app_private;
revoke all on schema app_private from public, anon;
-- authenticated butuh USAGE agar policy RLS bisa memanggil helper peran di bawah.
grant usage on schema app_private to authenticated;

create type public.user_role as enum ('officer', 'admin');
create type public.submission_status as enum ('pending', 'verified', 'rejected');
create type public.movement_type as enum ('inbound', 'outbound', 'correction');
revoke all on type public.user_role, public.submission_status, public.movement_type from anon;

-- Profil petugas. Akun auth dibuat admin di Supabase Dashboard (email + password,
-- auto-confirm); baris profil diisi admin. Tanpa profil aktif = tanpa akses.
-- Catatan: FK ke auth.users hanya di sini (identitas login); kolom aktor di tabel lain
-- sengaja TANPA FK agar restore backup ke DB kosong tidak gagal.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  role public.user_role not null default 'officer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant insert, update on table public.profiles to authenticated; -- dibatasi policy: admin saja
alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- Helper peran. SECURITY DEFINER agar bisa membaca profiles tanpa rekursi RLS.
-- ---------------------------------------------------------------------------
create function app_private.current_role_of(uid uuid)
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = uid and p.active
$$;

create function app_private.is_officer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app_private.current_role_of(auth.uid()) in ('officer', 'admin'), false)
$$;

create function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app_private.current_role_of(auth.uid()) = 'admin', false)
$$;

create function app_private.current_officer_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.full_name from public.profiles p where p.id = auth.uid() and p.active
$$;

revoke all on function app_private.current_role_of(uuid) from public, anon, authenticated;
revoke all on function app_private.is_officer() from public, anon;
revoke all on function app_private.is_admin() from public, anon;
revoke all on function app_private.current_officer_name() from public, anon, authenticated;
grant execute on function app_private.is_officer() to authenticated;
grant execute on function app_private.is_admin() to authenticated;

-- updated_at otomatis
create function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function app_private.touch_updated_at() from public, anon, authenticated;

create trigger profiles_touch before update on public.profiles
  for each row execute function app_private.touch_updated_at();
