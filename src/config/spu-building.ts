/**
 * SATU-SATUNYA sumber dimensi dan aturan kapasitas bangunan SPU.
 *
 * Satuan meter. Sistem koordinat denah:
 *   X = sepanjang bangunan (0 = dinding barat, tempat pintu roller)
 *   Y = selebar bangunan   (0 = dinding utara)
 *   Z = tinggi dari lantai
 * Di three.js nanti: X -> x, Z -> y, Y -> z.
 *
 * Angka aturan mengacu Kepka Bapedal 01/1995 sebagai referensi awal dan
 * WAJIB direview tim K3 sebelum dipakai operasional.
 */

export type GroupCode = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8'

export interface BuildingConfig {
  site: string
  /** Dimensi bersih interior. */
  interior: { length: number; width: number; height: number }
  clearance: {
    /** Jarak tumpukan terluar ke dinding. */
    wall: number
    /** Jarak tumpukan tertinggi ke atap. */
    roof: number
  }
  doors: {
    roller: { wall: 'west'; centerY: number; width: number; height: number }
    emergency: { wall: 'east'; centerY: number; width: number; height: number }
  }
  /** Area penerimaan + area bebas pintu, diukur dari dinding barat. Bukan kapasitas. */
  receivingDepth: number
  /** Lorong utama di tengah, sejajar X; sekaligus jalur evakuasi pintu roller -> pintu darurat. */
  mainAisleWidth: number
  /** Lebar minimum jalur evakuasi yang dicek terhadap lorong utama. */
  minEvacuationWidth: number
  /** Gang antar blok (lalu lintas orang). */
  blockGap: number
  pallet: { size: number; height: number; drumsPerPallet: number }
  /** Satu blok = palletsX x palletsY tapak pallet. Opsi A = 2x2 pallet, Opsi B = 1x1. */
  block: { palletsX: number; palletsY: number }
  stacking: {
    /** Batas aturan (drum: 3 lapis). */
    maxLevels: number
    /** Tinggi unit acuan per tingkat (drum 200 L). */
    referenceUnitHeight: number
  }
  curb: { height: number; thickness: number }
  /**
   * Penugasan blok ke kelompok segregasi, per baris dari barat (pintu) ke timur.
   * rows[0] = baris utara, rows[1] = baris selatan. USULAN — wajib direview K3.
   */
  zoneAssignment: { north: GroupCode[]; south: GroupCode[] }
}

export const SPU_BUILDING: BuildingConfig = {
  site: 'SPU',
  interior: { length: 16, width: 9, height: 5 },
  clearance: { wall: 1.0, roof: 1.0 },
  doors: {
    roller: { wall: 'west', centerY: 4.5, width: 4.0, height: 4.0 },
    emergency: { wall: 'east', centerY: 4.5, width: 1.2, height: 2.1 },
  },
  receivingDepth: 3.0,
  mainAisleWidth: 1.5,
  minEvacuationWidth: 1.2,
  blockGap: 0.6,
  pallet: { size: 1.2, height: 0.15, drumsPerPallet: 4 },
  block: { palletsX: 2, palletsY: 2 },
  stacking: { maxLevels: 3, referenceUnitHeight: 0.88 },
  curb: { height: 0.15, thickness: 0.2 },
  zoneAssignment: {
    north: ['G1', 'G2', 'G3', 'G5'],
    south: ['G4', 'G6', 'G8', 'G7'],
  },
}

/** Opsi B (tafsiran ketat): blok = 2x2 drum = 1 pallet. Dipakai untuk perbandingan. */
export const SPU_BUILDING_STRICT: BuildingConfig = {
  ...SPU_BUILDING,
  block: { palletsX: 1, palletsY: 1 },
}
