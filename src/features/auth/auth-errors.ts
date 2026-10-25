/** Pesan error login yang ramah (bahasa Indonesia). */
export function authErrorMessage(err: unknown): string {
  const e = (err ?? {}) as { message?: string; code?: string; status?: number; name?: string }
  const code = e.code ?? ''
  const msg = (e.message ?? '').toLowerCase()
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'Email atau password salah.'
  }
  if (code === 'email_provider_disabled' || msg.includes('email logins are disabled')) {
    return 'Login email belum diaktifkan di server. Hubungi admin.'
  }
  if (code === 'user_banned') return 'Akun dinonaktifkan. Hubungi admin.'
  if (code === 'over_request_rate_limit' || e.status === 429) {
    return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.'
  }
  if (
    e.name === 'AuthRetryableFetchError' ||
    msg.includes('failed to fetch') ||
    msg.includes('network')
  ) {
    return 'Tidak ada koneksi ke server. Periksa jaringan lalu coba lagi.'
  }
  if (msg.includes('belum dikonfigurasi')) return e.message ?? 'Server belum dikonfigurasi.'
  return 'Login gagal. Coba lagi atau hubungi admin.'
}
