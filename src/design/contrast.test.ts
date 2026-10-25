// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Ambil variabel --c-* dari blok selector tertentu di tokens.css. */
function readTheme(selector: string): Record<string, string> {
  const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`selector ${selector} tidak ditemukan`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const vars: Record<string, string> = {}
  for (const m of body.matchAll(/--(c-[\w-]+):\s*([^;]+);/g)) vars[m[1]!] = m[2]!.trim()
  return vars
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(fg: string, bg: string): number {
  const a = luminance(hexToRgb(fg))
  const b = luminance(hexToRgb(bg))
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

// Pasangan teks yang dipakai di UI; semuanya wajib AA teks normal (4,5:1).
const TEXT_PAIRS: [string, string][] = [
  ['c-text', 'c-bg'],
  ['c-text', 'c-bg-elevated'],
  ['c-text-muted', 'c-bg'],
  ['c-text-muted', 'c-bg-elevated'],
  ['c-text-faint', 'c-bg'],
  ['c-accent', 'c-bg'],
  ['c-accent', 'c-bg-elevated'],
  ['c-on-accent', 'c-accent'],
  ['c-warn', 'c-bg'],
  ['c-orange', 'c-bg'],
  ['c-danger', 'c-bg'],
  ['c-info', 'c-bg'],
]

describe.each([
  ['gelap', ":root[data-theme='dark']"],
  ['terang', ":root[data-theme='light']"],
])('kontras tema %s (WCAG AA)', (_name, selector) => {
  const theme = readTheme(selector)

  it.each(TEXT_PAIRS)('%s di atas %s >= 4.5', (fg, bg) => {
    const ratio = contrast(theme[fg]!, theme[bg]!)
    expect(
      ratio,
      `${fg} ${theme[fg]} / ${bg} ${theme[bg]} = ${ratio.toFixed(2)}`,
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('indikator fokus >= 3:1 terhadap latar', () => {
    expect(contrast(theme['c-focus']!, theme['c-bg']!)).toBeGreaterThanOrEqual(3)
  })
})
