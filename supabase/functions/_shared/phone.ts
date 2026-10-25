/**
 * Normalisasi nomor telepon Indonesia ke E.164 (+62...).
 * Diterima: 0812-3456-7890, 812 3456 7890, 62812..., +62 812..., (0541) 123456.
 * Nomor nasional (tanpa 0 awal) 9–12 digit: seluler diawali 8, nomor tetap diawali 2–7/9.
 * Modul murni (tanpa dependensi) — dipakai Edge Function dan form (Fase 2).
 */
export type PhoneResult = { ok: true; e164: string } | { ok: false; error: string }

export function normalizeIndonesianPhone(input: string): PhoneResult {
  const raw = (input ?? '').trim()
  if (!raw) return { ok: false, error: 'Nomor telepon wajib diisi.' }
  if (/[^0-9+\s().-]/.test(raw)) {
    return { ok: false, error: 'Nomor telepon hanya boleh berisi angka.' }
  }
  let digits = raw.replace(/[\s().-]/g, '')
  if (digits.startsWith('+')) {
    if (!digits.startsWith('+62')) return { ok: false, error: 'Gunakan nomor Indonesia (+62).' }
    digits = digits.slice(3)
  } else if (digits.startsWith('62')) {
    digits = digits.slice(2)
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }
  if (digits.includes('+')) return { ok: false, error: 'Format nomor tidak valid.' }
  if (digits.startsWith('0')) return { ok: false, error: 'Format nomor tidak valid.' }
  const mobile = /^8[1-9][0-9]{7,10}$/.test(digits)
  const landline = /^[2-79][0-9]{8,11}$/.test(digits)
  if (!mobile && !landline) {
    return {
      ok: false,
      error: 'Nomor tidak lengkap. Contoh: 0812-3456-7890 atau +62 812 3456 7890.',
    }
  }
  return { ok: true, e164: `+62${digits}` }
}
