-- =============================================================================
-- 02 TABEL. Pola per tabel:
--   1) create table
--   2) revoke all ... from anon, authenticated   (menetralkan default privileges Supabase)
--   3) grant minimal ke authenticated (dibatasi lagi oleh policy di migrasi 03)
--   4) enable row level security
-- Instan waktu = timestamptz. Tanggal kalender (masuk/keluar/terima) = date.
-- Kolom aktor (created_by, verified_by, ...) TANPA FK ke auth.users + snapshot nama.
-- =============================================================================

-- ---------------------------------------------------------------- konfigurasi
create table public.app_config (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text
);
revoke all on table public.app_config from anon, authenticated;
grant select, update on table public.app_config to authenticated;
alter table public.app_config enable row level security;

-- ---------------------------------------------------------------- master data
-- Kelompok segregasi: USULAN, wajib direview K3 (proposed = true).
create table public.waste_groups (
  code text primary key check (code ~ '^G[0-9]{1,2}$'),
  name text not null check (length(trim(name)) between 2 and 80),
  color_dark text not null check (color_dark ~ '^#[0-9a-f]{6}$'),
  color_light text not null check (color_light ~ '^#[0-9a-f]{6}$'),
  proposed boolean not null default true,
  incompatible_with text[] not null default '{}',
  sort smallint not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
revoke all on table public.waste_groups from anon, authenticated;
grant select, insert, update on table public.waste_groups to authenticated;
alter table public.waste_groups enable row level security;

create table public.packaging_types (
  code text primary key check (code ~ '^[a-z0-9_]{2,32}$'),
  name text not null check (length(trim(name)) between 2 and 80),
  width_m numeric(5, 2) not null check (width_m > 0),
  depth_m numeric(5, 2) not null check (depth_m > 0),
  height_m numeric(5, 2) not null check (height_m > 0),
  shape text not null check (shape in ('cylinder', 'box', 'ibc', 'bag', 'sack', 'jerrycan', 'gas_cylinder', 'other')),
  uses_pallet boolean not null,
  units_per_pallet smallint not null check (units_per_pallet > 0),
  stackable boolean not null,
  max_stack_levels smallint not null check (max_stack_levels between 1 and 3),
  sort smallint not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (stackable or max_stack_levels = 1)
);
revoke all on table public.packaging_types from anon, authenticated;
grant select, insert, update on table public.packaging_types to authenticated;
alter table public.packaging_types enable row level security;

create table public.waste_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) between 2 and 20),
  name text not null check (length(trim(name)) between 2 and 300),
  group_code text not null references public.waste_groups (code),
  color_override text check (color_override ~ '^#[0-9a-f]{6}$'),
  default_packaging text not null references public.packaging_types (code),
  kg_per_package numeric(10, 2) check (kg_per_package > 0),
  storage_zone text references public.waste_groups (code),
  storage_days smallint check (storage_days between 1 and 365),
  needs_review boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on table public.waste_types from anon, authenticated;
grant select, insert, update on table public.waste_types to authenticated;
alter table public.waste_types enable row level security;

-- ---------------------------------------------------------------- kiriman publik
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique
    check (ticket_code ~ '^SPU-[0-9]{4}-[0-9]{4}-[2-9A-HJKMNP-TV-Z]{4}$'),
  site text not null default 'SPU' check (length(site) between 2 and 20),
  entry_date date not null,
  source text not null check (length(trim(source)) between 2 and 120),
  sender_name text not null check (length(trim(sender_name)) between 2 and 120),
  entity text not null check (length(trim(entity)) between 2 and 120),
  phone_e164 text not null check (phone_e164 ~ '^\+62[0-9]{8,13}$'),
  notes text check (length(notes) <= 1000),
  confirm_sealed boolean not null check (confirm_sealed),
  confirm_no_leak boolean not null check (confirm_no_leak),
  confirm_labeled boolean not null check (confirm_labeled),
  photo_count smallint not null default 0 check (photo_count between 0 and 3),
  status public.submission_status not null default 'pending',
  reject_reason text,
  submitted_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  ip_hash text check (ip_hash ~ '^[0-9a-f]{64}$'),
  verified_by uuid,
  verified_by_name text,
  verified_at timestamptz,
  check (status <> 'rejected' or length(trim(reject_reason)) >= 3),
  check ((status = 'pending') = (verified_at is null))
);
create index submissions_status_idx on public.submissions (status, submitted_at);
revoke all on table public.submissions from anon, authenticated;
grant select on table public.submissions to authenticated;
alter table public.submissions enable row level security;

create table public.submission_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  line_no smallint not null check (line_no between 1 and 20),
  waste_type_id uuid not null references public.waste_types (id),
  packaging_code text not null references public.packaging_types (code),
  package_count integer not null check (package_count between 1 and 10000),
  package_count_estimated boolean not null default false,
  weight_kg numeric(12, 2) not null check (weight_kg > 0 and weight_kg <= 1000000),
  actual_package_count integer check (actual_package_count between 0 and 10000),
  actual_weight_kg numeric(12, 2) check (actual_weight_kg >= 0 and actual_weight_kg <= 1000000),
  unique (submission_id, line_no)
);
revoke all on table public.submission_items from anon, authenticated;
grant select on table public.submission_items to authenticated;
alter table public.submission_items enable row level security;

create table public.submission_photos (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^submissions/[0-9a-f-]{36}/[1-3]\.webp$'),
  created_at timestamptz not null default now()
);
revoke all on table public.submission_photos from anon, authenticated;
grant select on table public.submission_photos to authenticated;
alter table public.submission_photos enable row level security;

-- ---------------------------------------------------------------- stok (append-only)
create table public.lots (
  id uuid primary key default gen_random_uuid(),
  lot_code text not null unique check (lot_code ~ '^L[0-9]{4}-[A-Za-z0-9-]+-[0-9]{4}$'),
  site text not null default 'SPU',
  submission_item_id uuid not null unique references public.submission_items (id),
  waste_type_id uuid not null references public.waste_types (id),
  packaging_code text not null references public.packaging_types (code),
  received_on date not null,
  expires_on date not null check (expires_on > received_on),
  initial_kg numeric(12, 2) not null check (initial_kg > 0),
  initial_packages integer not null check (initial_packages >= 0),
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index lots_received_idx on public.lots (received_on, lot_code);
revoke all on table public.lots from anon, authenticated;
grant select on table public.lots to authenticated;
alter table public.lots enable row level security;

create table public.outbound (
  id uuid primary key default gen_random_uuid(),
  doc_code text not null unique check (doc_code ~ '^OUT-[0-9]{4}-[0-9]{4}$'),
  site text not null default 'SPU',
  out_date date not null,
  transporter text not null check (length(trim(transporter)) between 2 and 120),
  destination text not null check (length(trim(destination)) between 2 and 200),
  manifest_no text not null check (length(trim(manifest_no)) between 1 and 60),
  vehicle_no text not null check (length(trim(vehicle_no)) between 1 and 20),
  notes text check (length(notes) <= 1000),
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);
revoke all on table public.outbound from anon, authenticated;
grant select on table public.outbound to authenticated;
alter table public.outbound enable row level security;

create table public.outbound_items (
  id uuid primary key default gen_random_uuid(),
  outbound_id uuid not null references public.outbound (id),
  lot_id uuid not null references public.lots (id),
  qty_kg numeric(12, 2) not null check (qty_kg > 0),
  qty_packages integer not null check (qty_packages >= 0),
  unique (outbound_id, lot_id)
);
revoke all on table public.outbound_items from anon, authenticated;
grant select on table public.outbound_items to authenticated;
alter table public.outbound_items enable row level security;

create table public.outbound_attachments (
  id uuid primary key default gen_random_uuid(),
  outbound_id uuid not null references public.outbound (id),
  storage_path text not null unique check (storage_path ~ '^outbound/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'),
  created_at timestamptz not null default now()
);
revoke all on table public.outbound_attachments from anon, authenticated;
grant select on table public.outbound_attachments to authenticated;
alter table public.outbound_attachments enable row level security;

-- Logbook: stok = SUM(stock_movements). Koreksi = baris baru bertipe correction.
create table public.stock_movements (
  id bigint generated always as identity primary key,
  lot_id uuid not null references public.lots (id),
  type public.movement_type not null,
  qty_kg numeric(12, 2) not null,
  qty_packages integer not null,
  occurred_on date not null,
  outbound_item_id uuid unique references public.outbound_items (id),
  corrects_movement_id bigint references public.stock_movements (id),
  reason text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  check (qty_kg <> 0 or qty_packages <> 0),
  check (type <> 'inbound' or (qty_kg > 0 and qty_packages >= 0 and outbound_item_id is null and corrects_movement_id is null)),
  check (type <> 'outbound' or (qty_kg < 0 and qty_packages <= 0 and outbound_item_id is not null)),
  check (type <> 'correction' or (corrects_movement_id is not null and length(trim(reason)) >= 3))
);
create index stock_movements_lot_idx on public.stock_movements (lot_id);
revoke all on table public.stock_movements from anon, authenticated;
grant select on table public.stock_movements to authenticated;
alter table public.stock_movements enable row level security;

-- ---------------------------------------------------------------- slot penyimpanan
-- Diisi admin lewat RPC dari computeLayout (src/config/spu-building.ts), bukan seed.
create table public.pallet_slots (
  id text primary key check (id ~ '^[A-Za-z0-9-]{3,40}$'),
  zone_code text references public.waste_groups (code),
  footprint_id text not null,
  level smallint not null check (level between 0 and 2),
  x numeric(6, 3) not null,
  y numeric(6, 3) not null,
  z numeric(6, 3) not null,
  active boolean not null default true,
  synced_at timestamptz not null default now()
);
revoke all on table public.pallet_slots from anon, authenticated;
grant select on table public.pallet_slots to authenticated;
alter table public.pallet_slots enable row level security;

create table public.slot_units (
  id bigint generated always as identity primary key,
  slot_id text not null references public.pallet_slots (id),
  unit_index smallint not null check (unit_index between 0 and 63),
  lot_id uuid not null references public.lots (id),
  packaging_code text not null references public.packaging_types (code),
  placed_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by_movement bigint references public.stock_movements (id)
);
create unique index slot_units_active_uq on public.slot_units (slot_id, unit_index) where removed_at is null;
revoke all on table public.slot_units from anon, authenticated;
grant select on table public.slot_units to authenticated;
alter table public.slot_units enable row level security;

-- ---------------------------------------------------------------- saran combobox
create table public.suggestion_terms (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('source', 'entity')),
  value text not null check (length(trim(value)) between 2 and 120),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index suggestion_terms_uq on public.suggestion_terms (kind, lower(value));
revoke all on table public.suggestion_terms from anon, authenticated;
grant select, update (approved) on table public.suggestion_terms to authenticated;
alter table public.suggestion_terms enable row level security;

-- ---------------------------------------------------------------- audit (append-only)
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_role text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name text not null,
  row_pk text,
  old_data jsonb,
  new_data jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
revoke all on table public.audit_log from anon, authenticated;
grant select on table public.audit_log to authenticated;
alter table public.audit_log enable row level security;

-- ---------------------------------------------------------------- view stok per lot
create view public.lot_stock
with (security_invoker = true) as
select
  l.id as lot_id,
  l.lot_code,
  l.waste_type_id,
  l.packaging_code,
  l.received_on,
  l.expires_on,
  coalesce(sum(m.qty_kg), 0)::numeric(12, 2) as stock_kg,
  coalesce(sum(m.qty_packages), 0)::integer as stock_packages
from public.lots l
left join public.stock_movements m on m.lot_id = l.id
group by l.id;
revoke all on table public.lot_stock from anon, authenticated;
grant select on table public.lot_stock to authenticated;

-- ---------------------------------------------------------------- internal (app_private)
create table app_private.counters (
  kind text not null,
  period text not null,
  last_value integer not null default 0,
  primary key (kind, period)
);
create table app_private.rate_limits (
  ip_hash text not null,
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (ip_hash, bucket, window_start)
);
revoke all on table app_private.counters, app_private.rate_limits from public, anon, authenticated;
alter table app_private.counters enable row level security;
alter table app_private.rate_limits enable row level security;

-- Sapu ulang: sequence identity juga mendapat hak anon dari default privileges.
revoke all on all sequences in schema public from anon, authenticated;

-- updated_at otomatis untuk master data
create trigger app_config_touch before update on public.app_config
  for each row execute function app_private.touch_updated_at();
create trigger waste_groups_touch before update on public.waste_groups
  for each row execute function app_private.touch_updated_at();
create trigger packaging_types_touch before update on public.packaging_types
  for each row execute function app_private.touch_updated_at();
create trigger waste_types_touch before update on public.waste_types
  for each row execute function app_private.touch_updated_at();
