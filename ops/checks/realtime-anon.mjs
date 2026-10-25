#!/usr/bin/env node
// =============================================================================
// Cek otorisasi REALTIME untuk anon (hanya anon key; tidak menulis ke database).
//
// Pakai:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=... node ops/checks/realtime-anon.mjs
//   opsi: --listen <detik>   tunggu event "changed" asli (picu perubahan data dari tempat lain)
//         --strict-public    anggap WARN "topik publik sembarang" sebagai GAGAL
//
// Yang diperiksa:
//   R1  anon TIDAK boleh membaca channel private selain spu:public.
//   R2  anon TIDAK boleh menyuntikkan event palsu ke spu:public (hanya boleh menerima).
//   R3  anon tidak boleh memakai topik publik sembarang sebagai relay
//       (butuh Dashboard → Realtime → Settings → matikan "Allow public access").
//   R4  (opsional --listen) event "changed" dari trigger database sampai ke anon.
//
// PERHATIAN: R2 mengirim satu event uji "changed" bila perlindungan BELUM aktif — klien hanya
// memuat ulang data, tidak ada data yang diubah.
// =============================================================================
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL dan SUPABASE_ANON_KEY')
  process.exit(2)
}
const args = process.argv.slice(2)
const strictPublic = args.includes('--strict-public')
const listenIdx = args.indexOf('--listen')
const listenSeconds = listenIdx >= 0 ? Number(args[listenIdx + 1] ?? 15) : 0

const TOPIC = 'spu:public'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const clients = []
const mk = () => {
  const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  clients.push(c)
  return c
}

/** Join channel; kembalikan status akhir (SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / TIMEOUT). */
function join(sb, topic, config, onChanged) {
  return new Promise((resolve) => {
    const ch = sb.channel(topic, { config })
    if (onChanged) ch.on('broadcast', { event: 'changed' }, (m) => onChanged(m.payload))
    const timer = setTimeout(() => resolve({ ch, status: 'TIMEOUT' }), 8000)
    ch.subscribe((status, err) => {
      if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        clearTimeout(timer)
        resolve({ ch, status, error: err?.message })
      }
    })
  })
}

let failed = false
const report = (level, id, text) => {
  if (level === 'FAIL') failed = true
  console.log(`${level.padEnd(5)} ${id}  ${text}`)
}

// R1 — channel private lain
{
  const { status } = await join(mk(), 'spu:officer-' + Math.random().toString(36).slice(2), {
    private: true,
  })
  if (status === 'SUBSCRIBED') report('FAIL', 'R1', 'anon bisa join channel private sembarang')
  else report('ok', 'R1', `anon ditolak di channel private lain (${status})`)
}

// R2 — spoofing ke spu:public. Coba private dulu (target desain); bila gagal, coba publik.
{
  const got = []
  const listener = mk()
  const sender = mk()
  let mode = { private: true }
  let l = await join(listener, TOPIC, mode, (p) => got.push(p))
  if (l.status !== 'SUBSCRIBED') {
    mode = {}
    l = await join(mk(), TOPIC, mode, (p) => got.push(p))
  }
  if (l.status !== 'SUBSCRIBED') {
    report('ok', 'R2', 'anon tidak bisa join spu:public sama sekali (tidak bisa menyuntik)')
  } else {
    const s = await join(sender, TOPIC, mode)
    if (s.status === 'SUBSCRIBED') {
      await s.ch.send({ type: 'broadcast', event: 'changed', payload: { scope: 'uji-spoof' } })
      await wait(2000)
    }
    const spoofed = got.some((p) => p?.scope === 'uji-spoof')
    if (spoofed) {
      report(
        'FAIL',
        'R2',
        `anon BISA menyuntikkan event palsu ke ${TOPIC} (channel ${mode.private ? 'private' : 'publik'})`,
      )
    } else {
      report(
        'ok',
        'R2',
        `event palsu dari anon tidak sampai ke pendengar lain (channel ${mode.private ? 'private' : 'publik'})`,
      )
    }
    report(
      'INFO',
      'R2',
      mode.private
        ? `anon bisa subscribe ${TOPIC} sebagai channel private (hanya menerima)`
        : `anon bisa subscribe ${TOPIC} sebagai channel PUBLIK (tanpa RLS)`,
    )
  }
}

// R3 — topik publik sembarang
{
  const { status } = await join(mk(), 'relay-uji-' + Math.random().toString(36).slice(2), {})
  if (status === 'SUBSCRIBED') {
    report(
      strictPublic ? 'FAIL' : 'WARN',
      'R3',
      'anon bisa join topik PUBLIK sembarang → matikan "Allow public access" di Dashboard → Realtime → Settings',
    )
  } else {
    report('ok', 'R3', `topik publik sembarang ditolak (${status})`)
  }
}

// R4 — event asli
if (listenSeconds > 0) {
  const got = []
  let r = await join(mk(), TOPIC, { private: true }, (p) => got.push(p))
  if (r.status !== 'SUBSCRIBED') r = await join(mk(), TOPIC, {}, (p) => got.push(p))
  console.log(
    `...  R4  mendengarkan ${TOPIC} selama ${listenSeconds} dtk (picu perubahan data sekarang)`,
  )
  await wait(listenSeconds * 1000)
  const real = got.filter((p) => p && p.scope !== 'uji-spoof')
  if (real.length === 0) report('FAIL', 'R4', 'tidak ada event "changed" asli yang diterima')
  else {
    const keys = [...new Set(real.flatMap((p) => Object.keys(p)))].sort().join(',')
    report('ok', 'R4', `${real.length} event diterima; kunci payload: ${keys}`)
  }
}

for (const c of clients) await c.removeAllChannels()
console.log(failed ? '\nHASIL: GAGAL' : '\nHASIL: LULUS (tanpa FAIL)')
process.exit(failed ? 1 : 0)
