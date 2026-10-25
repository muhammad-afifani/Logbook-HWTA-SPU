import { m } from 'motion/react'
import { fadeUp, staggerContainer } from '@/design/motion'
import { PageHeader } from '@/components/ui/PageHeader'
import { PhaseNote } from '@/components/ui/PhaseNote'
import { SiteBadge } from '@/components/layout/AppShell'

const STEPS = [
  { n: 1, title: 'Data pengirim', body: 'Tanggal masuk, sumber, nama, entity, telepon.' },
  { n: 2, title: 'Item limbah', body: 'Jenis limbah B3, kemasan, jumlah, berat, foto.' },
  { n: 3, title: 'Konfirmasi', body: 'Cek kemasan, pernyataan privasi, kirim.' },
]

export default function LaporPage() {
  return (
    <>
      <PageHeader
        eyebrow="Form publik"
        title="Lapor limbah B3 masuk"
        description="Catat kiriman limbah ke tempat penyimpanan sementara. Tanpa login, cukup 3 langkah."
        actions={<SiteBadge />}
      />
      <m.ol
        className="grid gap-3 px-4 sm:grid-cols-3 lg:px-8"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {STEPS.map((s) => (
          <m.li key={s.n} variants={fadeUp} className="glass p-4">
            <span className="grid size-8 place-items-center rounded-full bg-accent-soft font-mono text-sm font-bold text-accent">
              {s.n}
            </span>
            <p className="mt-3 font-semibold">{s.title}</p>
            <p className="mt-1 text-sm text-fg-muted">{s.body}</p>
          </m.li>
        ))}
      </m.ol>
      <div className="px-4 pt-4 lg:px-8">
        <PhaseNote phase={2}>
          Wizard form, tiket, dan antrean kirim ulang dibangun di Fase 2.
        </PhaseNote>
      </div>
    </>
  )
}
