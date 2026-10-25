import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithApp } from '@/test/utils'
import { DEMO_OPTIONS } from '@/lib/public-form/demo-data'
import * as api from '@/lib/public-form/api'
import { emptyDraft, emptyItem, saveDraft } from '@/lib/public-form/draft-store'
import { todayInZone } from '@shared/dates.ts'
import SubmitWizard from './SubmitWizard'

vi.mock('@/lib/public-form/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/public-form/api')>()
  return {
    ...actual,
    fetchFormOptions: vi.fn(),
    submitWaste: vi.fn(),
    uploadPhoto: vi.fn(),
    checkTicketStatus: vi.fn(),
  }
})
const mocked = vi.mocked(api)
const today = todayInZone(DEMO_OPTIONS.timezone)

async function fillSender(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Sumber \(asal limbah\)/), 'Workshop Uji')
  await user.type(screen.getByLabelText(/Nama pengirim limbah ke SPU/), 'Uji Coba 01')
  await user.type(screen.getByLabelText(/^Entity/), 'PT Dummy')
  await user.type(screen.getByLabelText(/No telepon yang dapat dihubungi/), '0812-0000-0001')
}

async function pickWaste(user: ReturnType<typeof userEvent.setup>, query: string, name: RegExp) {
  await user.click(screen.getByLabelText(/Jenis Limbah B3/))
  const dialog = await screen.findByRole('dialog', { name: 'Pilih jenis limbah B3' })
  await user.type(within(dialog).getByLabelText('Cari kode atau nama limbah'), query)
  await user.click(within(dialog).getByRole('button', { name }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  mocked.fetchFormOptions.mockResolvedValue({ ...DEMO_OPTIONS, today })
})

describe('SubmitWizard', () => {
  it('menampilkan langkah 1 dengan lokasi tetap SPU (tanpa dropdown lokasi)', async () => {
    renderWithApp(<SubmitWizard />)
    expect(await screen.findByRole('heading', { name: 'Data pengirim' })).toBeInTheDocument()
    expect(screen.getByLabelText('Lokasi tetap SPU')).toHaveTextContent('SPU')
    expect(screen.queryByRole('combobox', { name: /lokasi/i })).toBeNull()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
    // tanggal: default hari ini, dibatasi 7 hari ke belakang, tidak boleh masa depan
    const date = screen.getByLabelText(/Tanggal masuk ke SPU/)
    expect(date).toHaveValue(today)
    expect(date).toHaveAttribute('max', today)
    expect(date).toHaveAttribute('min', api.earliestEntryDate({ today, backdate_max_days: 7 }))
  })

  it('Lanjut dengan form kosong → error inline, tetap di langkah 1', async () => {
    const user = userEvent.setup()
    renderWithApp(<SubmitWizard />)
    await screen.findByRole('heading', { name: 'Data pengirim' })
    await user.click(screen.getByRole('button', { name: 'Lanjut' }))
    expect(await screen.findByText('Sumber limbah wajib diisi.')).toBeInTheDocument()
    expect(screen.getByText('Nama pengirim wajib diisi.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Sumber \(asal limbah\)/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('heading', { name: 'Data pengirim' })).toBeInTheDocument()
  })

  it('pratinjau telepon dinormalisasi ke +62', async () => {
    const user = userEvent.setup()
    renderWithApp(<SubmitWizard />)
    await screen.findByRole('heading', { name: 'Data pengirim' })
    await user.type(screen.getByLabelText(/No telepon yang dapat dihubungi/), '0812-0000-0001')
    expect(screen.getByText('Disimpan sebagai +62 812-0000-0001')).toBeInTheDocument()
  })

  it('alur lengkap: 3 langkah → kirim → tiket + ringkasan; draft dihapus', async () => {
    const user = userEvent.setup()
    mocked.submitWaste.mockResolvedValue({
      ticket_code: 'SPU-2610-0001-K7QX',
      created: true,
      uploads: [],
    })
    renderWithApp(<SubmitWizard />)
    await screen.findByRole('heading', { name: 'Data pengirim' })
    await fillSender(user)
    await user.click(screen.getByRole('button', { name: 'Lanjut' }))

    await screen.findByRole('heading', { name: 'Item limbah' })
    await pickWaste(user, 'oli', /B105d/)
    expect(screen.getByLabelText(/Jenis kemasan/)).toHaveValue('drum200')
    await user.click(screen.getByRole('button', { name: 'Tambah jumlah kemasan' }))
    await user.click(screen.getByRole('button', { name: 'Tambah jumlah kemasan' }))
    await user.type(screen.getByLabelText(/Jumlah \(Kg\)/), '720,5')
    await user.click(screen.getByRole('button', { name: 'Lanjut' }))

    await screen.findByRole('heading', { name: 'Konfirmasi' })
    // tanpa konfirmasi kemasan → Kirim ditolak dengan error inline
    await user.click(screen.getByRole('button', { name: 'Kirim' }))
    expect(await screen.findByText('Pastikan kemasan tertutup rapat.')).toBeInTheDocument()
    expect(mocked.submitWaste).not.toHaveBeenCalled()

    await user.click(screen.getByLabelText('Kemasan tertutup rapat'))
    await user.click(screen.getByLabelText('Kemasan tidak bocor'))
    await user.click(screen.getByLabelText('Label B3 terpasang'))
    await user.click(screen.getByRole('button', { name: 'Kirim' }))

    expect(await screen.findByTestId('ticket-code')).toHaveTextContent('SPU-2610-0001-K7QX')
    expect(screen.getByText('B105d')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salin kode' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cek status' })).toHaveAttribute(
      'href',
      '/status?kode=SPU-2610-0001-K7QX',
    )

    const body = mocked.submitWaste.mock.calls[0]![0]
    expect(body.turnstile_token).toBe('demo')
    expect(body.submission).toMatchObject({
      entry_date: today,
      source: 'Workshop Uji',
      sender_name: 'Uji Coba 01',
      entity: 'PT Dummy',
      phone: '0812-0000-0001',
      confirm_sealed: true,
      confirm_no_leak: true,
      confirm_labeled: true,
      items: [
        { waste_code: 'B105d', packaging_code: 'drum200', package_count: 3, weight_kg: 720.5 },
      ],
    })
    expect(body.submission.idempotency_key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]/)
    expect(localStorage.getItem('spu-form-draft-v1')).toBeNull()

    // "Isi lagi" → form kosong dengan kunci idempotensi BARU
    const firstKey = body.submission.idempotency_key
    await user.click(screen.getByRole('button', { name: 'Isi lagi' }))
    await screen.findByRole('heading', { name: 'Data pengirim' })
    expect(screen.getByLabelText(/Nama pengirim limbah ke SPU/)).toHaveValue('')
    expect(firstKey).toBeTruthy()
  })

  it('tanpa koneksi → kiriman diantre di perangkat, tidak hilang', async () => {
    const user = userEvent.setup()
    mocked.submitWaste.mockRejectedValue(new api.NetworkError())
    saveDraft({
      ...emptyDraft(today),
      step: 2,
      source: 'Workshop Uji',
      sender_name: 'Uji Coba 02',
      entity: 'PT Dummy',
      phone: '0812-0000-0002',
      items: [
        {
          ...emptyItem(),
          waste_code: 'A325-1',
          packaging_code: 'drum200',
          package_count: 1,
          weight_kg: '180',
        },
      ],
      confirm_sealed: true,
      confirm_no_leak: true,
      confirm_labeled: true,
    })
    renderWithApp(<SubmitWizard />)
    expect(await screen.findByText('Draft dipulihkan dari perangkat ini.')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Kirim' }))
    expect(
      await screen.findByRole('heading', { name: 'Tersimpan di perangkat ini' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(/1 kiriman tertunda/)).toBeInTheDocument()
    expect(localStorage.getItem('spu-form-draft-v1')).toBeNull()
  })

  it('error 422 dari server ditampilkan per field dan membawa pengguna ke langkah yang salah', async () => {
    const user = userEvent.setup()
    mocked.submitWaste.mockRejectedValue(
      new api.ApiError(422, 'Periksa kembali isian.', {
        phone: 'Nomor telepon dari server salah.',
      }),
    )
    saveDraft({
      ...emptyDraft(today),
      step: 2,
      source: 'Workshop Uji',
      sender_name: 'Uji Coba 03',
      entity: 'PT Dummy',
      phone: '0812-0000-0003',
      items: [
        {
          ...emptyItem(),
          waste_code: 'A325-1',
          packaging_code: 'drum200',
          package_count: 1,
          weight_kg: '180',
        },
      ],
      confirm_sealed: true,
      confirm_no_leak: true,
      confirm_labeled: true,
    })
    renderWithApp(<SubmitWizard />)
    await user.click(await screen.findByRole('button', { name: 'Kirim' }))
    expect(await screen.findByText('Nomor telepon dari server salah.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Data pengirim' })).toBeInTheDocument()
  })

  it('draft dipulihkan; "Mulai baru" mengosongkan', async () => {
    const user = userEvent.setup()
    saveDraft({ ...emptyDraft(today), source: 'Gudang Dummy', sender_name: 'Uji Coba 04' })
    renderWithApp(<SubmitWizard />)
    expect(await screen.findByDisplayValue('Uji Coba 04')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mulai baru' }))
    expect(screen.getByLabelText(/Nama pengirim limbah ke SPU/)).toHaveValue('')
  })

  it('isian tersimpan otomatis ke perangkat (debounce)', async () => {
    const user = userEvent.setup()
    renderWithApp(<SubmitWizard />)
    await screen.findByRole('heading', { name: 'Data pengirim' })
    await user.type(screen.getByLabelText(/Nama pengirim limbah ke SPU/), 'Uji Coba 05')
    await waitFor(
      () =>
        expect(JSON.parse(localStorage.getItem('spu-form-draft-v1') ?? '{}').sender_name).toBe(
          'Uji Coba 05',
        ),
      { timeout: 2000 },
    )
  })

  it('data form gagal dimuat dan belum ada cache → pesan + Coba lagi', async () => {
    const user = userEvent.setup()
    mocked.fetchFormOptions.mockRejectedValueOnce(new api.NetworkError())
    renderWithApp(<SubmitWizard />)
    expect(await screen.findByText('Data form belum bisa dimuat')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
    expect(await screen.findByRole('heading', { name: 'Data pengirim' })).toBeInTheDocument()
  })
})
