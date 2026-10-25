import { useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { LoginForm } from './LoginForm'
import { type Role, useSession } from './session-store'

interface RequireRoleProps {
  roles: Role[]
  children: ReactNode
}

/**
 * Penjaga route petugas. Akses data tetap ditegakkan RLS di database; komponen ini
 * hanya mengatur tampilan (login / tidak berwenang / konten).
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const status = useSession((s) => s.status)
  const profile = useSession((s) => s.profile)
  const email = useSession((s) => s.email)
  const init = useSession((s) => s.init)
  const signOut = useSession((s) => s.signOut)

  useEffect(() => {
    void init()
  }, [init])

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="mx-auto max-w-md space-y-3" aria-busy="true" aria-label="Memeriksa sesi">
        <div className="skeleton h-12" />
        <div className="skeleton h-12" />
        <div className="skeleton h-14" />
      </div>
    )
  }

  if (status === 'signed-out') return <LoginForm />

  if (!profile || !profile.active || !roles.includes(profile.role)) {
    return (
      <div className="glass mx-auto max-w-md space-y-3 p-5" role="alert">
        <p className="font-semibold">Akun belum diberi akses petugas</p>
        <p className="text-sm text-fg-muted">
          {email ? `${email} ` : ''}berhasil login, tetapi belum punya peran petugas aktif. Minta
          admin SPU menambahkan profil Anda.
        </p>
        <Button variant="secondary" onClick={() => void signOut()}>
          Keluar
        </Button>
      </div>
    )
  }

  return <>{children}</>
}
