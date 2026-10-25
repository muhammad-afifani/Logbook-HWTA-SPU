/// <reference path="../deno-shim.d.ts" />
/**
 * GET /functions/v1/form-options
 * Master data untuk form publik (jenis limbah, kemasan, kelompok, saran yang DISETUJUI
 * petugas). Disajikan lewat service role agar anon tetap tanpa akses tabel.
 */
import { loadEnv } from '../_shared/env.ts'
import { corsHeaders, json } from '../_shared/http.ts'
import { RestError, rpc } from '../_shared/supabase-rest.ts'

const env = loadEnv()
const svc = { url: env.url, publicUrl: env.publicUrl, apiKey: env.serviceKey }

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'), env.allowedOrigins)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'GET') return json(405, { error: 'Metode tidak didukung.' }, cors)
  try {
    const options = await rpc<unknown>(svc, 'svc_form_options', {})
    return json(200, options, { ...cors, 'Cache-Control': 'public, max-age=300' })
  } catch (e) {
    console.error('form-options gagal', e instanceof RestError ? `${e.status} ${e.code}` : 'error')
    return json(500, { error: 'Gagal memuat data form.' }, cors)
  }
})
