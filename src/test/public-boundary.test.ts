// @vitest-environment node
/**
 * Bukti bahwa batas data publik ditegakkan ESLint: file di peta site publik (site3d)
 * dan halaman publik tidak bisa mengimpor modul petugas, 3D interior, atau API selain
 * kontrak public-status. `pnpm lint` (dan CI) gagal bila aturan ini dilanggar.
 */
import { ESLint } from 'eslint'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('../..', import.meta.url))
const eslint = new ESLint({ cwd })

async function restrictedMessages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports')
}

describe('batas data publik (ESLint)', () => {
  it.each([
    ["import { x } from '@/features/officer/stock'", 'modul petugas'],
    ["import { Interior } from '@/features/spu3d/Scene'", '3D interior'],
    ["import { supabase } from '@/lib/supabase'", 'klien supabase'],
    ["import { officerSummary } from '@/lib/api/officer'", 'API petugas'],
  ])('peta site publik menolak: %s (%s)', async (code) => {
    const msgs = await restrictedMessages(`${code}\nexport {}\n`, 'src/features/site3d/Hotspot.tsx')
    expect(msgs.length).toBeGreaterThan(0)
  })

  it('peta site publik boleh memakai kontrak public-status dan three.js', async () => {
    const code =
      "import { parsePublicStatus } from '@/lib/api/public-status'\n" +
      "import { Mesh } from 'three'\nexport { parsePublicStatus, Mesh }\n"
    expect(await restrictedMessages(code, 'src/features/site3d/Hotspot.tsx')).toEqual([])
  })

  it('dashboard publik menolak modul petugas dan three.js', async () => {
    const code =
      "import { x } from '@/features/officer/stock'\nimport { Mesh } from 'three'\nexport { x, Mesh }\n"
    expect(await restrictedMessages(code, 'src/routes/DashboardPage.tsx')).toHaveLength(2)
  })

  it('area petugas tidak dibatasi aturan publik', async () => {
    const code = "import { x } from '@/features/officer/stock'\nexport { x }\n"
    expect(await restrictedMessages(code, 'src/features/officer/Queue.tsx')).toEqual([])
  })
})
