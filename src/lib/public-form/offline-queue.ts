/**
 * Antrean kirim ulang: kiriman yang gagal karena jaringan disimpan di perangkat (IndexedDB)
 * bersama idempotency_key-nya. Dikirim ulang saat online; aman diulang karena server idempoten.
 * Berisi nama & telepon pengisi di perangkat itu sendiri — dihapus segera setelah terkirim.
 */
import type { SubmissionInput } from '@shared/submission.ts'
import type { BlobStore } from './kv'

export interface QueuedSubmission {
  /** idempotency_key kiriman. */
  key: string
  submission: SubmissionInput
  photos: Blob[]
  createdAt: number
  lastError?: string
}

const STORE = 'queue'
export const MAX_QUEUE = 10

export function createQueue(store: BlobStore) {
  return {
    async list(): Promise<QueuedSubmission[]> {
      const keys = await store.keys(STORE)
      const items = await Promise.all(keys.map((k) => store.get<QueuedSubmission>(STORE, k)))
      return items
        .filter((x): x is QueuedSubmission => !!x)
        .sort((a, b) => a.createdAt - b.createdAt)
    },
    async enqueue(
      item: Omit<QueuedSubmission, 'createdAt'> & { createdAt?: number },
    ): Promise<void> {
      const existing = await store.keys(STORE)
      if (!existing.includes(item.key) && existing.length >= MAX_QUEUE) {
        throw new Error('Antrean kiriman penuh. Kirim atau hapus kiriman tertunda dulu.')
      }
      await store.put(STORE, item.key, { ...item, createdAt: item.createdAt ?? Date.now() })
    },
    remove: (key: string) => store.delete(STORE, key),
    async update(key: string, patch: Partial<QueuedSubmission>): Promise<void> {
      const cur = await store.get<QueuedSubmission>(STORE, key)
      if (cur) await store.put(STORE, key, { ...cur, ...patch, key })
    },
  }
}
export type OfflineQueue = ReturnType<typeof createQueue>
