/**
 * Draft form tersimpan otomatis DI PERANGKAT INI saja (localStorage untuk teks, IndexedDB untuk foto).
 * Tidak pernah dikirim ke server sebelum pengguna menekan Kirim. Dihapus setelah berhasil dikirim.
 */
import type { SubmissionInput } from '@shared/submission.ts'
import type { BlobStore } from './kv'

export interface DraftItem {
  /** id lokal baris (untuk key React), bukan dikirim ke server. */
  id: string
  waste_code: string
  packaging_code: string
  /** null = jumlah belum pasti → server memperkirakan dari berat. */
  package_count: number | null
  /** Teks apa adanya agar "12," tidak merusak ketikan; di-parse saat validasi. */
  weight_kg: string
}

export interface Draft {
  version: 1
  /** Kunci idempotensi satu kali pengisian; dibuat ulang setelah sukses / "Isi lagi". */
  idempotency_key: string
  step: 0 | 1 | 2
  entry_date: string
  source: string
  sender_name: string
  entity: string
  phone: string
  items: DraftItem[]
  notes: string
  confirm_sealed: boolean
  confirm_no_leak: boolean
  confirm_labeled: boolean
  photo_count: number
  updated_at: number
}

const KEY = 'spu-form-draft-v1'
const PHOTO_STORE = 'photos'
const PHOTO_KEY = 'draft'

/** UUID v4 acak 122-bit. getRandomValues tersedia juga di konteks tak aman (tanpa randomUUID). */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function emptyItem(): DraftItem {
  return { id: newId(), waste_code: '', packaging_code: '', package_count: 1, weight_kg: '' }
}

export function emptyDraft(today: string): Draft {
  return {
    version: 1,
    idempotency_key: newId(),
    step: 0,
    entry_date: today,
    source: '',
    sender_name: '',
    entity: '',
    phone: '',
    items: [emptyItem()],
    notes: '',
    confirm_sealed: false,
    confirm_no_leak: false,
    confirm_labeled: false,
    photo_count: 0,
    updated_at: Date.now(),
  }
}

function isDraft(v: unknown): v is Draft {
  const d = v as Draft
  return (
    !!d &&
    d.version === 1 &&
    typeof d.idempotency_key === 'string' &&
    Array.isArray(d.items) &&
    d.items.length > 0 &&
    typeof d.entry_date === 'string' &&
    [0, 1, 2].includes(d.step)
  )
}

export function loadDraft(storage: Storage | null = safeLocal()): Draft | null {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isDraft(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveDraft(d: Draft, storage: Storage | null = safeLocal()): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ ...d, updated_at: Date.now() }))
  } catch {
    /* kuota penuh / mode privat: abaikan, form tetap berfungsi */
  }
}

export function clearDraft(storage: Storage | null = safeLocal()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    /* abaikan */
  }
}

/** Draft kosong/belum diisi apa pun tidak perlu dipulihkan. */
export function isDraftMeaningful(d: Draft): boolean {
  return Boolean(
    d.source ||
    d.sender_name ||
    d.entity ||
    d.phone ||
    d.notes ||
    d.photo_count > 0 ||
    d.items.some((i) => i.waste_code || i.weight_kg),
  )
}

function safeLocal(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Penyimpan tertunda: gabungkan ketikan cepat jadi satu tulis. */
export function createDebouncedSaver(delay = 400, storage?: Storage | null) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Draft | null = null
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (pending) saveDraft(pending, storage)
    pending = null
  }
  return {
    save(d: Draft) {
      pending = d
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delay)
    },
    flush,
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
      pending = null
    },
  }
}

/* ------------------------------------------------------------------ foto draft */
export async function loadDraftPhotos(store: BlobStore): Promise<Blob[]> {
  const v = await store.get<Blob[]>(PHOTO_STORE, PHOTO_KEY)
  return Array.isArray(v) ? v.filter((b) => b instanceof Blob).slice(0, 3) : []
}
export const saveDraftPhotos = (store: BlobStore, photos: Blob[]) =>
  photos.length ? store.put(PHOTO_STORE, PHOTO_KEY, photos) : store.delete(PHOTO_STORE, PHOTO_KEY)
export const clearDraftPhotos = (store: BlobStore) => store.delete(PHOTO_STORE, PHOTO_KEY)

/** Draft → input yang divalidasi/dikirim (nilai berat masih teks; diparse oleh pemanggil). */
export type DraftToInput = (d: Draft, weights: number[]) => SubmissionInput
