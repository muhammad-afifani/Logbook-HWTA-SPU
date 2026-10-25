import type { GroupCode } from './spu-building'

/**
 * Kelompok segregasi — USULAN, WAJIB DIREVIEW TIM K3.
 *
 * Warna = palet kategorikal tervalidasi (skill dataviz, urutan tetap, lolos CVD
 * & normal-vision di tema gelap #101d1a dan terang #ffffff). Di tema terang tiga
 * warna (G3, G4, G5) < 3:1 terhadap latar → warna TIDAK BOLEH berdiri sendiri:
 * selalu sertakan kode kelompok/label atau legenda.
 */
export interface WasteGroup {
  code: GroupCode
  name: string
  color: { dark: string; light: string }
  /** Kode limbah awal (seed). Sumber final ada di tabel waste_types. */
  wasteCodes: string[]
}

export const WASTE_GROUPS: readonly WasteGroup[] = [
  {
    code: 'G1',
    name: 'Oli dan residu minyak',
    color: { dark: '#3987e5', light: '#2a78d6' },
    wasteCodes: ['B105d', 'A3330-1', 'A330-2', 'B330-1', 'B330-2'],
  },
  {
    code: 'G2',
    name: 'Cat, tinta, pelarut',
    color: { dark: '#d95926', light: '#eb6834' },
    wasteCodes: ['A325-1', 'B321-4', 'B104d'],
  },
  {
    code: 'G3',
    name: 'Padatan terkontaminasi',
    color: { dark: '#199e70', light: '#1baf7a' },
    wasteCodes: ['A108d', 'B110d', 'B330-4', 'B323-1'],
  },
  {
    code: 'G4',
    name: 'Elektronik dan baterai',
    color: { dark: '#c98500', light: '#eda100' },
    wasteCodes: ['A102d', 'B107d', 'B353-1'],
  },
  {
    code: 'G5',
    name: 'Kimia dan laboratorium',
    color: { dark: '#d55181', light: '#e87ba4' },
    wasteCodes: ['A106d', 'A338-1'],
  },
  {
    code: 'G6',
    name: 'Klinis dan farmasi',
    color: { dark: '#008300', light: '#008300' },
    wasteCodes: ['A337-1', 'A337-2'],
  },
  {
    code: 'G7',
    name: 'Asbestos',
    color: { dark: '#9085e9', light: '#6250d6' },
    wasteCodes: ['B354-4', 'B352-5'],
  },
  {
    code: 'G8',
    name: 'Tabung gas',
    color: { dark: '#e66767', light: '#e34948' },
    wasteCodes: ['A111d'],
  },
]

export const GROUP_BY_CODE = Object.fromEntries(WASTE_GROUPS.map((g) => [g.code, g])) as Record<
  GroupCode,
  WasteGroup
>
