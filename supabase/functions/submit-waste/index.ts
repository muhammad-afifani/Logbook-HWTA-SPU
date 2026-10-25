/// <reference path="../deno-shim.d.ts" />
/**
 * POST /functions/v1/submit-waste   (publik, verify_jwt = false)
 * Body: { turnstile_token, submission: SubmissionInput }   Content-Type: application/json, ≤ 64 KiB
 * Sukses: 201 { ticket_code, created: true, uploads } | 200 { ..., created: false } (kirim ulang)
 * Error : { error, fields?, retry_after? } — 400/403/405/413/415/422/429/500.
 * Seluruh logika ada di _shared/submit-handler.ts (diuji Vitest); file ini hanya merangkai env.
 */
import { loadEnv } from '../_shared/env.ts'
import { hashIp, hostnamesFromOrigins, verifyTurnstile } from '../_shared/security.ts'
import { createSubmitHandler, TURNSTILE_ACTION } from '../_shared/submit-handler.ts'
import { createSignedUploadUrl, rpc as restRpc } from '../_shared/supabase-rest.ts'

const env = loadEnv()
const svc = { url: env.url, publicUrl: env.publicUrl, apiKey: env.serviceKey }
const allowedHostnames = hostnamesFromOrigins(env.allowedOrigins)

Deno.serve(
  createSubmitHandler({
    allowedOrigins: env.allowedOrigins,
    configured: Boolean(env.serviceKey && env.ipSalt && env.turnstileSecret),
    rpc: <T>(fn: string, args: Record<string, unknown>) => restRpc<T>(svc, fn, args),
    createUploadUrl: (path) => createSignedUploadUrl(svc, 'submission-photos', path),
    verifyTurnstile: ({ token, ip, idempotencyKey }) =>
      verifyTurnstile(token, env.turnstileSecret, ip, {
        idempotencyKey,
        expectedAction: TURNSTILE_ACTION,
        allowedHostnames,
      }),
    hashIp: (ip) => hashIp(ip, env.ipSalt),
  }),
)
