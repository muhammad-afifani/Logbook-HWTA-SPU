import { PageHeader } from '@/components/ui/PageHeader'
import { PhaseNote } from '@/components/ui/PhaseNote'

export default function PetugasPage() {
  return (
    <>
      <PageHeader
        eyebrow="Area petugas"
        title="Masuk sebagai petugas SPU"
        description="Login dengan magic link atau kode 6 digit dari email. Hanya email yang diundang admin."
      />
      <div className="space-y-4 px-4 lg:px-8">
        <PhaseNote phase={1}>Autentikasi magic link + OTP dibangun di Fase 1.</PhaseNote>
        <PhaseNote phase={3}>
          Antrean verifikasi, limbah keluar, logbook, lot, master data, export, dan cetak di Fase 3.
        </PhaseNote>
      </div>
    </>
  )
}
