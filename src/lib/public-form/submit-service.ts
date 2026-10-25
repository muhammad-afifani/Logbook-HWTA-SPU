/**
 * Mengirim kiriman + mengunggah foto, dengan hasil bertipe agar UI bisa memilih tindakan:
 * tampilkan tiket, minta verifikasi ulang (Turnstile), tampilkan error per field, atau antre.
 * API disuntikkan agar mudah diuji.
 */
import type { SubmissionInput } from '@shared/submission.ts'
import { ApiError, NetworkError, type SubmitBody } from './api'
import type { SubmitResult, UploadTarget } from './types'

export interface SubmitApi {
  submitWaste(body: SubmitBody): Promise<SubmitResult>
  uploadPhoto(target: UploadTarget, blob: Blob): Promise<void>
}

export type SendOutcome =
  | { kind: 'sent'; ticket: string; created: boolean; photosFailed: number }
  | { kind: 'needs-verification'; hadToken: boolean }
  | { kind: 'invalid'; message: string; fields?: Record<string, string> }
  | { kind: 'rate-limited'; retryAfter?: number }
  | { kind: 'offline' }
  | { kind: 'error'; message: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Nomor foto 0-based dari path `submissions/<id>/<n>.webp`. */
export function photoIndex(path: string): number {
  const m = /\/([1-3])\.webp$/.exec(path)
  return m ? Number(m[1]) - 1 : -1
}

async function uploadWithRetry(
  api: SubmitApi,
  target: UploadTarget,
  blob: Blob,
  attempts = 3,
  delayMs = 700,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      await api.uploadPhoto(target, blob)
      return true
    } catch (e) {
      const retryable = e instanceof NetworkError || (e instanceof ApiError && e.status >= 500)
      if (!retryable || i === attempts - 1) return false
      await sleep(delayMs * (i + 1))
    }
  }
  return false
}

export async function uploadPhotos(
  api: SubmitApi,
  uploads: UploadTarget[],
  photos: Blob[],
  delayMs?: number,
): Promise<number> {
  let failed = 0
  for (const target of uploads) {
    const blob = photos[photoIndex(target.path)]
    if (!blob) continue
    if (!(await uploadWithRetry(api, target, blob, 3, delayMs))) failed++
  }
  return failed
}

export async function sendSubmission(
  api: SubmitApi,
  submission: SubmissionInput,
  photos: Blob[],
  turnstileToken?: string,
  opts: { uploadDelayMs?: number } = {},
): Promise<SendOutcome> {
  let result: SubmitResult
  try {
    result = await api.submitWaste({
      ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
      submission,
    })
  } catch (e) {
    if (e instanceof NetworkError) return { kind: 'offline' }
    if (e instanceof ApiError) {
      if (e.status === 403) return { kind: 'needs-verification', hadToken: Boolean(turnstileToken) }
      if (e.status === 422) return { kind: 'invalid', message: e.message, fields: e.fields }
      if (e.status === 429) return { kind: 'rate-limited', retryAfter: e.retryAfter }
      if (e.status === 413)
        return { kind: 'error', message: 'Data terlalu besar. Kurangi catatan atau foto.' }
      return {
        kind: 'error',
        message: 'Server sedang bermasalah. Data Anda aman di perangkat; coba lagi sebentar lagi.',
      }
    }
    return { kind: 'error', message: 'Terjadi kesalahan tak terduga. Coba lagi.' }
  }
  const photosFailed = await uploadPhotos(api, result.uploads, photos, opts.uploadDelayMs)
  return { kind: 'sent', ticket: result.ticket_code, created: result.created, photosFailed }
}
