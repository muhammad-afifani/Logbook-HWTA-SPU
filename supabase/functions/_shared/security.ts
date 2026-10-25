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

export interface TurnstileOptions {
  /**
   * UUID yang dikirim sebagai `idempotency_key` siteverify: memverifikasi ulang token yang sama
   * dengan kunci yang sama tidak gagal "timeout-or-duplicate". Isi dengan idempotency_key kiriman.
   */
  idempotencyKey?: string
  /** Bila respons memuat `action` non-kosong, wajib sama dengan nilai ini. */
  expectedAction?: string
  /** Bila tidak kosong dan respons memuat `hostname`, hostname wajib salah satu dari ini. */
  allowedHostnames?: string[]
  fetchImpl?: typeof fetch
  /** Batas waktu siteverify (ms). Habis waktu = gagal (tertutup). */
  timeoutMs?: number
}

/** Hostname dari daftar origin (ALLOWED_ORIGINS), mis. https://a.github.io → a.github.io. */
export function hostnamesFromOrigins(origins: string[]): string[] {
  const out: string[] = []
  for (const o of origins) {
    try {
      out.push(new URL(o).hostname.toLowerCase())
    } catch {
      /* origin tidak valid diabaikan */
    }
  }
  return out
}

interface SiteverifyResponse {
  success?: boolean
  action?: unknown
  hostname?: unknown
}

/** Verifikasi token Turnstile di server. Gagal tertutup: error/timeout jaringan = false. */
export async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string,
  opts: TurnstileOptions = {},
): Promise<boolean> {
  if (!secret) return false
  if (!token || token.length > 2048) return false
  // Secret uji Cloudflare selalu sukses; dilewati agar dev lokal tidak butuh jaringan.
  if (secret === TURNSTILE_TEST_SECRET_PASS) return true
  const body = new FormData()
  body.append('secret', secret)
  body.append('response', token)
  if (ip && ip !== 'unknown') body.append('remoteip', ip)
  if (opts.idempotencyKey) body.append('idempotency_key', opts.idempotencyKey)
  try {
    const res = await (opts.fetchImpl ?? fetch)(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body, signal: AbortSignal.timeout(opts.timeoutMs ?? 8000) },
    )
    if (!res.ok) return false
    const data = (await res.json()) as SiteverifyResponse
    if (data.success !== true) return false
    if (
      opts.expectedAction &&
      typeof data.action === 'string' &&
      data.action !== '' &&
      data.action !== opts.expectedAction
    )
      return false
    const hosts = opts.allowedHostnames ?? []
    if (
      hosts.length > 0 &&
      typeof data.hostname === 'string' &&
      data.hostname !== '' &&
      !hosts.includes(data.hostname.toLowerCase())
    )
      return false
    return true
  } catch {
    return false
  }
}
