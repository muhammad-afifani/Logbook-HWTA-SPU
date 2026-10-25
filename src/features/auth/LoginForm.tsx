import { useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useSession } from './session-store'

/**
 * Login petugas: email + password. Akun dibuat admin di Supabase Dashboard.
 * Sengaja TANPA tombol daftar, magic link, atau "lupa password" via email.
 */
export function LoginForm() {
  const signIn = useSession((s) => s.signIn)
  const error = useSession((s) => s.error)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const ids = { email: useId(), password: useId(), error: useId() }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const ok = await signIn(email, password)
    setBusy(false)
    if (ok) setPassword('')
  }

  const field =
    'mt-1.5 h-12 w-full rounded-xl border border-line-strong bg-bg-sunken px-4 text-base ' +
    'placeholder:text-fg-faint'

  return (
    <form onSubmit={onSubmit} className="glass mx-auto w-full max-w-md space-y-4 p-5" noValidate>
      <div>
        <label htmlFor={ids.email} className="text-sm font-medium text-fg-muted">
          Email
        </label>
        <input
          id={ids.email}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
          aria-describedby={error ? ids.error : undefined}
        />
      </div>
      <div>
        <label htmlFor={ids.password} className="text-sm font-medium text-fg-muted">
          Password
        </label>
        <div className="relative">
          <input
            id={ids.password}
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${field} pr-24`}
            aria-describedby={error ? ids.error : undefined}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute top-1.5 right-1.5 h-12 rounded-lg px-3 text-sm font-semibold text-fg-muted"
            aria-pressed={show}
          >
            {show ? 'Sembunyikan' : 'Tampilkan'}
          </button>
        </div>
      </div>

      {error && (
        <p
          id={ids.error}
          role="alert"
          className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <Button type="submit" size="lg" block disabled={busy || !email || !password}>
        {busy ? 'Memeriksa…' : 'Masuk'}
      </Button>

      <p className="text-sm text-fg-muted">
        Lupa password atau belum punya akun? Hubungi admin SPU. Akun dan reset password dikelola
        admin.
      </p>
    </form>
  )
}
