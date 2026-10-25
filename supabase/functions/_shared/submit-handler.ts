/**
 * Logika request Edge Function submit-waste sebagai modul murni (Web API saja) dengan
 * dependency injection, agar seluruh alur bisa diuji Vitest tanpa Deno/jaringan.
 * `submit-waste/index.ts` hanya merangkai env + Deno.serve.
 *
 * Alur:
 *   CORS/metode → Content-Type → batas ukuran body → JSON → validasi skema (422)
 *   → rate limit per hash IP (429 + Retry-After)
 *   → idempotency_key sudah ada? → 200 tiket sama + signed upload URL baru (TANPA Turnstile)
 *   → verifikasi Turnstile (403) → svc_create_submission (201 baru / 200 sudah ada)
 *   → signed upload URL foto.
 *
 * Kirim ulang tanpa Turnstile aman karena idempotency_key (UUID acak 122-bit dari perangkat
 * pengirim) adalah capability pemilik kiriman, dan respons hanya memuat kode tiket + URL
 * upload foto miliknya sendiri, tanpa PII. Rate limit tetap berlaku sebelumnya.
 *
 * Log error hanya memuat tahap + status/kode error, TIDAK PERNAH body kiriman, nama,
 * telepon, entity, pesan error DB (bisa mengutip nilai), atau idempotency_key.
 */
import { BodyTooLargeError, corsHeaders, json, readBodyText } from './http.ts'
import { clientIp } from './security.ts'
import { RestError } from './supabase-rest.ts'
import { todayInZone } from './dates.ts'
import { validateSubmission } from './submission.ts'

export const MAX_BODY_BYTES = 64 * 1024
export const RATE_LIMIT = { bucket: 'submit', limit: 10, windowSeconds: 3600 } as const
export const TURNSTILE_ACTION = 'submit-waste'

export interface UploadUrl {
  path: string
  url: string
  token: string
}

/** Hasil svc_find_submission / svc_create_submission (tanpa PII). */
export interface SubmissionRef {
  submission_id: string
  ticket_code: string
  status?: string
  photo_paths: string[]
  created?: boolean
}

export interface SubmitHandlerDeps {
  /** Origin yang diizinkan (ALLOWED_ORIGINS). */
  allowedOrigins: string[]
  /** false bila secret wajib (service role, salt IP, secret Turnstile) belum diset. */
  configured: boolean
  /** RPC PostgREST dengan service role. Melempar RestError bila gagal. */
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<T>
  /** Signed upload URL di bucket privat submission-photos. */
  createUploadUrl: (path: string) => Promise<UploadUrl>
  /** Verifikasi Turnstile server (secret, action, hostname sudah diikat pemanggil). */
  verifyTurnstile: (input: {
    token: string
    ip: string
    idempotencyKey: string
  }) => Promise<boolean>
  /** sha256(salt:ip) — salt sudah diikat pemanggil. */
  hashIp: (ip: string) => Promise<string>
  /** Jam (ms epoch); default Date.now. */
  now?: () => number
  /** Penulis log error; default console.error. Hanya menerima teks tanpa PII. */
  logError?: (message: string) => void
}

interface FormOptions {
  backdate_max_days: number
  timezone: string
}

const MSG = {
  method: 'Metode tidak didukung.',
  contentType: 'Kirim data sebagai JSON (Content-Type: application/json).',
  tooLarge: 'Data kiriman terlalu besar.',
  unreadable: 'Data kiriman tidak terbaca.',
  invalid: 'Periksa kembali isian.',
  rateLimited: 'Terlalu banyak kiriman dari jaringan ini. Coba lagi nanti.',
  turnstile: 'Verifikasi keamanan gagal. Muat ulang lalu coba lagi.',
  server: 'Gagal menyimpan. Data Anda tetap tersimpan di perangkat; coba lagi.',
} as const

/** Detik sampai jendela rate limit (selaras epoch, sama dengan svc_rate_limit) berakhir. */
export function retryAfterSeconds(nowMs: number, windowSeconds: number): number {
  const nowSec = Math.floor(nowMs / 1000)
  return Math.max(1, windowSeconds - (nowSec % windowSeconds))
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false
  return value.split(';')[0]!.trim().toLowerCase() === 'application/json'
}

/** Ringkasan error untuk log: nama/status/kode saja, tanpa pesan (bisa memuat data). */
function describeError(e: unknown): string {
  if (e instanceof RestError) return `RestError ${e.status} ${e.code ?? '-'}`
  if (e instanceof Error) return e.name
  return typeof e
}

export function createSubmitHandler(deps: SubmitHandlerDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? Date.now
  const logError = deps.logError ?? ((m: string) => console.error(m))

  return async (req: Request): Promise<Response> => {
    const cors = {
      ...corsHeaders(req.headers.get('origin'), deps.allowedOrigins),
      'Access-Control-Expose-Headers': 'Retry-After',
    }
    const headers = { ...cors, 'Cache-Control': 'no-store' }
    const reply = (status: number, body: unknown, extra: Record<string, string> = {}) =>
      json(status, body, { ...headers, ...extra })

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return reply(405, { error: MSG.method }, { Allow: 'POST, OPTIONS' })
    if (!deps.configured) {
      logError('submit-waste: konfigurasi server belum lengkap')
      return reply(500, { error: MSG.server })
    }
    if (!isJsonContentType(req.headers.get('content-type')))
      return reply(415, { error: MSG.contentType })

    let body: unknown
    try {
      body = JSON.parse(await readBodyText(req, MAX_BODY_BYTES))
    } catch (e) {
      if (e instanceof BodyTooLargeError) return reply(413, { error: MSG.tooLarge })
      return reply(400, { error: MSG.unreadable })
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body))
      return reply(400, { error: MSG.unreadable })
    const { submission, turnstile_token } = body as Record<string, unknown>

    let stage = 'form-options'
    try {
      const opts = await deps.rpc<FormOptions>('svc_form_options', {})
      const result = validateSubmission(submission, {
        today: todayInZone(opts.timezone, new Date(now())),
        backdateMaxDays: Number(opts.backdate_max_days),
      })
      if (!result.ok) return reply(422, { error: MSG.invalid, fields: result.errors })
      const payload = result.value

      stage = 'rate-limit'
      const ip = clientIp(req.headers)
      const ipHash = await deps.hashIp(ip)
      const allowed = await deps.rpc<boolean>('svc_rate_limit', {
        p_ip_hash: ipHash,
        p_bucket: RATE_LIMIT.bucket,
        p_limit: RATE_LIMIT.limit,
        p_window_seconds: RATE_LIMIT.windowSeconds,
      })
      if (allowed !== true) {
        const retry = retryAfterSeconds(now(), RATE_LIMIT.windowSeconds)
        return reply(
          429,
          { error: MSG.rateLimited, retry_after: retry },
          { 'Retry-After': String(retry) },
        )
      }

      // Kirim ulang (respons pertama hilang): kunci yang sudah tercatat = tiket yang sama.
      // Token Turnstile sekali pakai/kedaluwarsa, jadi tidak diverifikasi ulang di sini.
      stage = 'find'
      let ref = await deps.rpc<SubmissionRef | null>('svc_find_submission', {
        p_idempotency_key: payload.idempotency_key,
      })

      if (!ref) {
        stage = 'turnstile'
        const human = await deps.verifyTurnstile({
          token: typeof turnstile_token === 'string' ? turnstile_token : '',
          ip,
          idempotencyKey: payload.idempotency_key,
        })
        if (!human) return reply(403, { error: MSG.turnstile })

        stage = 'create'
        ref = await deps.rpc<SubmissionRef>('svc_create_submission', {
          p: payload,
          p_ip_hash: ipHash,
        })
      } else {
        ref = { ...ref, created: false }
      }

      // Foto hanya bisa (di)unggah selama kiriman masih menunggu verifikasi: bukti foto
      // kiriman yang sudah diverifikasi/ditolak tidak boleh ditimpa (x-upsert).
      stage = 'upload-url'
      const paths = (ref.status ?? 'pending') === 'pending' ? (ref.photo_paths ?? []) : []
      const uploads = await Promise.all(paths.map((p) => deps.createUploadUrl(p)))
      const created = ref.created === true
      return reply(created ? 201 : 200, { ticket_code: ref.ticket_code, created, uploads })
    } catch (e) {
      if (e instanceof RestError && e.code === 'LB002') return reply(422, { error: e.message })
      logError(`submit-waste gagal di tahap ${stage}: ${describeError(e)}`)
      return reply(500, { error: MSG.server })
    }
  }
}
