import { normalizeIndonesianPhone } from './phone.ts'

describe('normalizeIndonesianPhone', () => {
  it.each([
    ['0812-3456-7890', '+6281234567890'],
    ['0812 0000 0001', '+6281200000001'],
    ['812 3456 7890', '+6281234567890'],
    ['6281234567890', '+6281234567890'],
    ['+62 812-3456-7890', '+6281234567890'],
    ['(0541) 123456', '+62541123456'],
    ['021-12345678', '+622112345678'],
  ])('%s → %s', (input, e164) => {
    expect(normalizeIndonesianPhone(input)).toEqual({ ok: true, e164 })
  })

  it.each([
    ['', 'wajib'],
    ['abc', 'angka'],
    ['+1 555 123 4567', '+62'],
    ['0812', 'tidak lengkap'],
    ['08123456789012345', 'tidak lengkap'],
    ['00812345678', 'tidak valid'],
  ])('%j ditolak', (input, msg) => {
    const r = normalizeIndonesianPhone(input)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain(msg.toLowerCase())
  })

  it('hasil selalu cocok dengan constraint DB ^\\+62[0-9]{8,13}$', () => {
    for (const s of ['0812-3456-7890', '(0541) 123456', '021-12345678', '+62 899 1234 5678']) {
      const r = normalizeIndonesianPhone(s)
      expect(r.ok && /^\+62[0-9]{8,13}$/.test(r.e164)).toBe(true)
    }
  })
})
