import type { BuildingConfig, GroupCode } from '@/config/spu-building'

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type RowSide = 'north' | 'south'

export interface Block extends Rect {
  id: string
  row: RowSide
  /** Urutan dari barat (pintu) ke timur, mulai 0. */
  index: number
  zone: GroupCode | null
}

export interface Footprint {
  id: string
  blockId: string
  zone: GroupCode | null
  /** Titik tengah tapak pallet. */
  x: number
  y: number
  /** Jarak tepi tapak ke tepi lorong utama (0 = menempel lorong). */
  distanceToAisle: number
}

export interface Slot {
  id: string
  footprintId: string
  zone: GroupCode | null
  level: number
  x: number
  y: number
  /** Ketinggian alas slot (atas pallet tingkat di bawahnya). */
  z: number
}

export interface LayoutWarning {
  code: 'evacuation-too-narrow' | 'no-blocks' | 'door-too-wide' | 'zones-unassigned'
  message: string
}

export interface Layout {
  interiorArea: number
  inner: Rect
  receiving: Rect
  storage: Rect & { area: number }
  mainAisle: Rect
  rowDepth: number
  blockSize: { x: number; y: number }
  blocksPerRow: number
  levelHeight: number
  usableHeight: number
  levels: number
  blocks: Block[]
  footprints: Footprint[]
  slots: Slot[]
  totals: {
    blocks: number
    footprints: number
    slots: number
    drumPositions: number
    floorUsedM2: number
    floorUsedPctInterior: number
    floorUsedPctStorage: number
  }
  slotsPerZone: Partial<Record<GroupCode, number>>
  warnings: LayoutWarning[]
}

const EPS = 1e-9

/** Berapa banyak unit selebar `size` dengan jarak `gap` yang muat di `length`. */
export function fitCount(length: number, size: number, gap: number): number {
  if (size <= 0 || length + EPS < size) return 0
  return Math.floor((length + gap + EPS) / (size + gap))
}

/** Bagi n blok berurutan ke daftar kelompok; sisa diberikan ke kelompok paling depan. */
export function distributeZones(n: number, groups: GroupCode[]): (GroupCode | null)[] {
  if (groups.length === 0) return Array.from({ length: n }, () => null)
  const base = Math.floor(n / groups.length)
  const extra = n % groups.length
  const out: (GroupCode | null)[] = []
  groups.forEach((g, i) => {
    const count = base + (i < extra ? 1 : 0)
    for (let k = 0; k < count; k++) out.push(g)
  })
  return out
}

const round = (v: number, digits = 4) => Math.round(v * 10 ** digits) / 10 ** digits

/**
 * Hitung tata letak slot pallet dari konfigurasi bangunan.
 * Fungsi murni: hasil hanya bergantung pada `cfg`.
 */
export function computeLayout(cfg: BuildingConfig): Layout {
  const { length: L, width: W, height: H } = cfg.interior
  const warnings: LayoutWarning[] = []

  const inner: Rect = {
    x0: cfg.clearance.wall,
    y0: cfg.clearance.wall,
    x1: L - cfg.clearance.wall,
    y1: W - cfg.clearance.wall,
  }
  const receiving: Rect = { x0: 0, y0: 0, x1: cfg.receivingDepth, y1: W }

  const storageX0 = Math.max(inner.x0, receiving.x1)
  const storage = {
    x0: storageX0,
    y0: inner.y0,
    x1: inner.x1,
    y1: inner.y1,
    area: round((inner.x1 - storageX0) * (inner.y1 - inner.y0)),
  }

  const midY = (storage.y0 + storage.y1) / 2
  const mainAisle: Rect = {
    x0: 0,
    y0: midY - cfg.mainAisleWidth / 2,
    x1: L,
    y1: midY + cfg.mainAisleWidth / 2,
  }
  const rowDepth = round(mainAisle.y0 - storage.y0)
  const storageLength = storage.x1 - storage.x0

  const blockSize = {
    x: cfg.block.palletsX * cfg.pallet.size,
    y: cfg.block.palletsY * cfg.pallet.size,
  }
  const blocksPerRow = fitCount(storageLength, blockSize.x, cfg.blockGap)
  const blocksDeep = fitCount(rowDepth, blockSize.y, cfg.blockGap)

  const levelHeight = round(cfg.pallet.height + cfg.stacking.referenceUnitHeight)
  const usableHeight = round(H - cfg.clearance.roof)
  const levels = Math.max(
    0,
    Math.min(cfg.stacking.maxLevels, Math.floor((usableHeight + EPS) / levelHeight)),
  )

  // Blok dirapatkan ke tengah panjang area simpan, dan ditempel ke lorong utama.
  const usedLength = blocksPerRow * blockSize.x + Math.max(0, blocksPerRow - 1) * cfg.blockGap
  const startX = storage.x0 + (storageLength - usedLength) / 2

  const blocks: Block[] = []
  const footprints: Footprint[] = []
  const rows: RowSide[] = ['north', 'south']

  for (const row of rows) {
    const rowBlocks = blocksPerRow * blocksDeep
    const zones = distributeZones(rowBlocks, cfg.zoneAssignment[row])
    let n = 0
    for (let d = 0; d < blocksDeep; d++) {
      for (let i = 0; i < blocksPerRow; i++) {
        const x0 = startX + i * (blockSize.x + cfg.blockGap)
        const offset = d * (blockSize.y + cfg.blockGap)
        const y0 = row === 'north' ? mainAisle.y0 - offset - blockSize.y : mainAisle.y1 + offset
        const block: Block = {
          id: `${row === 'north' ? 'N' : 'S'}${d > 0 ? `${d}-` : ''}${i + 1}`,
          row,
          index: i,
          zone: zones[n] ?? null,
          x0: round(x0),
          y0: round(y0),
          x1: round(x0 + blockSize.x),
          y1: round(y0 + blockSize.y),
        }
        n++
        blocks.push(block)

        for (let py = 0; py < cfg.block.palletsY; py++) {
          for (let px = 0; px < cfg.block.palletsX; px++) {
            const fx0 = block.x0 + px * cfg.pallet.size
            const fy0 = block.y0 + py * cfg.pallet.size
            const nearEdge =
              row === 'north' ? mainAisle.y0 - (fy0 + cfg.pallet.size) : fy0 - mainAisle.y1
            footprints.push({
              id: `${block.id}-${py * cfg.block.palletsX + px + 1}`,
              blockId: block.id,
              zone: block.zone,
              x: round(fx0 + cfg.pallet.size / 2),
              y: round(fy0 + cfg.pallet.size / 2),
              distanceToAisle: round(Math.max(0, nearEdge)),
            })
          }
        }
      }
    }
  }

  const slots: Slot[] = []
  for (const fp of footprints) {
    for (let level = 0; level < levels; level++) {
      slots.push({
        id: `${fp.id}-L${level + 1}`,
        footprintId: fp.id,
        zone: fp.zone,
        level,
        x: fp.x,
        y: fp.y,
        z: round(level * levelHeight),
      })
    }
  }

  const slotsPerZone: Partial<Record<GroupCode, number>> = {}
  for (const s of slots) {
    if (s.zone) slotsPerZone[s.zone] = (slotsPerZone[s.zone] ?? 0) + 1
  }

  const interiorArea = round(L * W)
  const floorUsedM2 = round(footprints.length * cfg.pallet.size ** 2)

  if (cfg.mainAisleWidth + EPS < cfg.minEvacuationWidth) {
    warnings.push({
      code: 'evacuation-too-narrow',
      message: `Lorong utama ${cfg.mainAisleWidth} m lebih sempit dari jalur evakuasi minimum ${cfg.minEvacuationWidth} m.`,
    })
  }
  if (blocks.length === 0) {
    warnings.push({ code: 'no-blocks', message: 'Tidak ada blok yang muat di area penyimpanan.' })
  }
  if (cfg.doors.roller.width > W - 2 * cfg.clearance.wall + EPS) {
    warnings.push({
      code: 'door-too-wide',
      message: 'Pintu roller lebih lebar dari dinding bebas.',
    })
  }
  if (blocks.some((b) => b.zone === null)) {
    warnings.push({ code: 'zones-unassigned', message: 'Ada blok tanpa zona kelompok.' })
  }

  return {
    interiorArea,
    inner,
    receiving,
    storage,
    mainAisle,
    rowDepth,
    blockSize,
    blocksPerRow,
    levelHeight,
    usableHeight,
    levels,
    blocks,
    footprints,
    slots,
    totals: {
      blocks: blocks.length,
      footprints: footprints.length,
      slots: slots.length,
      drumPositions: slots.length * cfg.pallet.drumsPerPallet,
      floorUsedM2,
      floorUsedPctInterior: round((floorUsedM2 / interiorArea) * 100, 2),
      floorUsedPctStorage: round((floorUsedM2 / storage.area) * 100, 2),
    },
    slotsPerZone,
    warnings,
  }
}
