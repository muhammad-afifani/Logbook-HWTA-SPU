-- =============================================================================
-- 07 STORAGE: dua bucket PRIVAT (public = false).
--
-- Sengaja TIDAK ADA policy di storage.objects untuk anon maupun authenticated, dan
-- TIDAK ADA grant tambahan ke skema storage. Akibatnya:
--   * anon/authenticated tidak bisa SELECT/INSERT/UPDATE/DELETE objek (RLS menolak).
--   * Upload foto publik hanya lewat signed upload URL yang dibuat Edge Function
--     submit-waste (service_role).
--   * Signed URL baca (60 detik) untuk petugas hanya dibuat Edge Function photo-url
--     setelah officer_list_photos() memastikan peran petugas.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('submission-photos', 'submission-photos', false, 1048576, array['image/webp', 'image/jpeg']),
  ('outbound-docs', 'outbound-docs', false, 5242880,
   array['image/webp', 'image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
