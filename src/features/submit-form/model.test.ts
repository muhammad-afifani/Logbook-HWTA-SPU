import { emptyDraft, emptyItem, type Draft } from '@/lib/public-form/draft-store'
import {
  draftToInput,
  errorsForStep,
  firstInvalidStep,
  phonePreview,
  totalKg,
  validateDraft,
} from './model'

const opts = { today: '2026-10-25', backdateMaxDays: 7 }

function valid(): Draft {
  return {
    ...emptyDraft('2026-10-25'),
    idempotency_key: '00000000-0000-4000-8000-000000000001',
    source: 'Workshop Uji',
    sender_name: 'Uji Coba 01',
    entity: 'PT Dummy',
    phone: '0812-0000-0001',
    items: [
      {
        ...emptyItem(),
        waste_code: 'B105d',
        packaging_code: 'drum200',
        package_count: 4,
        weight_kg: '720,5',
      },
    ],
    confirm_sealed: true,
    confirm_no_leak: true,
    confirm_labeled: true,
  }
}

describe('validateDraft', () => {
  it('draft lengkap valid', () => {
    expect(validateDraft(valid(), opts)).toEqual({})
  })

  it('berat koma desimal diparse; teks bukan angka diberi pesan ramah', () => {
    expect(draftToInput(valid()).items[0]!.weight_kg).toBe(720.5)
    const d = valid()
    d.items[0]!.weight_kg = 'abc'
    expect(validateDraft(d, opts)['items.0.weight_kg']).toBe('Isi dengan angka, contoh 12,5.')
  })

  it('draft kosong → error di ketiga langkah, berurutan', () => {
    const errors = validateDraft(emptyDraft('2026-10-25'), opts)
    expect(Object.keys(errorsForStep(errors, 0)).sort()).toEqual([
      'entity',
      'phone',
      'sender_name',
      'source',
    ])
    expect(Object.keys(errorsForStep(errors, 1))).toEqual(
      expect.arrayContaining(['items.0.waste_code', 'items.0.weight_kg', 'items.0.packaging_code']),
    )
    expect(Object.keys(errorsForStep(errors, 2)).sort()).toEqual([
      'confirm_labeled',
      'confirm_no_leak',
      'confirm_sealed',
    ])
    expect(firstInvalidStep(errors)).toBe(0)
  })

  it('firstInvalidStep menunjuk langkah pertama yang bermasalah', () => {
    const d = valid()
    d.confirm_sealed = false
    expect(firstInvalidStep(validateDraft(d, opts))).toBe(2)
    d.items[0]!.waste_code = ''
    expect(firstInvalidStep(validateDraft(d, opts))).toBe(1)
    expect(firstInvalidStep({})).toBeNull()
  })

  it('tanggal: masa depan dan lebih dari 7 hari lalu ditolak dengan pesan', () => {
    const d = valid()
    d.entry_date = '2026-10-26'
    expect(validateDraft(d, opts).entry_date).toMatch(/masa depan/)
    d.entry_date = '2026-10-17'
    expect(validateDraft(d, opts).entry_date).toMatch(/7 hari/)
  })

  it('kemasan tanpa jumlah (estimasi) tetap valid', () => {
    const d = valid()
    d.items[0]!.package_count = null
    expect(validateDraft(d, opts)).toEqual({})
    expect(draftToInput(d).items[0]!.package_count).toBeNull()
  })
})

describe('totalKg & phonePreview', () => {
  it('menjumlahkan berat valid saja', () => {
    const d = valid()
    d.items.push({ ...emptyItem(), weight_kg: '129,5' }, { ...emptyItem(), weight_kg: 'x' })
    expect(totalKg(d)).toBe(850)
  })
  it('pratinjau telepon ternormalisasi', () => {
    expect(phonePreview('0812-0000-0001')).toBe('+62 812-0000-0001')
    expect(phonePreview('812')).toBeNull()
  })
})
