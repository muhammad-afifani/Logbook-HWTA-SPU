/// <reference path="../deno-shim.d.ts" />
/** Konfigurasi Edge Function dari env/secret. Tidak ada nilai rahasia di kode. */
export function loadEnv() {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  return {
    url,
    publicUrl: Deno.env.get('PUBLIC_SUPABASE_URL') || url,
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    turnstileSecret: Deno.env.get('TURNSTILE_SECRET_KEY') ?? '',
    ipSalt: Deno.env.get('IP_HASH_SALT') ?? '',
    allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  }
}
