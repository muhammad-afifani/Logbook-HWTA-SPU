/** Format tampilan Indonesia. Tanggal kalender (YYYY-MM-DD) tidak melewati Date agar bebas zona waktu. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '-'
}

/** Instan waktu (timestamptz) → "dd/MM/yyyy HH.mm" di zona waktu lokasi. */
export function formatDateTime(iso: string | null | undefined, timeZone = 'Asia/Makassar'): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}.${get('minute')}`
}

const nf = (d: number) =>
  new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: d })

export const formatKg = (kg: number, decimals = 2) => `${nf(decimals).format(kg)} kg`
export const formatNumber = (n: number, decimals = 0) => nf(decimals).format(n)

/** "12,5" / "12.5" → 12.5; selain itu NaN. Pemisah ribuan tidak didukung (menghindari salah baca). */
export function parseDecimal(input: string): number {
  const t = input.trim().replace(',', '.')
  return /^\d*\.?\d+$|^\d+\.$/.test(t) ? Number(t) : Number.NaN
}
