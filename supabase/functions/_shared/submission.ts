/**
 * Validasi skema kiriman publik — dipakai Edge Function submit-waste (wajib) dan
 * form (Fase 2, validasi inline yang sama). DB memvalidasi lagi sebagai lapis akhir.
 * Modul murni tanpa dependensi (berjalan di Deno dan Node).
 */
import { addDays, isValidIsoDate } from './dates.ts'
import { normalizeIndonesianPhone } from './phone.ts'

export const LIMITS = {
  textMin: 2,
  textMax: 120,
  notesMax: 1000,
  itemsMin: 1,
  itemsMax: 20,
  photosMax: 3,
  packagesMax: 10000,
  kgMax: 1_000_000,
} as const

export interface SubmissionItemInput {
  waste_code: string
  packaging_code?: string | null
  package_count?: number | null
  weight_kg: number
}

export interface SubmissionInput {
  idempotency_key: string
  entry_date: string
  source: string
  sender_name: string
  entity: string
  phone: string
  notes?: string | null
  photo_count?: number
  confirm_sealed: boolean
  confirm_no_leak: boolean
  confirm_labeled: boolean
  items: SubmissionItemInput[]
}

/** Bentuk yang dikirim ke RPC svc_create_submission. */
export interface SubmissionPayload {
  idempotency_key: string
  entry_date: string
  source: string
  sender_name: string
  entity: string
  phone_e164: string
  notes: string | null
  photo_count: number
  confirm_sealed: true
  confirm_no_leak: true
  confirm_labeled: true
  items: {
    waste_code: string
    packaging_code: string | null
    package_count: number | null
    weight_kg: number
  }[]
}

export type ValidationErrors = Record<string, string>
export type ValidationResult =
  { ok: true; value: SubmissionPayload } | { ok: false; errors: ValidationErrors }

// Hanya UUID v4 (acak 122-bit): idempotency_key berfungsi sebagai capability pemilik kiriman.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CODE_RE = /^[A-Za-z0-9-]{2,20}$/
const PKG_RE = /^[a-z0-9_]{2,32}$/

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''
}

function checkText(errors: ValidationErrors, key: string, label: string, v: unknown): string {
  const t = text(v)
  if (!t) errors[key] = `${label} wajib diisi.`
  else if (t.length < LIMITS.textMin) errors[key] = `${label} minimal ${LIMITS.textMin} karakter.`
  else if (t.length > LIMITS.textMax) errors[key] = `${label} maksimal ${LIMITS.textMax} karakter.`
  return t
}

export interface ValidateOptions {
  /** Hari ini (YYYY-MM-DD) di zona waktu lokasi. */
  today: string
  backdateMaxDays: number
}

export function validateSubmission(raw: unknown, opts: ValidateOptions): ValidationResult {
  const errors: ValidationErrors = {}
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>

  const idem = text(r.idempotency_key)
  if (!UUID_RE.test(idem)) errors.idempotency_key = 'Kunci kiriman tidak valid. Muat ulang halaman.'

  const entry = text(r.entry_date)
  const earliest = addDays(opts.today, -opts.backdateMaxDays)
  if (!isValidIsoDate(entry)) errors.entry_date = 'Tanggal masuk wajib diisi.'
  else if (entry > opts.today) errors.entry_date = 'Tanggal masuk tidak boleh di masa depan.'
  else if (entry < earliest)
    errors.entry_date = `Tanggal masuk paling lama ${opts.backdateMaxDays} hari yang lalu.`

  const source = checkText(errors, 'source', 'Sumber limbah', r.source)
  const sender = checkText(errors, 'sender_name', 'Nama pengirim', r.sender_name)
  const entity = checkText(errors, 'entity', 'Entity', r.entity)

  const phone = normalizeIndonesianPhone(typeof r.phone === 'string' ? r.phone : '')
  if (!phone.ok) errors.phone = phone.error

  const notes = text(r.notes)
  if (notes.length > LIMITS.notesMax) errors.notes = `Catatan maksimal ${LIMITS.notesMax} karakter.`

  const photoCount =
    r.photo_count === undefined || r.photo_count === null ? 0 : Number(r.photo_count)
  if (!Number.isInteger(photoCount) || photoCount < 0 || photoCount > LIMITS.photosMax)
    errors.photo_count = `Foto maksimal ${LIMITS.photosMax}.`

  if (r.confirm_sealed !== true) errors.confirm_sealed = 'Pastikan kemasan tertutup rapat.'
  if (r.confirm_no_leak !== true) errors.confirm_no_leak = 'Pastikan kemasan tidak bocor.'
  if (r.confirm_labeled !== true) errors.confirm_labeled = 'Pastikan label B3 terpasang.'

  const items: SubmissionPayload['items'] = []
  if (!Array.isArray(r.items) || r.items.length < LIMITS.itemsMin) {
    errors.items = 'Tambahkan minimal satu jenis limbah.'
  } else if (r.items.length > LIMITS.itemsMax) {
    errors.items = `Maksimal ${LIMITS.itemsMax} jenis limbah per kiriman.`
  } else {
    r.items.forEach((it: unknown, i: number) => {
      const row = (typeof it === 'object' && it !== null ? it : {}) as Record<string, unknown>
      const p = `items.${i}`
      const code = text(row.waste_code)
      if (!CODE_RE.test(code)) errors[`${p}.waste_code`] = 'Pilih jenis limbah B3.'
      const pkg = text(row.packaging_code)
      if (pkg && !PKG_RE.test(pkg)) errors[`${p}.packaging_code`] = 'Pilih jenis kemasan.'
      let count: number | null = null
      if (
        row.package_count !== undefined &&
        row.package_count !== null &&
        row.package_count !== ''
      ) {
        count = Number(row.package_count)
        if (!Number.isInteger(count) || count < 1 || count > LIMITS.packagesMax)
          errors[`${p}.package_count`] = 'Jumlah kemasan minimal 1.'
      }
      const kg = Number(row.weight_kg)
      if (!Number.isFinite(kg) || kg <= 0) errors[`${p}.weight_kg`] = 'Isi berat (kg) lebih dari 0.'
      else if (kg > LIMITS.kgMax) errors[`${p}.weight_kg`] = 'Berat terlalu besar, periksa lagi.'
      items.push({
        waste_code: code,
        packaging_code: pkg || null,
        package_count: count,
        weight_kg: Math.round(kg * 100) / 100,
      })
    })
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      idempotency_key: idem.toLowerCase(),
      entry_date: entry,
      source,
      sender_name: sender,
      entity,
      phone_e164: (phone as { ok: true; e164: string }).e164,
      notes: notes || null,
      photo_count: photoCount,
      confirm_sealed: true,
      confirm_no_leak: true,
      confirm_labeled: true,
      items,
    },
  }
}
