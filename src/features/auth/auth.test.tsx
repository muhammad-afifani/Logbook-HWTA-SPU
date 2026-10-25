import { act, render, screen } from '@testing-library/react'
import { authErrorMessage } from './auth-errors'
import { RequireRole } from './RequireRole'
import { useSession } from './session-store'

describe('authErrorMessage', () => {
  it.each([
    [
      { code: 'invalid_credentials', message: 'Invalid login credentials' },
      'Email atau password salah.',
    ],
    [{ code: 'email_provider_disabled' }, 'Login email belum diaktifkan di server. Hubungi admin.'],
    [{ status: 429 }, 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.'],
    [
      { name: 'AuthRetryableFetchError', message: 'Failed to fetch' },
      'Tidak ada koneksi ke server. Periksa jaringan lalu coba lagi.',
    ],
    [{}, 'Login gagal. Coba lagi atau hubungi admin.'],
  ])('%j', (err, msg) => expect(authErrorMessage(err)).toBe(msg))
})

describe('RequireRole', () => {
  const init = vi.fn().mockResolvedValue(undefined)
  const base = {
    init,
    signIn: vi.fn(),
    signOut: vi.fn(),
    error: null,
    email: 'petugas@example.test',
  }

  function renderGuard() {
    return render(
      <RequireRole roles={['officer', 'admin']}>
        <p>Konten petugas</p>
      </RequireRole>,
    )
  }

  it('belum login → form email + password tanpa tautan daftar/magic link', () => {
    act(() => useSession.setState({ ...base, status: 'signed-out', profile: null }))
    renderGuard()
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.queryByText(/daftar|magic|kirim tautan|lupa password\?\s*klik/i)).toBeNull()
    expect(screen.queryByText('Konten petugas')).toBeNull()
  })

  it('login tanpa profil → tidak berwenang', () => {
    act(() => useSession.setState({ ...base, status: 'signed-in', profile: null }))
    renderGuard()
    expect(screen.getByRole('alert')).toHaveTextContent('belum diberi akses petugas')
    expect(screen.queryByText('Konten petugas')).toBeNull()
  })

  it('profil nonaktif → tidak berwenang', () => {
    act(() =>
      useSession.setState({
        ...base,
        status: 'signed-in',
        profile: { id: 'x', full_name: 'Petugas Uji', role: 'officer', active: false },
      }),
    )
    renderGuard()
    expect(screen.queryByText('Konten petugas')).toBeNull()
  })

  it('petugas aktif → konten tampil', () => {
    act(() =>
      useSession.setState({
        ...base,
        status: 'signed-in',
        profile: { id: 'x', full_name: 'Petugas Uji', role: 'officer', active: true },
      }),
    )
    renderGuard()
    expect(screen.getByText('Konten petugas')).toBeInTheDocument()
  })
})
