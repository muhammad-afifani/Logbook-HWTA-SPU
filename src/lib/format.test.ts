import { formatDate, formatDateTime, formatKg, parseDecimal } from './format'

describe('format', () => {
  it('tanggal kalender dd/MM/yyyy tanpa pergeseran zona waktu', () => {
    expect(formatDate('2026-10-25')).toBe('25/10/2026')
    expect(formatDate('2026-01-05T23:30:00Z')).toBe('05/01/2026')
    expect(formatDate(null)).toBe('-')
    expect(formatDate('bukan')).toBe('-')
  })
  it('timestamptz ditampilkan di WITA', () => {
    expect(formatDateTime('2026-10-25T17:30:00Z')).toBe('26/10/2026 01.30')
    expect(formatDateTime('2026-10-25T17:30:00Z', 'UTC')).toBe('25/10/2026 17.30')
    expect(formatDateTime('x')).toBe('-')
  })
  it('angka gaya Indonesia', () => {
    expect(formatKg(1240.5)).toBe('1.240,5 kg')
    expect(formatKg(0.25)).toBe('0,25 kg')
  })
  it.each([
    ['12,5', 12.5],
    ['12.5', 12.5],
    [' 7 ', 7],
    ['0,25', 0.25],
    ['.5', 0.5],
  ])('parseDecimal(%j) = %d', (s, n) => expect(parseDecimal(s)).toBe(n))
  it.each(['', 'abc', '1,2,3', '1.234,5', '-3', '1e3', '12 kg'])('parseDecimal(%j) = NaN', (s) =>
    expect(parseDecimal(s)).toBeNaN(),
  )
})
