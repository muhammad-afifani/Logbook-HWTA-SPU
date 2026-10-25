// Cek anggaran bundle halaman form (/lapor) dari manifest Vite.
// - Jumlah gzip semua JS yang dimuat statis untuk entry + route form <= BUDGET_KB.
// - Tidak boleh ada kode three.js / R3F di closure tersebut.
// Jalankan setelah `vite build` (build.manifest = true).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = 180
const FORM_ROUTE = 'src/routes/LaporPage.tsx'
const dist = 'dist'
const manifest = JSON.parse(readFileSync(join(dist, '.vite/manifest.json'), 'utf8'))

function closure(keys) {
  const seen = new Set()
  const walk = (key) => {
    if (seen.has(key)) return
    const chunk = manifest[key]
    if (!chunk) throw new Error(`Chunk ${key} tidak ada di manifest`)
    seen.add(key)
    for (const dep of chunk.imports ?? []) walk(dep)
  }
  keys.forEach(walk)
  return [...seen]
}

const entry = Object.keys(manifest).find((k) => manifest[k].isEntry)
const keys = closure([entry, FORM_ROUTE])
let total = 0
const rows = []
const banned = /WebGLRenderer|THREE\.|@react-three/
const offenders = []

for (const key of keys) {
  const file = manifest[key].file
  if (!file.endsWith('.js')) continue
  const src = readFileSync(join(dist, file))
  const gz = gzipSync(src, { level: 9 }).length
  total += gz
  rows.push({ chunk: file, gzipKB: +(gz / 1024).toFixed(1) })
  if (banned.test(src.toString())) offenders.push(file)
}

console.table(rows)
const totalKB = total / 1024
console.log(`JS awal halaman form: ${totalKB.toFixed(1)} KB gzip (anggaran ${BUDGET_KB} KB)`)

let failed = false
if (totalKB > BUDGET_KB) {
  console.error(`GAGAL: melebihi anggaran ${BUDGET_KB} KB`)
  failed = true
}
if (offenders.length) {
  console.error(`GAGAL: kode 3D ikut termuat di halaman form: ${offenders.join(', ')}`)
  failed = true
}
process.exit(failed ? 1 : 0)
