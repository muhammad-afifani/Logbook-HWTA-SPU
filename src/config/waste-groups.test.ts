// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { WASTE_GROUPS } from './waste-groups'
import { SPU_BUILDING } from './spu-building'

const css = readFileSync(fileURLToPath(new URL('../design/tokens.css', import.meta.url)), 'utf8')

function block(selector: string) {
  const start = css.indexOf(selector)
  return css.slice(css.indexOf('{', start), css.indexOf('}', start))
}

describe('kelompok segregasi', () => {
  it('8 kelompok, 22 kode limbah unik', () => {
    expect(WASTE_GROUPS).toHaveLength(8)
    const codes = WASTE_GROUPS.flatMap((g) => g.wasteCodes)
    expect(codes).toHaveLength(22)
    expect(new Set(codes).size).toBe(22)
  })

  it.each([
    ['dark', ":root[data-theme='dark']"],
    ['light', ":root[data-theme='light']"],
  ] as const)('warna token CSS tema %s sama dengan config', (mode, selector) => {
    const body = block(selector)
    for (const g of WASTE_GROUPS) {
      const m = body.match(new RegExp(`--${g.code.toLowerCase()}:\\s*(#[0-9a-f]{6})`, 'i'))
      expect(m?.[1]?.toLowerCase(), g.code).toBe(g.color[mode].toLowerCase())
    }
  })

  it('setiap kelompok punya zona di denah', () => {
    const zones = [...SPU_BUILDING.zoneAssignment.north, ...SPU_BUILDING.zoneAssignment.south]
    expect(new Set(zones)).toEqual(new Set(WASTE_GROUPS.map((g) => g.code)))
  })
})
