/// <reference path="../deno-shim.d.ts" />
/**
 * POST /functions/v1/photo-url   Header: Authorization: Bearer <JWT petugas>
 * Body: { submission_id }
 * SATU-SATUNYA tempat signed URL foto dibuat. Peran petugas dicek di DB lewat
 * officer_list_photos() dengan JWT pengguna; lalu URL ditandatangani service role,
 * berlaku 60 detik. Tidak ada policy storage untuk anon/authenticated.
 */
import { loadEnv } from '../_shared/env.ts'
import { corsHeaders, json, readJson } from '../_shared/http.ts'
import { createSignedUrl, RestError, rpc } from '../_shared/supabase-rest.ts'

const env = loadEnv()
const svc = { url: env.url, publicUrl: env.publicUrl, apiKey: env.serviceKey }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIGNED_URL_TTL_SECONDS = 60

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'), env.allowedOrigins)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Metode tidak didukung.' }, cors)

  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!jwt) return json(401, { error: 'Login petugas diperlukan.' }, cors)

  let submissionId = ''
  try {
    submissionId = String(
      ((await readJson(req, 1024)) as { submission_id?: string }).submission_id ?? '',
    )
  } catch {
    /* ditangani di bawah */
  }
  if (!UUID_RE.test(submissionId)) return json(422, { error: 'submission_id tidak valid.' }, cors)

  try {
    // Cek peran memakai JWT pengguna (RLS & is_officer() di DB), bukan service role.
    const paths = await rpc<string[]>(
      { url: env.url, apiKey: env.anonKey, bearer: jwt },
      'officer_list_photos',
      { p_submission_id: submissionId },
    )
    const urls: { path: string; url: string }[] = []
    for (const path of paths) {
      try {
        urls.push({
          path,
          url: await createSignedUrl(svc, 'submission-photos', path, SIGNED_URL_TTL_SECONDS),
        })
      } catch {
        // Foto belum diunggah (kiriman tanpa koneksi): lewati.
      }
    }
    return json(
      200,
      { expires_in: SIGNED_URL_TTL_SECONDS, photos: urls },
      { ...cors, 'Cache-Control': 'no-store' },
    )
  } catch (e) {
    if (e instanceof RestError && (e.code === 'LB003' || e.status === 401 || e.status === 403)) {
      return json(403, { error: 'Hanya petugas SPU yang berwenang.' }, cors)
    }
    console.error('photo-url gagal', e instanceof RestError ? `${e.status} ${e.code}` : 'error')
    return json(500, { error: 'Gagal membuat tautan foto.' }, cors)
  }
})
