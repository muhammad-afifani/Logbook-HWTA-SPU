// @vitest-environment node
import { createSubmitHandler, MAX_BODY_BYTES, retryAfterSeconds } from './submit-handler.ts'
import type { SubmissionRef, SubmitHandlerDeps, UploadUrl } from './submit-handler.ts'
import { RestError } from './supabase-rest.ts'

const URL_FN = 'http://127.0.0.1:54321/functions/v1/submit-waste'
const ORIGIN = 'http://localhost:5173'
const KEY = '00000000-0000-4000-8000-000000000001'
const HASH = 'a'.repeat(64)
// 25/10/2026 10:00:30 WITA → 30 dtk setelah awal jendela rate limit 1 jam.
const NOW = Date.parse('2026-10-25T02:00:30Z')
const TICKET = 'SPU-2610-0001-ABCD'
const PATH = (n: number) => `submissions/00000000-0000-4000-8000-0000000000aa/${n}.webp`

const submission = {
  idempotency_key: KEY,
  entry_date: '2026-10-25',
  source: 'Workshop Uji',
  sender_name: 'Uji Coba 01',
  entity: 'PT Dummy',
  phone: '0812-0000-0001',
  notes: 'Catatan Uji',
  photo_count: 1,
  confirm_sealed: true,
  confirm_no_leak: true,
  confirm_labeled: true,
  items: [{ waste_code: 'B105d', package_count: 1, weight_kg: 180 }],
}
const PII =
  /Uji Coba 01|0812|62812|PT Dummy|Workshop Uji|Catatan Uji|00000000-0000-4000-8000-000000000001/

const ref = (over: Partial<SubmissionRef> = {}): SubmissionRef => ({
  submission_id: '00000000-0000-4000-8000-0000000000aa',
  ticket_code: TICKET,
  status: 'pending',
  photo_paths: [PATH(1)],
  ...over,
})

interface Setup {
  allowed?: boolean
  found?: SubmissionRef | null
  created?: SubmissionRef
  human?: boolean
  fail?: Partial<Record<string, unknown>>
  configured?: boolean
}

function setup(s: Setup = {}) {
  const calls: string[] = []
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push(fn)
    if (s.fail && fn in s.fail) throw s.fail[fn]
    switch (fn) {
      case 'svc_form_options':
        return { backdate_max_days: 7, timezone: 'Asia/Makassar' }
      case 'svc_rate_limit':
        return s.allowed ?? true
      case 'svc_find_submission':
        return s.found ?? null
      case 'svc_create_submission':
        return s.created ?? { ...ref(), created: true }
      default:
        throw new Error(`rpc tak terduga ${fn} ${JSON.stringify(args)}`)
    }
  })
  const verifyTurnstile = vi.fn(async () => {
    calls.push('turnstile')
    return s.human ?? true
  })
  const createUploadUrl = vi.fn(async (path: string): Promise<UploadUrl> => ({
    path,
    url: `https://x.test/${path}`,
    token: 't',
  }))
  const logs: string[] = []
  const deps: SubmitHandlerDeps = {
    allowedOrigins: [ORIGIN],
    configured: s.configured ?? true,
    rpc: rpc as SubmitHandlerDeps['rpc'],
    createUploadUrl,
    verifyTurnstile,
    hashIp: vi.fn(async () => HASH),
    now: () => NOW,
    logError: (m) => logs.push(m),
  }
  return { handler: createSubmitHandler(deps), rpc, verifyTurnstile, createUploadUrl, calls, logs }
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL_FN, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      'cf-connecting-ip': '203.0.113.7',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const valid = (over: Record<string, unknown> = {}) => ({
  turnstile_token: 'token-uji',
  submission: { ...submission, ...over },
})

let consoleSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  expect(consoleSpy).not.toHaveBeenCalled() // semua log lewat logError yang diuji
  consoleSpy.mockRestore()
})

describe('submit-handler: metode, CORS, konfigurasi', () => {
  it('OPTIONS → 204 dengan header CORS origin yang diizinkan', async () => {
    const { handler, rpc } = setup()
    const res = await handler(
      new Request(URL_FN, { method: 'OPTIONS', headers: { origin: ORIGIN } }),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('access-control-allow-headers')).toContain('content-type')
    expect(res.headers.get('access-control-expose-headers')).toBe('Retry-After')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('origin asing tidak dipantulkan', async () => {
    const { handler } = setup()
    const res = await handler(
      new Request(URL_FN, { method: 'OPTIONS', headers: { origin: 'https://jahat.test' } }),
    )
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
  })

  it('GET → 405 dengan Allow', async () => {
    const { handler, rpc } = setup()
    const res = await handler(new Request(URL_FN, { method: 'GET', headers: { origin: ORIGIN } }))
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST, OPTIONS')
    expect(await res.json()).toEqual({ error: expect.any(String) })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('secret belum diset → 500 generik', async () => {
    const { handler, rpc, logs } = setup({ configured: false })
    const res = await handler(post(valid()))
    expect(res.status).toBe(500)
    expect(Object.keys(await res.json())).toEqual(['error'])
    expect(rpc).not.toHaveBeenCalled()
    expect(logs).toHaveLength(1)
  })
})

describe('submit-handler: body', () => {
  it('Content-Type bukan application/json → 415', async () => {
    const { handler, rpc } = setup()
    const res = await handler(post(valid(), { 'content-type': 'text/plain' }))
    expect(res.status).toBe(415)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('application/json; charset=utf-8 diterima', async () => {
    const { handler } = setup()
    const res = await handler(post(valid(), { 'content-type': 'Application/JSON; charset=utf-8' }))
    expect(res.status).toBe(201)
  })

  it('content-length > 64 KiB → 413 tanpa membaca body', async () => {
    const { handler, rpc } = setup()
    const res = await handler(post('{}', { 'content-length': String(MAX_BODY_BYTES + 1) }))
    expect(res.status).toBe(413)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('stream tanpa content-length dihentikan begitu melewati 64 KiB → 413', async () => {
    const { handler, rpc } = setup()
    let pulled = 0
    const chunk = new Uint8Array(16 * 1024).fill(0x20)
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++
        if (pulled > 100) c.close()
        else c.enqueue(chunk)
      },
    })
    const req = new Request(URL_FN, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: stream,
      duplex: 'half',
    } as RequestInit)
    const res = await handler(req)
    expect(res.status).toBe(413)
    expect(pulled).toBeLessThan(10) // berhenti membaca, tidak menampung seluruh stream
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['JSON rusak', '{"submission":'],
    ['bukan objek', '[1,2]'],
    ['null', 'null'],
  ])('%s → 400', async (_n, raw) => {
    const { handler, rpc } = setup()
    const res = await handler(post(raw))
    expect(res.status).toBe(400)
    expect(Object.keys(await res.json())).toEqual(['error'])
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('submit-handler: validasi & rate limit', () => {
  it('isian salah → 422 dengan fields per field; rate limit & Turnstile tidak disentuh', async () => {
    const { handler, calls } = setup()
    const res = await handler(post(valid({ phone: '123', items: [] })))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toEqual(expect.any(String))
    expect(body.fields).toMatchObject({ phone: expect.any(String), items: expect.any(String) })
    expect(calls).toEqual(['svc_form_options'])
  })

  it('tanggal masuk dihitung dari jam yang disuntik (zona Asia/Makassar)', async () => {
    const { handler } = setup()
    const res = await handler(post(valid({ entry_date: '2026-10-26' })))
    expect(res.status).toBe(422)
    expect((await res.json()).fields.entry_date).toMatch(/masa depan/)
  })

  it('rate limit → 429 + Retry-After SEBELUM cek kunci & Turnstile', async () => {
    const { handler, calls, rpc } = setup({ allowed: false })
    const res = await handler(post(valid()))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('3570')
    expect(await res.json()).toEqual({ error: expect.any(String), retry_after: 3570 })
    expect(calls).toEqual(['svc_form_options', 'svc_rate_limit'])
    expect(rpc).toHaveBeenCalledWith('svc_rate_limit', {
      p_ip_hash: HASH,
      p_bucket: 'submit',
      p_limit: 10,
      p_window_seconds: 3600,
    })
  })

  it('retryAfterSeconds: sisa jendela, minimal 1', () => {
    expect(retryAfterSeconds(NOW, 3600)).toBe(3570)
    expect(retryAfterSeconds(Date.parse('2026-10-25T02:59:59.900Z'), 3600)).toBe(1)
    expect(retryAfterSeconds(Date.parse('2026-10-25T03:00:00Z'), 3600)).toBe(3600)
  })
})

describe('submit-handler: kiriman', () => {
  it('kiriman baru → 201, Turnstile diverifikasi dengan idempotency_key, URL upload', async () => {
    const { handler, calls, rpc, verifyTurnstile, createUploadUrl } = setup()
    const res = await handler(post(valid()))
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(await res.json()).toEqual({
      ticket_code: TICKET,
      created: true,
      uploads: [{ path: PATH(1), url: `https://x.test/${PATH(1)}`, token: 't' }],
    })
    expect(calls).toEqual([
      'svc_form_options',
      'svc_rate_limit',
      'svc_find_submission',
      'turnstile',
      'svc_create_submission',
    ])
    expect(verifyTurnstile).toHaveBeenCalledWith({
      token: 'token-uji',
      ip: '203.0.113.7',
      idempotencyKey: KEY,
    })
    expect(rpc).toHaveBeenCalledWith('svc_find_submission', { p_idempotency_key: KEY })
    const createArgs = rpc.mock.calls.find((c) => c[0] === 'svc_create_submission')![1]
    expect(createArgs).toMatchObject({
      p: { idempotency_key: KEY, phone_e164: '+6281200000001' },
      p_ip_hash: HASH,
    })
    expect(createUploadUrl).toHaveBeenCalledWith(PATH(1))
  })

  it('kirim ulang (kunci sudah ada) → 200 tiket sama + URL upload baru, TANPA Turnstile', async () => {
    const { handler, calls, verifyTurnstile } = setup({
      found: ref({ photo_paths: [PATH(1), PATH(2)] }),
    })
    for (const token of [undefined, '', 'token-kedaluwarsa']) {
      const res = await handler(post({ ...valid(), turnstile_token: token }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({
        ticket_code: TICKET,
        created: false,
        uploads: [
          expect.objectContaining({ path: PATH(1) }),
          expect.objectContaining({ path: PATH(2) }),
        ],
      })
      expect(JSON.stringify(body)).not.toMatch(PII)
    }
    expect(verifyTurnstile).not.toHaveBeenCalled()
    expect(calls).not.toContain('svc_create_submission')
  })

  it('kirim ulang untuk kiriman yang sudah diverifikasi → 200 tanpa URL upload (foto bukti terkunci)', async () => {
    const { handler, createUploadUrl } = setup({ found: ref({ status: 'verified' }) })
    const res = await handler(post(valid()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ticket_code: TICKET, created: false, uploads: [] })
    expect(createUploadUrl).not.toHaveBeenCalled()
  })

  it('Turnstile gagal → 403, tidak membuat kiriman', async () => {
    const { handler, calls } = setup({ human: false })
    const res = await handler(post(valid()))
    expect(res.status).toBe(403)
    expect(Object.keys(await res.json())).toEqual(['error'])
    expect(calls).not.toContain('svc_create_submission')
  })

  it('kunci baru tanpa token → Turnstile menerima string kosong → 403', async () => {
    const { handler, verifyTurnstile } = setup({ human: false })
    const res = await handler(post({ submission }))
    expect(res.status).toBe(403)
    expect(verifyTurnstile).toHaveBeenCalledWith(expect.objectContaining({ token: '' }))
  })

  it('balapan: create mengembalikan created=false → 200 tiket yang sudah ada', async () => {
    const { handler } = setup({ created: { ...ref(), created: false } })
    const res = await handler(post(valid()))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ticket_code: TICKET, created: false })
  })

  it('LB002 dari DB → 422 dengan pesan DB', async () => {
    const { handler } = setup({
      fail: {
        svc_create_submission: new RestError(400, 'LB002', 'Jenis limbah ZZZ tidak dikenal.'),
      },
    })
    const res = await handler(post(valid()))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'Jenis limbah ZZZ tidak dikenal.' })
  })
})

describe('submit-handler: kegagalan upstream → 500 generik, log tanpa PII', () => {
  const secretish = new RestError(
    500,
    '23505',
    'duplicate key (idempotency_key)=(00000000-0000-4000-8000-000000000001) Uji Coba 01 +6281200000001 PT Dummy',
  )
  it.each([
    ['svc_form_options', secretish],
    ['svc_rate_limit', new TypeError('fetch failed Uji Coba 01')],
    ['svc_find_submission', secretish],
    ['svc_create_submission', secretish],
  ])('%s gagal → 500', async (fn, err) => {
    const { handler, logs } = setup({ fail: { [fn]: err } })
    const res = await handler(post(valid()))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ error: expect.any(String) })
    expect(text).not.toMatch(PII)
    expect(text).not.toMatch(/23505|duplicate|fetch failed|RestError/)
    expect(logs).toHaveLength(1)
    expect(logs[0]).not.toMatch(PII)
    expect(logs[0]).not.toMatch(/duplicate|fetch failed|token-uji|203\.0\.113\.7|a{64}/)
  })

  it('signed upload URL gagal setelah kiriman tercipta → 500 (kirim ulang aman)', async () => {
    const { handler, createUploadUrl, logs } = setup()
    createUploadUrl.mockRejectedValueOnce(new RestError(503, undefined, 'storage down'))
    const res = await handler(post(valid()))
    expect(res.status).toBe(500)
    expect(logs[0]).toMatch(/upload-url/)
    expect(logs[0]).not.toMatch(PII)
  })
})
