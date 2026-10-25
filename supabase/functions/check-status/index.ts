/// <reference path="../deno-shim.d.ts" />
/**
 * POST /functions/v1/check-status   Body: { ticket_code }
 * Status tiket tanpa data pribadi. Rate limit per hash IP mencegah tebak-tebakan kode.
 */
import { loadEnv } from '../_shared/env.ts'
import { corsHeaders, json, readJson } from '../_shared/http.ts'
import { clientIp, hashIp } from '../_shared/security.ts'
import { RestError, rpc } from '../_shared/supabase-rest.ts'
import { normalizeTicketCode } from '../_shared/ticket.ts'

const env = loadEnv()
const svc = { url: env.url, publicUrl: env.publicUrl, apiKey: env.serviceKey }

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'), env.allowedOrigins)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Metode tidak didukung.' }, cors)
  if (!env.serviceKey || !env.ipSalt)
    return json(500, { error: 'Server belum dikonfigurasi.' }, cors)

  let code: string | null = null
  try {
    const body = (await readJson(req, 1024)) as { ticket_code?: string }
    code = normalizeTicketCode(String(body.ticket_code ?? ''))
  } catch {
    /* ditangani di bawah */
  }
  if (!code) return json(422, { error: 'Format kode tiket: SPU-YYMM-NNNN-XXXX.' }, cors)

  try {
    const ipHash = await hashIp(clientIp(req.headers), env.ipSalt)
    const allowed = await rpc<boolean>(svc, 'svc_rate_limit', {
      p_ip_hash: ipHash,
      p_bucket: 'status',
      p_limit: 60,
      p_window_seconds: 3600,
    })
    if (!allowed) return json(429, { error: 'Terlalu banyak percobaan. Coba lagi nanti.' }, cors)

    const status = await rpc<unknown>(svc, 'svc_ticket_status', { p_code: code })
    if (!status) return json(404, { error: 'Tiket tidak ditemukan.' }, cors)
    return json(200, status, { ...cors, 'Cache-Control': 'no-store' })
  } catch (e) {
    console.error('check-status gagal', e instanceof RestError ? `${e.status} ${e.code}` : 'error')
    return json(500, { error: 'Gagal memeriksa status. Coba lagi.' }, cors)
  }
})
