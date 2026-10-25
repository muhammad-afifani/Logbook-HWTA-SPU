import {
  clientIp,
  hashIp,
  hostnamesFromOrigins,
  TURNSTILE_TEST_SECRET_PASS,
  verifyTurnstile,
} from './security.ts'

describe('hash IP', () => {
  it('sha256 hex 64 karakter, bergantung salt, tidak memuat IP', async () => {
    const a = await hashIp('203.0.113.7', 'salt-a')
    const b = await hashIp('203.0.113.7', 'salt-b')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
    expect(a).not.toContain('203')
  })
  it('IP klien dari header proxy', () => {
    expect(clientIp(new Headers({ 'cf-connecting-ip': '203.0.113.7' }))).toBe('203.0.113.7')
    expect(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe(
      '198.51.100.1',
    )
    expect(clientIp(new Headers())).toBe('unknown')
  })
})

const reply = (data: Record<string, unknown>) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(data)))
const KEY = '00000000-0000-4000-8000-000000000001'

describe('verifyTurnstile', () => {
  it('secret uji Cloudflare lolos tanpa jaringan', async () => {
    const f = vi.fn()
    expect(
      await verifyTurnstile('tok', TURNSTILE_TEST_SECRET_PASS, '1.1.1.1', { fetchImpl: f }),
    ).toBe(true)
    expect(f).not.toHaveBeenCalled()
  })
  it('secret asli: memanggil siteverify dan mengikuti success', async () => {
    const ok = reply({ success: true })
    const no = reply({ success: false, 'error-codes': ['invalid-input-response'] })
    expect(await verifyTurnstile('tok', 'secret-asli', '1.1.1.1', { fetchImpl: ok })).toBe(true)
    expect(ok.mock.calls[0]![0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(await verifyTurnstile('tok', 'secret-asli', '1.1.1.1', { fetchImpl: no })).toBe(false)
  })
  it('mengirim idempotency_key, remoteip, dan batas waktu ke siteverify', async () => {
    const ok = reply({ success: true })
    await verifyTurnstile('tok', 'secret-asli', '203.0.113.7', {
      fetchImpl: ok,
      idempotencyKey: KEY,
    })
    const init = ok.mock.calls[0]![1] as RequestInit
    const form = init.body as FormData
    expect(form.get('idempotency_key')).toBe(KEY)
    expect(form.get('remoteip')).toBe('203.0.113.7')
    expect(form.get('response')).toBe('tok')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    const noKey = reply({ success: true })
    await verifyTurnstile('tok', 'secret-asli', 'unknown', { fetchImpl: noKey })
    const form2 = (noKey.mock.calls[0]![1] as RequestInit).body as FormData
    expect(form2.has('idempotency_key')).toBe(false)
    expect(form2.has('remoteip')).toBe(false)
  })
  it('action non-kosong wajib sama; action kosong/tidak ada diterima', async () => {
    const o = { expectedAction: 'submit-waste' }
    const v = (data: Record<string, unknown>) =>
      verifyTurnstile('tok', 'secret-asli', '', { ...o, fetchImpl: reply(data) })
    expect(await v({ success: true, action: 'submit-waste' })).toBe(true)
    expect(await v({ success: true, action: '' })).toBe(true)
    expect(await v({ success: true })).toBe(true)
    expect(await v({ success: true, action: 'login' })).toBe(false)
  })
  it('hostname wajib salah satu host ALLOWED_ORIGINS bila keduanya ada', async () => {
    const allowedHostnames = hostnamesFromOrigins(['https://Contoh.github.io', 'bukan url'])
    expect(allowedHostnames).toEqual(['contoh.github.io'])
    const v = (data: Record<string, unknown>, hosts = allowedHostnames) =>
      verifyTurnstile('tok', 'secret-asli', '', { allowedHostnames: hosts, fetchImpl: reply(data) })
    expect(await v({ success: true, hostname: 'contoh.github.io' })).toBe(true)
    expect(await v({ success: true, hostname: 'jahat.test' })).toBe(false)
    expect(await v({ success: true })).toBe(true)
    expect(await v({ success: true, hostname: 'jahat.test' }, [])).toBe(true)
    expect(await v({ success: false, hostname: 'contoh.github.io' })).toBe(false)
  })
  it('gagal tertutup: token kosong, secret kosong, jaringan error, HTTP error, JSON rusak', async () => {
    const boom = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await verifyTurnstile('', 'secret-asli', '', { fetchImpl: boom })).toBe(false)
    expect(await verifyTurnstile('tok', '', '', { fetchImpl: boom })).toBe(false)
    expect(await verifyTurnstile('tok', 'secret-asli', '', { fetchImpl: boom })).toBe(false)
    const http500 = vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 500 }))
    expect(await verifyTurnstile('tok', 'secret-asli', '', { fetchImpl: http500 })).toBe(false)
    const garbage = vi.fn().mockResolvedValue(new Response('<html>'))
    expect(await verifyTurnstile('tok', 'secret-asli', '', { fetchImpl: garbage })).toBe(false)
    // Token kosong tetap gagal walau secret uji (kunci baru tanpa token → 403).
    expect(await verifyTurnstile('', TURNSTILE_TEST_SECRET_PASS, '')).toBe(false)
  })
  it('batas waktu habis → gagal', async () => {
    const hang = vi.fn(
      (_u: unknown, init?: RequestInit) =>
        new Promise<Response>((_r, reject) =>
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
        ),
    )
    expect(
      await verifyTurnstile('tok', 'secret-asli', '', {
        fetchImpl: hang as unknown as typeof fetch,
        timeoutMs: 10,
      }),
    ).toBe(false)
  })
})
