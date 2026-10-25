// @vitest-environment node
/**
 * Penjaga repo (berjalan di setiap `pnpm test` / CI):
 *  - Syarat 2: migrasi tidak mengubah default privileges dan tidak menambah grant/policy
 *    ke skema auth/storage (selain baris bucket privat untuk foto).
 *  - Syarat 5: seed hanya master data (4 tabel), tanpa data pribadi.
 *  - Syarat 6: kode tidak memanggil signUp, signInWithOtp, resetPasswordForEmail.
 */
import { spawnSync } from 'node:child_process'
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

describe('secret & .env tidak pernah ter-commit', () => {
  /** null = git tidak tersedia / bukan checkout git (test dilewati); selain itu status + stdout. */
  const git = (...args: string[]): { status: number; out: string } | null => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    if (r.error || r.status === null) return null
    if (args[0] !== 'check-ignore' && r.status !== 0) return null // mis. bukan repo git
    return { status: r.status, out: r.stdout }
  }
  const isEnvFile = (f: string) => /(^|\/)\.env($|\.)/.test(f) && !/\.env\.example$/.test(f)

  it.each([
    'supabase/functions/.env',
    '.env',
    '.env.local',
    '.env.production',
    'backup/dump.sql',
    'exports/logbook-export-2026.csv',
    'logbook-export-2026.csv',
    'x.dump',
    'x.age',
    'age-key.txt',
  ])('%s diabaikan git', (path) => {
    const r = git('check-ignore', '--no-index', path)
    if (r === null) return
    // status 0 = diabaikan; status 1 = TIDAK diabaikan (harus gagal); >1 = error git
    expect({ status: r.status, path: r.out.trim() }).toEqual({ status: 0, path })
  })

  it('tidak ada file .env yang dilacak (selain .env.example)', () => {
    const r = git('ls-files')
    if (r === null) return
    expect(r.out.split('\n').filter(isEnvFile)).toEqual([])
  })

  it('.env tidak pernah ada di riwayat git mana pun', () => {
    const r = git('log', '--all', '--name-only', '--pretty=format:')
    if (r === null) return
    expect(r.out.split('\n').filter((f) => f && isEnvFile(f))).toEqual([])
  })

  it('.env.example hanya berisi nilai uji/placeholder, bukan kunci asli', () => {
    for (const p of ['.env.example', 'supabase/functions/.env.example']) {
      const text = read(p)
      expect(text, p).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./) // JWT
      expect(text, p).not.toMatch(/sb_secret_|sb_publishable_|service_role/i)
    }
    const fn = read('supabase/functions/.env.example')
    expect(fn).toMatch(/TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA/) // secret uji resmi
    expect(fn).toMatch(/IP_HASH_SALT=ganti-dengan/) // placeholder, bukan salt asli
  })

  it('README: secret produksi hanya lewat supabase secrets set, bukan file .env', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/supabase secrets set/)
    expect(readme).toMatch(/tidak pernah\*\* ditulis ke file `\.env`/)
    expect(readme).toMatch(/Jangan pakai `supabase secrets set --env-file/)
  })

  it('workflow tidak memuat nilai secret literal', () => {
    for (const f of walk('.github/workflows', ['.yml'])) {
      const text = read(f)
      expect(text, f).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./)
      expect(text, f).not.toMatch(/sb_secret_/)
    }
  })
})

describe('skema terekspos REST', () => {
  it('supabase/config.toml: api.schemas hanya public (app_private/auth/storage tidak terekspos)', () => {
    const toml = read('supabase/config.toml')
    const m = toml.match(/^\[api\][\s\S]*?^schemas\s*=\s*(\[[^\]]*\])/m)
    expect(m, 'baris schemas di [api] tidak ditemukan').not.toBeNull()
    expect(JSON.parse(m![1]!)).toEqual(['public'])
  })

  it('ops/checks/anon-curl.sh memeriksa skema terekspos & storage anon', () => {
    const sh = read('ops/checks/anon-curl.sh')
    for (const needle of [
      'Accept-Profile',
      'Only the following schemas are exposed: public',
      'object/upload/sign',
      'object/sign/',
      'INSERT objek',
      'SELECT objek',
    ]) {
      expect(sh, needle).toContain(needle)
    }
  })
})
