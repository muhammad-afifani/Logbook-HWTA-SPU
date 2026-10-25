/**
 * Model form: draft → input server, validasi per langkah.
 * Validasi memakai modul YANG SAMA dengan Edge Function (@shared/submission) sehingga aturan
 * tidak bisa berbeda; server tetap memvalidasi ulang (jangan percaya klien).
 */
import { normalizeIndonesianPhone } from '@shared/phone.ts'
import {
  validateSubmission,
  type SubmissionInput,
  type ValidationErrors,
} from '@shared/submission.ts'
import { parseDecimal } from '@/lib/format'
import type { Draft } from '@/lib/public-form/draft-store'

export const STEP_LABELS = ['Data pengirim', 'Item limbah', 'Konfirmasi'] as const

export function draftToInput(d: Draft): SubmissionInput {
  return {
    idempotency_key: d.idempotency_key,
    entry_date: d.entry_date,
    source: d.source,
    sender_name: d.sender_name,
    entity: d.entity,
    phone: d.phone,
    notes: d.notes,
    photo_count: d.photo_count,
    confirm_sealed: d.confirm_sealed,
    confirm_no_leak: d.confirm_no_leak,
    confirm_labeled: d.confirm_labeled,
    items: d.items.map((i) => ({
      waste_code: i.waste_code,
      packaging_code: i.packaging_code || null,
      package_count: i.package_count,
      weight_kg: parseDecimal(i.weight_kg),
    })),
  }
}

export interface ValidateOpts {
  today: string
  backdateMaxDays: number
}

/** Semua error (kunci seperti `items.0.weight_kg`); kosong bila valid. */
export function validateDraft(d: Draft, opts: ValidateOpts): ValidationErrors {
  const result = validateSubmission(draftToInput(d), opts)
  const errors: ValidationErrors = result.ok ? {} : { ...result.errors }
  d.items.forEach((item, i) => {
    const w = item.weight_kg.trim()
    if (w && Number.isNaN(parseDecimal(w)))
      errors[`items.${i}.weight_kg`] = 'Isi dengan angka, contoh 12,5.'
    if (!item.packaging_code) errors[`items.${i}.packaging_code`] = 'Pilih jenis kemasan.'
    if (!item.waste_code) errors[`items.${i}.waste_code`] = 'Pilih jenis limbah B3.'
  })
  return errors
}

const STEP_MATCHERS: ((key: string) => boolean)[] = [
  (k) => ['entry_date', 'source', 'sender_name', 'entity', 'phone', 'idempotency_key'].includes(k),
  (k) => k === 'items' || k.startsWith('items.') || k === 'photo_count',
  (k) => k.startsWith('confirm_') || k === 'notes',
]

/** Langkah pemilik sebuah kunci error. */
export function stepOfKey(key: string): 0 | 1 | 2 {
  const i = STEP_MATCHERS.findIndex((m) => m(key))
  return (i < 0 ? 2 : i) as 0 | 1 | 2
}

export function errorsForStep(errors: ValidationErrors, step: 0 | 1 | 2): ValidationErrors {
  const match = STEP_MATCHERS[step]!
  return Object.fromEntries(Object.entries(errors).filter(([k]) => match(k)))
}

/** Langkah pertama yang masih punya error, atau null. */
export function firstInvalidStep(errors: ValidationErrors): 0 | 1 | 2 | null {
  for (const step of [0, 1, 2] as const) {
    if (Object.keys(errorsForStep(errors, step)).length) return step
  }
  return null
}

export function totalKg(d: Draft): number {
  const sum = d.items.reduce((acc, i) => {
    const v = parseDecimal(i.weight_kg)
    return acc + (Number.isFinite(v) && v > 0 ? v : 0)
  }, 0)
  return Math.round(sum * 100) / 100
}

/** Pratinjau nomor telepon ternormalisasi, mis. "+62 812-0000-0001"; null bila belum valid. */
export function phonePreview(raw: string): string | null {
  const r = normalizeIndonesianPhone(raw)
  if (!r.ok) return null
  const n = r.e164.slice(3)
  return `+62 ${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}`
}
