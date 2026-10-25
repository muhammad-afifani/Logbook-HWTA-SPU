import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { PhaseNote } from '@/components/ui/PhaseNote'
import { RequireRole } from '@/features/auth/RequireRole'
import { useSession } from '@/features/auth/session-store'
import { isSupabaseConfigured } from '@/lib/supabase'

function OfficerHome() {
  const profile = useSession((s) => s.profile)
  const signOut = useSession((s) => s.signOut)
  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm text-fg-muted">Masuk sebagai</p>
          <p className="text-lg font-semibold">{profile?.full_name}</p>
          <p className="font-mono text-xs text-accent uppercase">{profile?.role}</p>
        </div>
        <Button variant="secondary" onClick={() => void signOut()}>
          Keluar
        </Button>
      </div>
      <PhaseNote phase={3}>
        Antrean verifikasi, limbah keluar, logbook, lot, master data, export, dan cetak dibangun di
        Fase 3.
      </PhaseNote>
    </div>
  )
}

export default function PetugasPage() {
  return (
    <>
      <PageHeader
        eyebrow="Area petugas"
        title="Masuk sebagai petugas SPU"
        description="Login dengan email dan password dari admin. Lupa password? Hubungi admin SPU untuk reset."
      />
      <div className="px-4 lg:px-8">
        {isSupabaseConfigured() ? (
          <RequireRole roles={['officer', 'admin']}>
            <OfficerHome />
          </RequireRole>
        ) : (
          <div className="glass mx-auto max-w-md space-y-2 p-5">
            <p className="font-semibold">Mode demo</p>
            <p className="text-sm text-fg-muted">
              Supabase belum dikonfigurasi (VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY kosong),
              jadi login petugas tidak tersedia.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
