/** Respons JSON + CORS untuk Edge Functions. Origin diizinkan dari env ALLOWED_ORIGINS. */
export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const allow = origin && allowed.includes(origin) ? origin : (allowed[0] ?? '')
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

export class BodyTooLargeError extends Error {
  constructor() {
    super('payload-too-large')
    this.name = 'BodyTooLargeError'
  }
}

/**
 * Baca body sebagai teks UTF-8 dengan batas BYTE. Ditolak lebih awal bila header
 * content-length melebihi batas; selain itu stream dibaca bertahap dan dihentikan begitu
 * melewati batas (tidak pernah menampung body tanpa batas di memori).
 * UTF-8 rusak → TypeError (perlakukan sebagai body tak terbaca).
 */
export async function readBodyText(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError()
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new BodyTooLargeError()
    }
    chunks.push(value)
  }
  const buf = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    buf.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(buf)
}

/** Baca body JSON dengan batas ukuran (byte). */
export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  return JSON.parse(await readBodyText(req, maxBytes))
}
