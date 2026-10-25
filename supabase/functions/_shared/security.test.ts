import { clientIp, hashIp, TURNSTILE_TEST_SECRET_PASS, verifyTurnstile } from './security.ts'

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

describe('verifyTurnstile', () => {
  it('secret uji Cloudflare lolos tanpa jaringan', async () => {
    const f = vi.fn()
    expect(await verifyTurnstile('tok', TURNSTILE_TEST_SECRET_PASS, '1.1.1.1', f)).toBe(true)
    expect(f).not.toHaveBeenCalled()
  })
  it('secret asli: memanggil siteverify dan mengikuti success', async () => {
    const ok = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })))
    const no = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false })))
    expect(await verifyTurnstile('tok', 'secret-asli', '1.1.1.1', ok)).toBe(true)
    expect(ok.mock.calls[0]![0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(await verifyTurnstile('tok', 'secret-asli', '1.1.1.1', no)).toBe(false)
  })
  it('gagal tertutup: token kosong, secret kosong, atau jaringan error', async () => {
    const boom = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await verifyTurnstile('', 'secret-asli', '', boom)).toBe(false)
    expect(await verifyTurnstile('tok', '', '', boom)).toBe(false)
    expect(await verifyTurnstile('tok', 'secret-asli', '', boom)).toBe(false)
  })
})
