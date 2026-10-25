import { validateSubmission } from './submission.ts'

const opts = { today: '2026-10-25', backdateMaxDays: 7 }
const valid = {
  idempotency_key: '00000000-0000-4000-8000-000000000001',
  entry_date: '2026-10-25',
  source: '  Workshop   Uji ',
  sender_name: 'Uji Coba 01',
  entity: 'PT Dummy',
  phone: '0812-0000-0001',
  photo_count: 2,
  confirm_sealed: true,
  confirm_no_leak: true,
  confirm_labeled: true,
  items: [
    { waste_code: 'B105d', packaging_code: 'drum200', package_count: 4, weight_kg: 720.456 },
    { waste_code: 'B110d', weight_kg: 130 },
  ],
}

describe('validateSubmission', () => {
  it('menormalisasi kiriman valid', () => {
    const r = validateSubmission(valid, opts)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.source).toBe('Workshop Uji')
    expect(r.value.phone_e164).toBe('+6281200000001')
    expect(r.value.items[0]!.weight_kg).toBe(720.46)
    expect(r.value.items[1]).toEqual({
      waste_code: 'B110d',
      packaging_code: null,
      package_count: null,
      weight_kg: 130,
    })
  })

  it('tanggal: tidak boleh masa depan, mundur maksimal 7 hari', () => {
    const future = validateSubmission({ ...valid, entry_date: '2026-10-26' }, opts)
    const old = validateSubmission({ ...valid, entry_date: '2026-10-17' }, opts)
    const edge = validateSubmission({ ...valid, entry_date: '2026-10-18' }, opts)
    expect(!future.ok && future.errors.entry_date).toMatch(/masa depan/)
    expect(!old.ok && old.errors.entry_date).toMatch(/7 hari/)
    expect(edge.ok).toBe(true)
  })

  it('error per field dalam bahasa Indonesia', () => {
    const r = validateSubmission(
      {
        ...valid,
        source: '',
        phone: '123',
        confirm_labeled: false,
        photo_count: 4,
        items: [{ waste_code: '', weight_kg: 0, package_count: 0 }],
      },
      opts,
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.errors).sort()).toEqual([
      'confirm_labeled',
      'items.0.package_count',
      'items.0.waste_code',
      'items.0.weight_kg',
      'phone',
      'photo_count',
      'source',
    ])
  })

  it('minimal 1 dan maksimal 20 item', () => {
    expect(validateSubmission({ ...valid, items: [] }, opts).ok).toBe(false)
    const many = Array.from({ length: 21 }, () => ({ waste_code: 'B105d', weight_kg: 1 }))
    expect(validateSubmission({ ...valid, items: many }, opts).ok).toBe(false)
  })

  it('menolak idempotency_key bukan UUID v4 dan input non-objek', () => {
    expect(validateSubmission({ ...valid, idempotency_key: 'x' }, opts).ok).toBe(false)
    // v1 (berbasis waktu) bisa ditebak → ditolak; kunci berfungsi sebagai capability.
    expect(
      validateSubmission(
        { ...valid, idempotency_key: '00000000-0000-1000-8000-000000000001' },
        opts,
      ).ok,
    ).toBe(false)
    expect(validateSubmission(null, opts).ok).toBe(false)
  })
})
