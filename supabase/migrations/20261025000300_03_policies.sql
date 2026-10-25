-- =============================================================================
-- 03 POLICY RLS. Hanya untuk role `authenticated`; TIDAK ADA policy untuk anon.
-- Petugas (officer/admin aktif) membaca; admin mengubah master data & profil.
-- Tulis data operasional (kiriman, lot, movement, keluar) HANYA lewat RPC (migrasi 05).
-- =============================================================================

-- profiles: setiap pengguna login melihat profilnya sendiri; admin melihat & mengelola semua.
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select app_private.is_admin()));
create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check ((select app_private.is_admin()));
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using ((select app_private.is_admin()))
  with check ((select app_private.is_admin()));

-- app_config: petugas baca, admin ubah.
create policy app_config_officer_select on public.app_config
  for select to authenticated using ((select app_private.is_officer()));
create policy app_config_admin_update on public.app_config
  for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

-- Master data: petugas baca, admin tambah/ubah (hapus tidak diizinkan; pakai kolom active).
create policy waste_groups_officer_select on public.waste_groups
  for select to authenticated using ((select app_private.is_officer()));
create policy waste_groups_admin_insert on public.waste_groups
  for insert to authenticated with check ((select app_private.is_admin()));
create policy waste_groups_admin_update on public.waste_groups
  for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

create policy packaging_types_officer_select on public.packaging_types
  for select to authenticated using ((select app_private.is_officer()));
create policy packaging_types_admin_insert on public.packaging_types
  for insert to authenticated with check ((select app_private.is_admin()));
create policy packaging_types_admin_update on public.packaging_types
  for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

create policy waste_types_officer_select on public.waste_types
  for select to authenticated using ((select app_private.is_officer()));
create policy waste_types_admin_insert on public.waste_types
  for insert to authenticated with check ((select app_private.is_admin()));
create policy waste_types_admin_update on public.waste_types
  for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

-- Data operasional: petugas hanya SELECT. (Grant tulis memang tidak diberikan di migrasi 02.)
create policy submissions_officer_select on public.submissions
  for select to authenticated using ((select app_private.is_officer()));
create policy submission_items_officer_select on public.submission_items
  for select to authenticated using ((select app_private.is_officer()));
create policy submission_photos_officer_select on public.submission_photos
  for select to authenticated using ((select app_private.is_officer()));
create policy lots_officer_select on public.lots
  for select to authenticated using ((select app_private.is_officer()));
create policy stock_movements_officer_select on public.stock_movements
  for select to authenticated using ((select app_private.is_officer()));
create policy outbound_officer_select on public.outbound
  for select to authenticated using ((select app_private.is_officer()));
create policy outbound_items_officer_select on public.outbound_items
  for select to authenticated using ((select app_private.is_officer()));
create policy outbound_attachments_officer_select on public.outbound_attachments
  for select to authenticated using ((select app_private.is_officer()));
create policy pallet_slots_officer_select on public.pallet_slots
  for select to authenticated using ((select app_private.is_officer()));
create policy slot_units_officer_select on public.slot_units
  for select to authenticated using ((select app_private.is_officer()));

-- Saran combobox: petugas baca dan menyetujui (grant update hanya kolom approved).
create policy suggestion_terms_officer_select on public.suggestion_terms
  for select to authenticated using ((select app_private.is_officer()));
create policy suggestion_terms_officer_update on public.suggestion_terms
  for update to authenticated
  using ((select app_private.is_officer())) with check ((select app_private.is_officer()));

-- Audit: hanya admin.
create policy audit_log_admin_select on public.audit_log
  for select to authenticated using ((select app_private.is_admin()));
