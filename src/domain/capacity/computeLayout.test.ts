import { SPU_BUILDING, SPU_BUILDING_STRICT } from '@/config/spu-building'
import { computeLayout, distributeZones, fitCount } from './computeLayout'

describe('fitCount', () => {
  it('menghitung unit yang muat dengan gang', () => {
    expect(fitCount(12, 2.4, 0.6)).toBe(4) // 4x2,4 + 3x0,6 = 11,4
    expect(fitCount(12, 1.2, 0.6)).toBe(7) // 7x1,2 + 6x0,6 = 12,0 (pas)
    expect(fitCount(2.75, 2.4, 0.6)).toBe(1)
    expect(fitCount(1, 1.2, 0.6)).toBe(0)
  })
})

describe('distributeZones', () => {
  it('membagi rata dan memberi sisa ke kelompok terdepan', () => {
    expect(distributeZones(4, ['G1', 'G2', 'G3', 'G5'])).toEqual(['G1', 'G2', 'G3', 'G5'])
    expect(distributeZones(7, ['G1', 'G2', 'G3', 'G5'])).toEqual([
      'G1',
      'G1',
      'G2',
      'G2',
      'G3',
      'G3',
      'G5',
    ])
  })
})

describe('computeLayout — Opsi A (default, blok 2x2 pallet)', () => {
  const layout = computeLayout(SPU_BUILDING)

  it('area interior dan area penyimpanan sesuai rencana', () => {
    expect(layout.interiorArea).toBe(144)
    expect(layout.inner).toEqual({ x0: 1, y0: 1, x1: 15, y1: 8 })
    expect(layout.storage).toMatchObject({ x0: 3, x1: 15, y0: 1, y1: 8, area: 84 })
    expect(layout.mainAisle.y0).toBeCloseTo(3.75)
    expect(layout.mainAisle.y1).toBeCloseTo(5.25)
    expect(layout.rowDepth).toBeCloseTo(2.75)
  })

  it('8 blok, 32 tapak pallet, 3 tingkat, 96 slot, 384 drum', () => {
    expect(layout.blocksPerRow).toBe(4)
    expect(layout.levelHeight).toBeCloseTo(1.03)
    expect(layout.usableHeight).toBe(4)
    expect(layout.levels).toBe(3)
    expect(layout.totals).toEqual({
      blocks: 8,
      footprints: 32,
      slots: 96,
      drumPositions: 384,
      floorUsedM2: 46.08,
      floorUsedPctInterior: 32,
      floorUsedPctStorage: 54.86,
    })
  })

  it('12 slot per kelompok G1–G8', () => {
    expect(layout.slotsPerZone).toEqual({
      G1: 12,
      G2: 12,
      G3: 12,
      G4: 12,
      G5: 12,
      G6: 12,
      G7: 12,
      G8: 12,
    })
  })

  it('tidak ada blok yang keluar dari area simpan atau masuk lorong', () => {
    for (const b of layout.blocks) {
      expect(b.x0).toBeGreaterThanOrEqual(layout.storage.x0)
      expect(b.x1).toBeLessThanOrEqual(layout.storage.x1)
      expect(b.y0).toBeGreaterThanOrEqual(layout.storage.y0)
      expect(b.y1).toBeLessThanOrEqual(layout.storage.y1)
      const overlapsAisle = b.y0 < layout.mainAisle.y1 && b.y1 > layout.mainAisle.y0
      expect(overlapsAisle).toBe(false)
    }
  })

  it('gang antar blok minimal 0,6 m', () => {
    const north = layout.blocks.filter((b) => b.row === 'north').sort((a, b) => a.x0 - b.x0)
    for (let i = 1; i < north.length; i++) {
      expect(north[i]!.x0 - north[i - 1]!.x1).toBeGreaterThanOrEqual(0.6 - 1e-9)
    }
  })

  it('tumpukan tertinggi tetap >= 1 m di bawah atap', () => {
    const top = layout.levels * layout.levelHeight
    expect(top).toBeCloseTo(3.09)
    expect(SPU_BUILDING.interior.height - top).toBeGreaterThanOrEqual(1)
  })

  it('id slot unik dan tanpa peringatan', () => {
    expect(new Set(layout.slots.map((s) => s.id)).size).toBe(layout.slots.length)
    expect(layout.warnings).toEqual([])
  })
})

describe('computeLayout — Opsi B (tafsiran ketat, blok 1 pallet)', () => {
  const layout = computeLayout(SPU_BUILDING_STRICT)

  it('14 tapak, 42 slot, 168 drum, lantai 14%', () => {
    expect(layout.blocksPerRow).toBe(7)
    expect(layout.totals.footprints).toBe(14)
    expect(layout.totals.slots).toBe(42)
    expect(layout.totals.drumPositions).toBe(168)
    expect(layout.totals.floorUsedPctInterior).toBe(14)
  })
})

describe('computeLayout — peringatan', () => {
  it('memperingatkan bila lorong lebih sempit dari jalur evakuasi', () => {
    const layout = computeLayout({ ...SPU_BUILDING, mainAisleWidth: 1.0 })
    expect(layout.warnings.map((w) => w.code)).toContain('evacuation-too-narrow')
  })

  it('tingkat dibatasi tinggi atap', () => {
    const layout = computeLayout({
      ...SPU_BUILDING,
      interior: { ...SPU_BUILDING.interior, height: 3 },
    })
    expect(layout.levels).toBe(1) // (3 - 1) / 1,03 = 1,94
  })
})
