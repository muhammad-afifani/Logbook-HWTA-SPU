import { normalizeTicketCode, TICKET_RE } from './ticket.ts'

describe('kode tiket', () => {
  it('format valid', () => {
    expect(TICKET_RE.test('SPU-2610-0001-K7QX')).toBe(true)
  })
  it.each(['SPU-2610-0001-K7Q0', 'SPU-2610-0001-I7QX', 'SPU-2610-0001-L7QX', 'SPU-2610-0001-U7QX'])(
    'menolak karakter ambigu: %s',
    (code) => expect(TICKET_RE.test(code)).toBe(false),
  )
  it('normalisasi input pengguna', () => {
    expect(normalizeTicketCode(' spu-2610-0001-k7qx ')).toBe('SPU-2610-0001-K7QX')
    expect(normalizeTicketCode('SPU 2610 0001 K7QX')).toBe('SPU-2610-0001-K7QX')
    expect(normalizeTicketCode('SPU26100001K7QX')).toBe('SPU-2610-0001-K7QX')
    expect(normalizeTicketCode('SPU-2610-0001')).toBeNull()
    expect(normalizeTicketCode('XYZ-2610-0001-K7QX')).toBeNull()
  })
})
