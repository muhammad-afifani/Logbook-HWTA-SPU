import { addDays, isValidIsoDate, todayInZone } from './dates.ts'

describe('tanggal', () => {
  it('validasi ISO', () => {
    expect(isValidIsoDate('2026-10-25')).toBe(true)
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('25/10/2026')).toBe(false)
  })
  it('addDays lintas bulan & tahun', () => {
    expect(addDays('2026-10-25', -7)).toBe('2026-10-18')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('hari ini menurut zona waktu lokasi (WITA = UTC+8)', () => {
    const lateUtc = new Date('2026-10-25T17:30:00Z') // 01:30 WITA tanggal 26
    expect(todayInZone('Asia/Makassar', lateUtc)).toBe('2026-10-26')
    expect(todayInZone('Asia/Jakarta', lateUtc)).toBe('2026-10-26')
    expect(todayInZone('UTC', lateUtc)).toBe('2026-10-25')
  })
})
