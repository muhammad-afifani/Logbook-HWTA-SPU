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
  /**
   * Curb/secondary containment di sepanjang dinding. SAAT INI hanya diletakkan di dalam
   * pita jarak dinding (`clearance.wall`) untuk visual — TIDAK mengurangi slot dan
   * TIDAK ada cek volume tampung. Lihat `K3_REVIEW`.
   */
  curb: { height: number; thickness: number }
  /**
   * Penugasan blok ke kelompok segregasi, per baris dari barat (pintu) ke timur.
   * rows[0] = baris utara, rows[1] = baris selatan. USULAN — wajib direview K3.
   */
  zoneAssignment: { north: GroupCode[]; south: GroupCode[] }
}

/**
 * Opsi A — blok 2x2 pallet, gang 0,6 m antar blok: 32 tapak x 3 tingkat = 96 slot = 384 drum.
 * ALTERNATIF (bukan default): tafsiran "blok 2x2" yang lebih longgar.
 */
export const SPU_BUILDING_OPTION_A: BuildingConfig = {
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

/**
 * Opsi B — DEFAULT KONSERVATIF. Tafsiran ketat "blok 2x2 kemasan" = 1 pallet (4 drum),
 * gang 0,6 m antar pallet: 14 tapak x 3 tingkat = 42 slot = 168 drum.
 */
export const SPU_BUILDING_OPTION_B: BuildingConfig = {
  ...SPU_BUILDING_OPTION_A,
  block: { palletsX: 1, palletsY: 1 },
}

/** Konfigurasi aktif aplikasi. Ganti ke OPTION_A hanya setelah keputusan K3. */
export const SPU_BUILDING: BuildingConfig = SPU_BUILDING_OPTION_B

/**
 * Status verifikasi K3. Angka kapasitas BELUM terverifikasi: nilai di atas adalah asumsi
 * awal. Ditampilkan di UI sampai `verified = true` diisi berdasarkan keputusan tertulis K3.
 */
export const K3_REVIEW = {
  verified: false,
  items: [
    {
      topic: 'Area & volume secondary containment',
      status: 'belum-dihitung',
      note: 'Curb hanya digambar di dalam pita jarak dinding 1 m. Luasnya tidak dikurangkan dari area simpan dan volume tampungnya (mis. ≥ 110% kemasan terbesar) tidak dicek. Spill pallet / sump tidak dimodelkan.',
    },
    {
      topic: 'Lebar lorong minimum & gang antar blok',
      status: 'asumsi',
      note: 'Dipakai lorong utama 1,5 m dan gang 0,6 m (gang orang Kepdal 01/1995). Kebutuhan alat angkut (hand pallet/forklift, radius putar) belum diverifikasi.',
    },
    {
      topic: 'Jalur evakuasi',
      status: 'asumsi',
      note: 'Lorong utama dianggap jalur evakuasi (minimum 1,2 m) dari pintu roller ke pintu darurat. Jarak tempuh, rambu, dan akses APAR belum diverifikasi.',
    },
    {
      topic: 'Tinggi tumpukan maksimal',
      status: 'asumsi',
      note: 'Maksimal 3 tingkat drum beralas pallet (1,03 m/tingkat = 3,09 m) dengan jarak ke atap 1 m. Kekuatan pallet/rak dan kemasan non-drum belum diverifikasi.',
    },
    {
      topic: 'Jarak dinding & area bebas pintu',
      status: 'asumsi',
      note: 'Jarak dinding 1 m; area penerimaan/bebas pintu 3 m dari dinding pintu roller.',
    },
  ],
} as const
