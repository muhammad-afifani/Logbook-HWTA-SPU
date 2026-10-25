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

/** Baca body JSON dengan batas ukuran. */
export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const text = await req.text()
  if (text.length > maxBytes) throw new Error('payload-too-large')
  return JSON.parse(text)
}
