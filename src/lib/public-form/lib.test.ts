import { createMemoryStore } from './kv'
import {
  clearDraft,
  createDebouncedSaver,
  emptyDraft,
  isDraftMeaningful,
  loadDraft,
  loadDraftPhotos,
  saveDraft,
  saveDraftPhotos,
} from './draft-store'
import { compressImage, fitWithin, MAX_BYTES, PhotoError } from './image-compress'
import { createQueue, MAX_QUEUE } from './offline-queue'
import { ApiError, NetworkError } from './api'
import { photoIndex, sendSubmission, uploadPhotos, type SubmitApi } from './submit-service'
import type { SubmissionInput } from '@shared/submission.ts'

const sub: SubmissionInput = {
  idempotency_key: '00000000-0000-4000-8000-000000000001',
  entry_date: '2026-10-25',
  source: 'Workshop Uji',
  sender_name: 'Uji Coba 01',
  entity: 'PT Dummy',
  phone: '0812-0000-0001',
  photo_count: 2,
  confirm_sealed: true,
  confirm_no_leak: true,
  confirm_labeled: true,
  items: [{ waste_code: 'B105d', weight_kg: 10 }],
}

describe('draft-store', () => {
  beforeEach(() => localStorage.clear())

  it('simpan → muat → hapus', () => {
    const d = { ...emptyDraft('2026-10-25'), source: 'Workshop Uji' }
    expect(isDraftMeaningful(emptyDraft('2026-10-25'))).toBe(false)
    expect(isDraftMeaningful(d)).toBe(true)
    saveDraft(d)
    expect(loadDraft()?.source).toBe('Workshop Uji')
    clearDraft()
    expect(loadDraft()).toBeNull()
  })

  it('draft rusak / versi lain diabaikan', () => {
    localStorage.setItem('spu-form-draft-v1', '{rusak')
    expect(loadDraft()).toBeNull()
    localStorage.setItem('spu-form-draft-v1', JSON.stringify({ version: 2 }))
    expect(loadDraft()).toBeNull()
  })

  it('penyimpan tertunda menggabungkan ketikan cepat', () => {
    vi.useFakeTimers()
    const saver = createDebouncedSaver(400)
    saver.save({ ...emptyDraft('2026-10-25'), source: 'a' })
    saver.save({ ...emptyDraft('2026-10-25'), source: 'ab' })
    expect(loadDraft()).toBeNull()
    vi.advanceTimersByTime(401)
    expect(loadDraft()?.source).toBe('ab')
    vi.useRealTimers()
  })

  it('foto draft bertahan di store', async () => {
    const store = createMemoryStore()
    const blob = new Blob(['x'], { type: 'image/webp' })
    await saveDraftPhotos(store, [blob])
    expect(await loadDraftPhotos(store)).toHaveLength(1)
    await saveDraftPhotos(store, [])
    expect(await loadDraftPhotos(store)).toHaveLength(0)
  })
})

describe('offline-queue', () => {
  it('enqueue, list berurutan, update, remove', async () => {
    const q = createQueue(createMemoryStore())
    await q.enqueue({ key: 'b', submission: sub, photos: [], createdAt: 2 })
    await q.enqueue({ key: 'a', submission: sub, photos: [], createdAt: 1 })
    expect((await q.list()).map((i) => i.key)).toEqual(['a', 'b'])
    await q.update('a', { lastError: 'offline' })
    expect((await q.list())[0]!.lastError).toBe('offline')
    await q.remove('a')
    expect((await q.list()).map((i) => i.key)).toEqual(['b'])
  })
  it('batas antrean', async () => {
    const q = createQueue(createMemoryStore())
    for (let i = 0; i < MAX_QUEUE; i++)
      await q.enqueue({ key: `k${i}`, submission: sub, photos: [] })
    await expect(q.enqueue({ key: 'lagi', submission: sub, photos: [] })).rejects.toThrow(/penuh/)
    await q.enqueue({ key: 'k0', submission: sub, photos: [] }) // menimpa yang sama diperbolehkan
  })
})

describe('image-compress', () => {
  it('fitWithin: skala ke 1280, tidak memperbesar', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: 1280 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1280, 1280)).toEqual({ width: 1280, height: 1280 })
  })

  it('menolak non-gambar dan file terlalu besar', async () => {
    await expect(compressImage(new Blob(['x'], { type: 'text/plain' }))).rejects.toBeInstanceOf(
      PhotoError,
    )
    const big = new Blob(['x'], { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 31 * 1024 * 1024 })
    await expect(compressImage(big)).rejects.toThrow(/terlalu besar/)
  })

  it('mengecilkan kualitas sampai ≤ 900 KB dan memakai JPEG bila WebP tak didukung', async () => {
    vi.stubGlobal('createImageBitmap', async () => ({ width: 4000, height: 3000, close() {} }))
    const sizes = [2_000_000, 1_500_000, 700_000]
    let n = 0
    const drawn: number[] = []
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (_s: unknown, _x: number, _y: number, w: number) => drawn.push(w),
      }),
      toBlob: (cb: (b: Blob | null) => void, type: string) => {
        const size = sizes[Math.min(n++, sizes.length - 1)]!
        const blob = new Blob([new Uint8Array(8)], {
          type: type === 'image/webp' && n === 1 ? 'image/png' : type,
        })
        Object.defineProperty(blob, 'size', { value: size })
        cb(blob)
      },
    }
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'canvas'
        ? canvas
        : document.createElementNS('http://www.w3.org/1999/xhtml', tag)) as never)
    const out = await compressImage(new Blob(['x'], { type: 'image/jpeg' }))
    expect(out.size).toBeLessThanOrEqual(MAX_BYTES)
    expect(drawn[0]).toBe(1280)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
})

describe('submit-service', () => {
  const blob = (t = 'image/webp') => new Blob(['x'], { type: t })
  const api = (over: Partial<SubmitApi> = {}): SubmitApi => ({
    submitWaste: vi.fn().mockResolvedValue({
      ticket_code: 'SPU-2610-0001-K7QX',
      created: true,
      uploads: [
        { path: 'submissions/x/1.webp', url: 'u1', token: 't' },
        { path: 'submissions/x/2.webp', url: 'u2', token: 't' },
      ],
    }),
    uploadPhoto: vi.fn().mockResolvedValue(undefined),
    ...over,
  })

  it('nomor foto dari path', () => {
    expect(photoIndex('submissions/x/1.webp')).toBe(0)
    expect(photoIndex('submissions/x/3.webp')).toBe(2)
    expect(photoIndex('submissions/x/9.webp')).toBe(-1)
  })

  it('berhasil: kirim lalu unggah foto sesuai nomor', async () => {
    const a = api()
    const out = await sendSubmission(a, sub, [blob(), blob()], 'tok')
    expect(out).toEqual({
      kind: 'sent',
      ticket: 'SPU-2610-0001-K7QX',
      created: true,
      photosFailed: 0,
    })
    expect(a.uploadPhoto).toHaveBeenCalledTimes(2)
    expect(a.submitWaste).toHaveBeenCalledWith({ turnstile_token: 'tok', submission: sub })
  })

  it('tanpa token: body tidak memuat turnstile_token (kirim ulang idempoten)', async () => {
    const a = api()
    await sendSubmission(a, sub, [blob(), blob()])
    expect(a.submitWaste).toHaveBeenCalledWith({ submission: sub })
  })

  it.each([
    [new NetworkError(), { kind: 'offline' }],
    [new ApiError(403, 'x'), { kind: 'needs-verification', hadToken: true }],
    [
      new ApiError(422, 'Periksa', { phone: 'salah' }),
      { kind: 'invalid', message: 'Periksa', fields: { phone: 'salah' } },
    ],
    [new ApiError(429, 'x', undefined, 30), { kind: 'rate-limited', retryAfter: 30 }],
  ])('pemetaan error %#', async (err, expected) => {
    const out = await sendSubmission(
      api({ submitWaste: vi.fn().mockRejectedValue(err) }),
      sub,
      [],
      'tok',
    )
    expect(out).toEqual(expected)
  })

  it('500 → error generik tanpa detail server', async () => {
    const out = await sendSubmission(
      api({ submitWaste: vi.fn().mockRejectedValue(new ApiError(500, 'boom: detail')) }),
      sub,
      [],
    )
    expect(out.kind).toBe('error')
    expect(JSON.stringify(out)).not.toContain('boom')
  })

  it('foto gagal: dicoba ulang lalu dihitung gagal, kiriman tetap berhasil', async () => {
    const upload = vi.fn().mockRejectedValue(new NetworkError())
    const out = await sendSubmission(api({ uploadPhoto: upload }), sub, [blob(), blob()], 'tok', {
      uploadDelayMs: 1,
    })
    expect(out).toMatchObject({ kind: 'sent', photosFailed: 2 })
    expect(upload).toHaveBeenCalledTimes(6) // 3 percobaan x 2 foto
  })

  it('error 4xx saat unggah tidak dicoba ulang', async () => {
    const upload = vi.fn().mockRejectedValue(new ApiError(403, 'RLS'))
    const failed = await uploadPhotos(
      api({ uploadPhoto: upload }),
      [{ path: 'submissions/x/1.webp', url: 'u', token: 't' }],
      [blob()],
      1,
    )
    expect(failed).toBe(1)
    expect(upload).toHaveBeenCalledTimes(1)
  })
})

describe('newId', () => {
  it('UUID v4 valid walau crypto.randomUUID tidak tersedia', async () => {
    const { newId } = await import('./draft-store')
    const real = crypto.randomUUID
    // @ts-expect-error simulasi konteks tak aman
    delete crypto.randomUUID
    try {
      const a = newId()
      const b = newId()
      expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(a).not.toBe(b)
    } finally {
      crypto.randomUUID = real
    }
  })
})
