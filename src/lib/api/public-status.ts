/**
 * KONTRAK DATA PUBLIK — satu-satunya bentuk data stok yang boleh sampai ke halaman publik
 * (dashboard publik dan peta site). Sesuai Amandemen 1: hanya persen kapasitas dan status
 * ada/tidak ada limbah. Tanpa kg, jumlah drum, lot, jenis limbah, nama, atau telepon.
 *
 * `parsePublicStatus` memakai whitelist: field lain dari server DIBUANG, sehingga walaupun
 * RPC suatu saat mengembalikan lebih banyak kolom, UI publik tetap tidak bisa menampilkannya.
 * Lapis lain: RPC `public_status()` (Fase 1, diuji pgTAP) dan aturan ESLint batas publik.
 */
export interface PublicStatus {
  /** 0..100, bilangan bulat. */
  capacityPct: number
  hasWaste: boolean
  updatedAt: string | null
}

export function parsePublicStatus(raw: unknown): PublicStatus {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const pct = Number(obj.capacity_pct)
  return {
    capacityPct: Number.isFinite(pct) ? Math.min(100, Math.max(0, Math.round(pct))) : 0,
    hasWaste: obj.has_waste === true,
    updatedAt: typeof obj.updated_at === 'string' ? obj.updated_at : null,
  }
}
