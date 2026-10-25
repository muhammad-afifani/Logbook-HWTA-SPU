/**
 * Utilitas keamanan Edge Function: hash IP (tanpa menyimpan IP mentah) dan Turnstile.
 * Modul murni berbasis Web API (crypto.subtle, fetch) — berjalan di Deno dan Node.
 */

/** Secret uji resmi Cloudflare yang SELALU lolos. Bila dipakai, panggilan jaringan dilewati. */
export const TURNSTILE_TEST_SECRET_PASS = '1x0000000000000000000000000000000AA'

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Hash IP dengan salt rahasia (secret Edge Function). IP mentah tidak pernah disimpan. */
export function hashIp(ip: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${ip}`)
}

export function clientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-real-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

export async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!secret) return false
  if (!token || token.length > 2048) return false
  // Secret uji Cloudflare selalu sukses; dilewati agar dev lokal tidak butuh jaringan.
  if (secret === TURNSTILE_TEST_SECRET_PASS) return true
  const body = new FormData()
  body.append('secret', secret)
  body.append('response', token)
  if (ip && ip !== 'unknown') body.append('remoteip', ip)
  try {
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    })
    if (!res.ok) return false
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}
