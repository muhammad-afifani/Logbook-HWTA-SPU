/**
 * Klien Supabase — HANYA untuk area petugas. Dimuat lazy (dynamic import) agar halaman
 * publik/form tidak membawa supabase-js (lihat batas publik di eslint.config.js).
 * Login petugas: email + password (signInWithPassword). Tidak ada magic link/OTP/reset email.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/config/env'

let client: Promise<SupabaseClient> | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey)
}

export function getSupabase(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured()) {
    return Promise.reject(
      new Error('Supabase belum dikonfigurasi (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'),
    )
  }
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Tidak ada tautan email (magic link/reset) — jangan baca token dari URL.
        detectSessionInUrl: false,
        storageKey: 'spu-auth',
      },
    }),
  )
  return client
}
