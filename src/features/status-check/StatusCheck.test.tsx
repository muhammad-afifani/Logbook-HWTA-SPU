import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as api from '@/lib/public-form/api'
import { renderWithApp } from '@/test/utils'
import StatusCheck from './StatusCheck'

vi.mock('@/lib/public-form/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/public-form/api')>()),
  checkTicketStatus: vi.fn(),
}))
const mocked = vi.mocked(api)

const base = {
  ticket_code: 'SPU-2610-0001-K7QX',
  entry_date: '2026-10-25',
  submitted_at: '2026-10-25T02:00:00Z',
  items: [
    {
      waste_code: 'B105d',
      waste_name: 'Minyak pelumas bekas',
      package_count: 4,
      packaging: 'Drum 200 L',
    },
  ],
}

beforeEach(() => vi.clearAllMocks())

describe('StatusCheck', () => {
  it('format kode salah → pesan, tanpa memanggil server', async () => {
    const user = userEvent.setup()
    renderWithApp(<StatusCheck />)
    await user.type(screen.getByLabelText(/Kode tiket/), 'bukan-tiket')
    await user.click(screen.getByRole('button', { name: 'Cek status' }))
    expect(await screen.findByText(/Format kode tiket/)).toBeInTheDocument()
    expect(mocked.checkTicketStatus).not.toHaveBeenCalled()
  })

  it('menormalisasi input (huruf kecil, spasi) lalu menampilkan status menunggu', async () => {
    const user = userEvent.setup()
    mocked.checkTicketStatus.mockResolvedValue({
      ...base,
      status: 'pending',
      reject_reason: null,
      verified_at: null,
    })
    renderWithApp(<StatusCheck />)
    await user.type(screen.getByLabelText(/Kode tiket/), ' spu 2610 0001 k7qx ')
    await user.click(screen.getByRole('button', { name: 'Cek status' }))
    expect(await screen.findByTestId('status-result')).toHaveTextContent('Menunggu verifikasi')
    expect(mocked.checkTicketStatus).toHaveBeenCalledWith('SPU-2610-0001-K7QX')
    expect(screen.getByText('25/10/2026')).toBeInTheDocument()
  })

  it('ditolak: menampilkan alasan', async () => {
    const user = userEvent.setup()
    mocked.checkTicketStatus.mockResolvedValue({
      ...base,
      status: 'rejected',
      reject_reason: 'Kemasan bocor saat diperiksa.',
      verified_at: '2026-10-25T05:00:00Z',
    })
    renderWithApp(<StatusCheck />)
    await user.type(screen.getByLabelText(/Kode tiket/), 'SPU-2610-0001-K7QX')
    await user.click(screen.getByRole('button', { name: 'Cek status' }))
    const result = await screen.findByTestId('status-result')
    expect(result).toHaveTextContent('Ditolak')
    expect(result).toHaveTextContent('Kemasan bocor saat diperiksa.')
  })

  it('tiket tidak ada (404) dan tanpa koneksi punya pesan ramah', async () => {
    const user = userEvent.setup()
    mocked.checkTicketStatus.mockRejectedValueOnce(new api.ApiError(404, 'x'))
    renderWithApp(<StatusCheck />)
    await user.type(screen.getByLabelText(/Kode tiket/), 'SPU-2610-0001-K7QX')
    await user.click(screen.getByRole('button', { name: 'Cek status' }))
    expect(
      await screen.findByText('Tiket tidak ditemukan. Periksa lagi kodenya.'),
    ).toBeInTheDocument()
    mocked.checkTicketStatus.mockRejectedValueOnce(new api.NetworkError())
    await user.click(screen.getByRole('button', { name: 'Cek status' }))
    expect(await screen.findByText(/Tidak ada koneksi/)).toBeInTheDocument()
  })

  it('tautan dari layar sukses (?kode=) langsung memeriksa', async () => {
    mocked.checkTicketStatus.mockResolvedValue({
      ...base,
      status: 'verified',
      reject_reason: null,
      verified_at: '2026-10-25T05:00:00Z',
    })
    renderWithApp(<StatusCheck />, '/status?kode=SPU-2610-0001-K7QX')
    expect(await screen.findByTestId('status-result')).toHaveTextContent('Diverifikasi')
  })
})
