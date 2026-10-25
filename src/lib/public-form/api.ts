/**
 * API form publik — HANYA fetch ke Edge Functions (tanpa supabase-js, supaya halaman form ringan).
 * Mode demo (Supabase belum dikonfigurasi) memakai data lokal; tidak ada panggilan jaringan.
 */
import { env } from '@/config/env'
import { addDays, todayInZone } from '@shared/dates.ts'
import type { SubmissionInput } from '@shared/submission.ts'
import { DEMO_OPTIONS } from './demo-data'
import type { FormOptions, SubmitResult, TicketStatusResult, UploadTarget } from './types'

/** Tidak ada koneksi / timeout / server tak terjangkau. Aman dicoba ulang (idempoten). */
export class NetworkError extends Error {
  constructor(message = 'Tidak ada koneksi ke server.') {
    super(message)
    this.name = 'NetworkError'
  }
}

/** Server menjawab dengan error. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
    public retryAfter?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const fnUrl = (name: string) => `${env.supabaseUrl.replace(/\/$/, '')}/functions/v1/${name}`

async function request(url: string, init: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const { timeoutMs = 20000, ...rest } = init
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal })
  } catch {
    throw new NetworkError()
  } finally {
    clearTimeout(timer)
  }
}

async function readError(res: Response): Promise<ApiError> {
  let body: { error?: string; fields?: Record<string, string>; retry_after?: number } = {}
  try {
    body = await res.json()
  } catch {
    /* badan bukan JSON */
  }
  const retry = body.retry_after ?? Number(res.headers.get('retry-after') ?? NaN)
  return new ApiError(
    res.status,
    body.error ?? `Permintaan gagal (HTTP ${res.status}).`,
    body.fields,
    Number.isFinite(retry) ? retry : undefined,
  )
}

const jsonHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(env.supabaseAnonKey ? { apikey: env.supabaseAnonKey } : {}),
})

/* ------------------------------------------------------------------ demo */
const DEMO_KEY = 'spu-demo-tickets'
const TICKET_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

function demoTickets(): Record<string, TicketStatusResult> {
  try {
    return JSON.parse(sessionStorage.getItem(DEMO_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function demoTicketCode(): string {
  const d = new Date()
  const yymm = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`
  const seq = String(Object.keys(demoTickets()).length + 1).padStart(4, '0')
  const rnd = crypto.getRandomValues(new Uint8Array(4))
  const suffix = [...rnd].map((b) => TICKET_ALPHABET[b % TICKET_ALPHABET.length]).join('')
  return `SPU-${yymm}-${seq}-${suffix}`
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ publik */
export async function fetchFormOptions(): Promise<FormOptions> {
  if (env.demo) {
    return { ...DEMO_OPTIONS, today: todayInZone(DEMO_OPTIONS.timezone) }
  }
  const res = await request(fnUrl('form-options'), { headers: jsonHeaders() })
  if (!res.ok) throw await readError(res)
  return (await res.json()) as FormOptions
}

export interface SubmitBody {
  /** Boleh kosong untuk kirim ulang dengan idempotency_key yang sama (server mengenali kiriman lama). */
  turnstile_token?: string
  submission: SubmissionInput
}

export async function submitWaste(body: SubmitBody): Promise<SubmitResult> {
  if (env.demo) {
    await wait(700)
    const code = demoTicketCode()
    const s = body.submission
    const tickets = demoTickets()
    tickets[code] = {
      ticket_code: code,
      status: 'pending',
      reject_reason: null,
      entry_date: s.entry_date,
      submitted_at: new Date().toISOString(),
      verified_at: null,
      items: s.items.map((i) => {
        const w = DEMO_OPTIONS.waste_types.find((x) => x.code === i.waste_code)
        const pk = DEMO_OPTIONS.packaging_types.find(
          (x) => x.code === (i.packaging_code ?? w?.default_packaging),
        )
        return {
          waste_code: i.waste_code,
          waste_name: w?.name ?? i.waste_code,
          package_count: i.package_count ?? 1,
          packaging: pk?.name ?? '-',
        }
      }),
    }
    sessionStorage.setItem(DEMO_KEY, JSON.stringify(tickets))
    return { ticket_code: code, created: true, uploads: [] }
  }
  const res = await request(fnUrl('submit-waste'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
    timeoutMs: 30000,
  })
  if (!res.ok) throw await readError(res)
  return (await res.json()) as SubmitResult
}

/** Unggah satu foto ke signed upload URL (bucket privat). */
export async function uploadPhoto(target: UploadTarget, blob: Blob): Promise<void> {
  const res = await request(target.url, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'image/webp', 'x-upsert': 'true' },
    body: blob,
    timeoutMs: 60000,
  })
  if (!res.ok) throw await readError(res)
}

export async function checkTicketStatus(code: string): Promise<TicketStatusResult> {
  if (env.demo) {
    await wait(400)
    const found = demoTickets()[code]
    if (!found) throw new ApiError(404, 'Tiket tidak ditemukan.')
    return found
  }
  const res = await request(fnUrl('check-status'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ ticket_code: code }),
  })
  if (!res.ok) throw await readError(res)
  return (await res.json()) as TicketStatusResult
}

/** Tanggal paling awal yang boleh dipilih (untuk atribut min input tanggal). */
export const earliestEntryDate = (opts: Pick<FormOptions, 'today' | 'backdate_max_days'>) =>
  addDays(opts.today, -opts.backdate_max_days)
