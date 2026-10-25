import { PageHeader } from '@/components/ui/PageHeader'
import { PhaseNote } from '@/components/ui/PhaseNote'

export default function StatusPage() {
  return (
    <>
      <PageHeader
        eyebrow="Cek status"
        title="Status kiriman"
        description="Masukkan kode tiket untuk melihat status: menunggu, diverifikasi, atau ditolak. Data pribadi tidak ditampilkan."
      />
      <div className="px-4 lg:px-8">
        <div className="glass p-4">
          <label htmlFor="ticket" className="text-sm font-medium text-fg-muted">
            Kode tiket
          </label>
          <input
            id="ticket"
            disabled
            placeholder="SPU-2610-0001-K7QX"
            className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-bg-sunken px-4 font-mono text-base tracking-wider uppercase placeholder:text-fg-faint"
          />
        </div>
        <div className="mt-4">
          <PhaseNote phase={2}>
            Pencarian tiket aktif setelah Edge Function check-status (Fase 1–2).
          </PhaseNote>
        </div>
      </div>
    </>
  )
}
