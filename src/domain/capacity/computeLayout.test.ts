import {
  K3_REVIEW,
  SPU_BUILDING,
  SPU_BUILDING_OPTION_A,
  SPU_BUILDING_OPTION_B,
} from '@/config/spu-building'
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

describe('konfigurasi aktif', () => {
  it('default konservatif = Opsi B', () => {
    expect(SPU_BUILDING).toBe(SPU_BUILDING_OPTION_B)
  })

  it('angka kapasitas ditandai belum terverifikasi K3, containment belum dihitung', () => {
    expect(K3_REVIEW.verified).toBe(false)
    const containment = K3_REVIEW.items.find((i) => i.topic.includes('containment'))
    expect(containment?.status).toBe('belum-dihitung')
  })
})

describe.each([
  ['Opsi A', SPU_BUILDING_OPTION_A],
  ['Opsi B', SPU_BUILDING_OPTION_B],
])('computeLayout — invarian geometri %s', (_name, cfg) => {
  const layout = computeLayout(cfg)

  it('area interior dan area penyimpanan', () => {
    expect(layout.interiorArea).toBe(144)
    expect(layout.inner).toEqual({ x0: 1, y0: 1, x1: 15, y1: 8 })
    expect(layout.storage).toMatchObject({ x0: 3, x1: 15, y0: 1, y1: 8, area: 84 })
    expect(layout.mainAisle.y0).toBeCloseTo(3.75)
    expect(layout.mainAisle.y1).toBeCloseTo(5.25)
    expect(layout.rowDepth).toBeCloseTo(2.75)
  })

  it('tidak ada blok di luar area simpan atau di lorong', () => {
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
    for (const row of ['north', 'south'] as const) {
      const blocks = layout.blocks.filter((b) => b.row === row).sort((a, b) => a.x0 - b.x0)
      for (let i = 1; i < blocks.length; i++) {
        expect(blocks[i]!.x0 - blocks[i - 1]!.x1).toBeGreaterThanOrEqual(0.6 - 1e-9)
      }
    }
  })

  it('3 tingkat, tumpukan tertinggi >= 1 m di bawah atap', () => {
    expect(layout.levelHeight).toBeCloseTo(1.03)
    expect(layout.usableHeight).toBe(4)
    expect(layout.levels).toBe(3)
    expect(cfg.interior.height - layout.levels * layout.levelHeight).toBeGreaterThanOrEqual(1)
  })

  it('id slot unik dan tanpa peringatan', () => {
    expect(new Set(layout.slots.map((s) => s.id)).size).toBe(layout.slots.length)
    expect(layout.warnings).toEqual([])
  })
})

describe('computeLayout — Opsi B (default konservatif, blok 1 pallet)', () => {
  const layout = computeLayout(SPU_BUILDING_OPTION_B)

  it('14 tapak, 42 slot, 168 drum, lantai 14%', () => {
    expect(layout.blocksPerRow).toBe(7)
    expect(layout.totals).toEqual({
      blocks: 14,
      footprints: 14,
      slots: 42,
      drumPositions: 168,
      floorUsedM2: 20.16,
      floorUsedPctInterior: 14,
      floorUsedPctStorage: 24,
    })
  })

  it('slot per kelompok: 6 untuk G1–G4, G6, G8; 3 untuk G5 dan G7', () => {
    expect(layout.slotsPerZone).toEqual({
      G1: 6,
      G2: 6,
      G3: 6,
      G5: 3,
      G4: 6,
      G6: 6,
      G8: 6,
      G7: 3,
    })
  })
})

describe('computeLayout — Opsi A (alternatif, blok 2x2 pallet)', () => {
  const layout = computeLayout(SPU_BUILDING_OPTION_A)

  it('8 blok, 32 tapak pallet, 96 slot, 384 drum', () => {
    expect(layout.blocksPerRow).toBe(4)
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
    expect(Object.values(layout.slotsPerZone)).toEqual(Array(8).fill(12))
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
