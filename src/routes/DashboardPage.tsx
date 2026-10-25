import { m } from 'motion/react'
import { useState } from 'react'
import { CapacityRing } from '@/components/ui/CapacityRing'
import { LiveDot } from '@/components/ui/LiveDot'
import { PageHeader } from '@/components/ui/PageHeader'
import { PhaseNote } from '@/components/ui/PhaseNote'
import { fadeUp, staggerContainer } from '@/design/motion'

/**
 * Dashboard PUBLIK — sesuai amandemen visibilitas:
 * hanya kapasitas SPU dalam persen dan status ada/tidak ada limbah.
 * Tanpa angka kg, lot, nama, atau telepon (semua itu hanya di area petugas).
 * Nilai di bawah adalah data contoh sampai RPC `public_status()` tersedia (Fase 4).
 */
const SAMPLE = { capacityPct: 43, hasWaste: true }

export default function DashboardPage() {
  const [updatedAt] = useState(() => Date.now())

  return (
    <>
      <PageHeader
        eyebrow="Dashboard publik"
        title="Kondisi SPU saat ini"
        description="Ringkasan publik: persentase kapasitas dan status penyimpanan. Detail hanya untuk petugas."
        actions={<LiveDot updatedAt={updatedAt} />}
      />
      <m.section
        className="grid gap-3 px-4 sm:grid-cols-2 lg:px-8"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        aria-label="Status SPU"
      >
        <m.div variants={fadeUp} className="glass grid place-items-center p-5">
          <CapacityRing ratio={SAMPLE.capacityPct / 100} label="Kapasitas terpakai" />
        </m.div>
        <m.div variants={fadeUp} className="glass flex flex-col justify-center gap-2 p-5">
          <p className="text-sm text-fg-muted">Status penyimpanan</p>
          <p className="flex items-center gap-3 text-2xl font-bold">
            <span
              className={`size-3 rounded-full ${SAMPLE.hasWaste ? 'bg-warn' : 'bg-accent'}`}
              aria-hidden="true"
            />
            {SAMPLE.hasWaste ? 'Ada limbah tersimpan' : 'Kosong'}
          </p>
          <p className="text-sm text-fg-muted">
            {SAMPLE.hasWaste
              ? 'SPU sedang menyimpan limbah B3 yang menunggu diserahkan.'
              : 'Tidak ada limbah B3 tersimpan saat ini.'}
          </p>
        </m.div>
      </m.section>
      <div className="space-y-3 px-4 pt-4 lg:px-8">
        <p className="font-mono text-[11px] text-fg-faint">
          DATA CONTOH — belum terhubung Supabase.
        </p>
        <PhaseNote phase={4}>
          Data live dari RPC agregat + realtime di Fase 4. Grafik, kg, lot, dan alert ada di
          dashboard petugas.
        </PhaseNote>
      </div>
    </>
  )
}
