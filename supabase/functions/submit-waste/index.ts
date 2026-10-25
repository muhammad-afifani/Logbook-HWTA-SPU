/// <reference path="../deno-shim.d.ts" />
/**
 * POST /functions/v1/submit-waste
 * Body: { turnstile_token, submission: SubmissionInput }
 * Alur: CORS → validasi skema → rate limit per hash IP → verifikasi Turnstile (server)
 *       → svc_create_submission (service role, idempoten) → signed upload URL foto.
 */
import { loadEnv } from '../_shared/env.ts'
import { corsHeaders, json, readJson } from '../_shared/http.ts'
import { clientIp, hashIp, verifyTurnstile } from '../_shared/security.ts'
import { validateSubmission } from '../_shared/submission.ts'
import { createSignedUploadUrl, RestError, rpc } from '../_shared/supabase-rest.ts'
import { todayInZone } from '../_shared/dates.ts'

const env = loadEnv()
const svc = { url: env.url, publicUrl: env.publicUrl, apiKey: env.serviceKey }

interface FormOptions {
  backdate_max_days: number
  timezone: string
}
interface CreateResult {
  submission_id: string
  ticket_code: string
  created: boolean
  photo_paths: string[]
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'), env.allowedOrigins)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Metode tidak didukung.' }, cors)
  if (!env.serviceKey || !env.ipSalt || !env.turnstileSecret) {
    return json(500, { error: 'Server belum dikonfigurasi.' }, cors)
  }

  let body: Record<string, unknown>
  try {
    body = (await readJson(req)) as Record<string, unknown>
  } catch {
    return json(400, { error: 'Data kiriman tidak terbaca.' }, cors)
  }

  try {
    const opts = await rpc<FormOptions>(svc, 'svc_form_options', {})
    const result = validateSubmission(body.submission, {
      today: todayInZone(opts.timezone),
      backdateMaxDays: Number(opts.backdate_max_days),
    })
    if (!result.ok)
      return json(422, { error: 'Periksa kembali isian.', fields: result.errors }, cors)

    const ip = clientIp(req.headers)
    const ipHash = await hashIp(ip, env.ipSalt)
    const allowed = await rpc<boolean>(svc, 'svc_rate_limit', {
      p_ip_hash: ipHash,
      p_bucket: 'submit',
      p_limit: 10,
      p_window_seconds: 3600,
    })
    if (!allowed) {
      return json(429, { error: 'Terlalu banyak kiriman. Coba lagi dalam 1 jam.' }, cors)
    }

    const human = await verifyTurnstile(String(body.turnstile_token ?? ''), env.turnstileSecret, ip)
    if (!human)
      return json(403, { error: 'Verifikasi keamanan gagal. Muat ulang lalu coba lagi.' }, cors)

    const created = await rpc<CreateResult>(svc, 'svc_create_submission', {
      p: result.value,
      p_ip_hash: ipHash,
    })
    const uploads = await Promise.all(
      created.photo_paths.map((path) => createSignedUploadUrl(svc, 'submission-photos', path)),
    )
    return json(
      created.created ? 201 : 200,
      {
        ticket_code: created.ticket_code,
        created: created.created,
        uploads,
      },
      cors,
    )
  } catch (e) {
    if (e instanceof RestError && e.code === 'LB002') return json(422, { error: e.message }, cors)
    console.error(
      'submit-waste gagal',
      e instanceof RestError ? `${e.status} ${e.code} ${e.message}` : String(e),
    )
    return json(
      500,
      { error: 'Gagal menyimpan. Data Anda tetap tersimpan di perangkat; coba lagi.' },
      cors,
    )
  }
})
