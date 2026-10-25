/**
 * Klien REST minimal ke Supabase (PostgREST + Storage) via fetch — tanpa dependensi npm,
 * agar Edge Function ringan dan bisa berjalan tanpa unduhan modul.
 */
export interface RestConfig {
  url: string
  /** URL yang terlihat dari browser (lokal: http://127.0.0.1:54321). Default = url. */
  publicUrl?: string
  /** Kunci service role (secret Edge Function) atau anon key + JWT pengguna. */
  apiKey: string
  /** Authorization bearer; default = apiKey. */
  bearer?: string
  fetchImpl?: typeof fetch
}

export class RestError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
  ) {
    super(message)
  }
}

async function call(cfg: RestConfig, path: string, init: RequestInit): Promise<unknown> {
  const f = cfg.fetchImpl ?? fetch
  const res = await f(`${cfg.url}${path}`, {
    ...init,
    headers: {
      apikey: cfg.apiKey,
      Authorization: `Bearer ${cfg.bearer ?? cfg.apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; message?: string; error?: string }
    throw new RestError(res.status, d.code, d.message ?? d.error ?? `HTTP ${res.status}`)
  }
  return data
}

export function rpc<T>(cfg: RestConfig, fn: string, args: Record<string, unknown>): Promise<T> {
  return call(cfg, `/rest/v1/rpc/${fn}`, {
    method: 'POST',
    body: JSON.stringify(args),
  }) as Promise<T>
}

const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

/** Signed upload URL (upload tanpa policy storage; berlaku 2 jam). */
export async function createSignedUploadUrl(
  cfg: RestConfig,
  bucket: string,
  path: string,
): Promise<{ path: string; url: string; token: string }> {
  const data = (await call(cfg, `/storage/v1/object/upload/sign/${bucket}/${encPath(path)}`, {
    method: 'POST',
    headers: { 'x-upsert': 'true' },
    body: '{}',
  })) as { url: string }
  const url = `${cfg.publicUrl ?? cfg.url}/storage/v1${data.url}`
  const token = new URL(url).searchParams.get('token') ?? ''
  return { path, url, token }
}

/** Signed URL baca berumur pendek. */
export async function createSignedUrl(
  cfg: RestConfig,
  bucket: string,
  path: string,
  expiresIn: number,
): Promise<string> {
  const data = (await call(cfg, `/storage/v1/object/sign/${bucket}/${encPath(path)}`, {
    method: 'POST',
    body: JSON.stringify({ expiresIn }),
  })) as { signedURL: string }
  return `${cfg.publicUrl ?? cfg.url}/storage/v1${data.signedURL}`
}
