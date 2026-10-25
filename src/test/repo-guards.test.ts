// @vitest-environment node
/**
 * Penjaga repo (berjalan di setiap `pnpm test` / CI):
 *  - Syarat 2: migrasi tidak mengubah default privileges dan tidak menambah grant/policy
 *    ke skema auth/storage (selain baris bucket privat untuk foto).
 *  - Syarat 5: seed hanya master data (4 tabel), tanpa data pribadi.
 *  - Syarat 6: kode tidak memanggil signUp, signInWithOtp, resetPasswordForEmail.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WASTE_GROUPS } from '@/config/waste-groups'

const root = fileURLToPath(new URL('../..', import.meta.url))
const read = (p: string) => readFileSync(join(root, p), 'utf8')

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(root, dir))) {
    const p = join(dir, name)
    if (statSync(join(root, p)).isDirectory()) out.push(...walk(p, exts))
    else if (exts.some((e) => name.endsWith(e))) out.push(p)
  }
  return out
}

/** Hapus komentar SQL agar hanya statement yang diperiksa. */
const stripSqlComments = (sql: string) =>
  sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

const migrations = walk('supabase/migrations', ['.sql']).map((p) => ({
  path: p,
  sql: stripSqlComments(read(p)).toLowerCase(),
}))

describe('syarat 2: privilese migrasi', () => {
  it('ada migrasi', () => expect(migrations.length).toBeGreaterThanOrEqual(7))

  it.each(migrations.map((m) => [m.path, m.sql]))(
    '%s tanpa ALTER DEFAULT PRIVILEGES',
    (_p, sql) => {
      expect(sql).not.toMatch(/alter\s+default\s+privileges/)
    },
  )

  it.each(migrations.map((m) => [m.path, m.sql]))(
    '%s tanpa GRANT ke skema/objek auth & storage',
    (_p, sql) => {
      expect(sql).not.toMatch(/grant\s[^;]*\bon\s+schema\s+(auth|storage)\b/)
      expect(sql).not.toMatch(
        /grant\s[^;]*\bon\s+(table\s+|all\s+\w+\s+in\s+schema\s+)?(auth|storage)\b/,
      )
      expect(sql).not.toMatch(/grant\s[^;]*\bon\s+function\s+(auth|storage)\./)
    },
  )

  it.each(migrations.map((m) => [m.path, m.sql]))(
    '%s tanpa policy/ALTER di auth & storage',
    (_p, sql) => {
      expect(sql).not.toMatch(/create\s+policy\s[^;]*\bon\s+(auth|storage)\./)
      expect(sql).not.toMatch(/alter\s+(table|schema)\s+(auth|storage)\b/)
    },
  )

  it('satu-satunya sentuhan ke storage = baris bucket privat (public = false)', () => {
    const touches = migrations.filter((m) => /\bstorage\./.test(m.sql))
    expect(touches.map((m) => m.path)).toEqual([
      'supabase/migrations/20261025000700_07_storage.sql',
    ])
    const sql = touches[0]!.sql
    expect(sql).toMatch(/insert\s+into\s+storage\.buckets/)
    expect(sql).not.toMatch(/,\s*true\s*,\s*\d+/) // tidak ada bucket public = true
  })

  it('GRANT ke anon hanya untuk ping() dan public_status()', () => {
    const grants = migrations.flatMap(
      (m) => m.sql.match(/grant\s[^;]*\bto\s[^;]*\banon\b[^;]*;/g) ?? [],
    )
    expect(grants.map((g) => g.replace(/\s+/g, ' ').trim())).toEqual([
      'grant execute on function public.ping() to anon, authenticated;',
      'grant execute on function public.public_status() to anon, authenticated;',
    ])
  })

  it('setiap fungsi SECURITY DEFINER mengunci search_path', () => {
    for (const m of migrations) {
      for (const fn of m.sql.match(/create\s+function[\s\S]*?\$\$/g) ?? []) {
        if (/security\s+definer/.test(fn)) expect(fn, m.path).toMatch(/set\s+search_path\s*=\s*''/)
      }
    }
  })
})

describe('syarat 5: seed hanya master data dummy', () => {
  const seed = stripSqlComments(read('supabase/seed.sql'))

  it('hanya INSERT ke waste_groups, packaging_types, waste_types, app_config', () => {
    const tables = [...seed.matchAll(/insert\s+into\s+([\w.]+)/gi)].map((m) => m[1]!.toLowerCase())
    expect(new Set(tables)).toEqual(
      new Set([
        'public.app_config',
        'public.waste_groups',
        'public.packaging_types',
        'public.waste_types',
      ]),
    )
  })

  it('tanpa nomor telepon, email, atau tabel transaksi', () => {
    expect(seed).not.toMatch(/\+62|\b08\d{8,}/)
    expect(seed).not.toMatch(/@/)
    expect(seed.toLowerCase()).not.toMatch(
      /\b(submissions|profiles|auth\.users|lots|stock_movements)\b/,
    )
  })

  it('22 kode limbah & warna kelompok sama dengan config frontend', () => {
    for (const code of WASTE_GROUPS.flatMap((g) => g.wasteCodes)) {
      expect(seed).toContain(`'${code}'`)
    }
    for (const g of WASTE_GROUPS) {
      expect(seed).toMatch(new RegExp(`'${g.code}',[^\\n]*'${g.color.dark}', '${g.color.light}'`))
    }
    expect(seed).toMatch(/'A3330-1'[^\n]*true\)/)
    expect(seed).toMatch(/'B354-4'[^\n]*true\)/)
  })
})

describe('syarat 6: tanpa signUp / OTP / reset password email', () => {
  const files = [
    ...walk('src', ['.ts', '.tsx']),
    ...walk('supabase/functions', ['.ts']),
    ...walk('ops', ['.sh', '.sql']),
  ].filter((p) => !p.endsWith('repo-guards.test.ts'))

  it.each(files.map((p) => [relative('.', p)]))('%s', (p) => {
    const src = read(p)
    expect(src).not.toMatch(/\bsignUp\s*\(/)
    expect(src).not.toMatch(/\bsignInWithOtp\s*\(/)
    expect(src).not.toMatch(/\bresetPasswordForEmail\s*\(/)
    expect(src).not.toMatch(/\/auth\/v1\/(signup|otp|magiclink|recover)\b/)
  })
})
