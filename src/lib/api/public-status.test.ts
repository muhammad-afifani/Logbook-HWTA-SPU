import { parsePublicStatus } from './public-status'

describe('parsePublicStatus (kontrak data publik)', () => {
  it('hanya meloloskan persen, ada/tidak ada limbah, dan waktu', () => {
    const parsed = parsePublicStatus({
      capacity_pct: 43.4,
      has_waste: true,
      updated_at: '2026-10-25T02:00:00Z',
      // Field yang TIDAK boleh sampai ke UI publik:
      total_kg: 18240.5,
      drum_count: 64,
      lots: [{ lot_code: 'L2610-B105d-0001' }],
      sender_name: 'Uji Coba 01',
      phone_e164: '+6281200000001',
    })
    expect(parsed).toEqual({
      capacityPct: 43,
      hasWaste: true,
      updatedAt: '2026-10-25T02:00:00Z',
    })
    expect(Object.keys(parsed).sort()).toEqual(['capacityPct', 'hasWaste', 'updatedAt'])
  })

  it('nilai rusak menjadi aman', () => {
    expect(parsePublicStatus(null)).toEqual({ capacityPct: 0, hasWaste: false, updatedAt: null })
    expect(parsePublicStatus({ capacity_pct: 250, has_waste: 'ya' }).capacityPct).toBe(100)
    expect(parsePublicStatus({ capacity_pct: 250, has_waste: 'ya' }).hasWaste).toBe(false)
  })
})
