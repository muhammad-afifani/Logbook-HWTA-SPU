/**
 * Variabel lingkungan frontend. Repo publik: HANYA nilai yang memang publik
 * (URL Supabase, anon key, site key Turnstile). Jangan pernah menaruh secret di VITE_*.
 */
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '',
  base: import.meta.env.BASE_URL,
  /** Mode demo: data contoh tanpa backend. Aktif otomatis bila Supabase belum dikonfigurasi. */
  demo:
    import.meta.env.VITE_DEMO === '1' ||
    !import.meta.env.VITE_SUPABASE_URL ||
    !import.meta.env.VITE_SUPABASE_ANON_KEY,
} as const

/** Label lokasi tetap. Disimpan di kolom `site` agar bisa dikembangkan nanti. */
export const SITE = 'SPU'
