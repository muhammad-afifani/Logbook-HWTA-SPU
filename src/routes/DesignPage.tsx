import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CapacityRing } from '@/components/ui/CapacityRing'
import { CountUp } from '@/components/ui/CountUp'
import { IconArrowRight, IconCheck, IconPlus } from '@/components/ui/icons'
import { LiveDot } from '@/components/ui/LiveDot'
import { PageHeader } from '@/components/ui/PageHeader'
import { SPU_BUILDING, SPU_BUILDING_STRICT } from '@/config/spu-building'
import { WASTE_GROUPS } from '@/config/waste-groups'
import { duration, ease, stepFade, stepSlide } from '@/design/motion'
import { computeLayout } from '@/domain/capacity/computeLayout'
import { LayoutPlan2D } from '@/features/spu-plan/LayoutPlan2D'

const SWATCHES = [
  ['bg', 'Latar'],
  ['bg-elevated', 'Latar naik'],
  ['accent', 'Aksen'],
  ['warn', 'Peringatan'],
  ['orange', 'Mendekati batas'],
  ['danger', 'Kritis'],
  ['info', 'Info'],
] as const

const MOTION_TOKENS = [
  ['Mikro', `${duration.microFast * 1000}–${duration.microSlow * 1000} ms`, 'tap, toggle, centang'],
  [
    'Transisi',
    `${duration.transitionFast * 1000}–${duration.transitionSlow * 1000} ms`,
    'halaman, sheet, langkah',
  ],
  [
    'Adegan',
    `${duration.sceneFast * 1000}–${duration.sceneSlow * 1000} ms`,
    'count-up, grafik, kamera',
  ],
  ['Easing keluar', `cubic-bezier(${ease.out.join(', ')})`, 'default semua gerak'],
] as const

const fmt = (n: number, d = 2) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(n)

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 pt-6 lg:px-8">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

function StepDemo() {
  const reduced = useReducedMotion()
  const [[step, dir], setStep] = useState<[number, 1 | -1]>([0, 1])
  const labels = ['Data pengirim', 'Item limbah', 'Konfirmasi']
  return (
    <div className="glass overflow-hidden p-4">
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line">
        <m.div
          className="h-full origin-left rounded-full bg-accent"
          animate={{ scaleX: (step + 1) / labels.length }}
          transition={{ duration: duration.transition, ease: ease.out }}
        />
      </div>
      <div className="relative h-16">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <m.p
            key={step}
            custom={dir}
            variants={reduced ? stepFade : stepSlide}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0 flex items-center text-lg font-semibold"
          >
            {step + 1}. {labels[step]}
          </m.p>
        </AnimatePresence>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep([step - 1, -1])}>
          Kembali
        </Button>
        <Button
          icon={<IconArrowRight size={18} />}
          disabled={step === labels.length - 1}
          onClick={() => setStep([step + 1, 1])}
        >
          Lanjut
        </Button>
      </div>
    </div>
  )
}

export default function DesignPage() {
  const layoutA = useMemo(() => computeLayout(SPU_BUILDING), [])
  const layoutB = useMemo(() => computeLayout(SPU_BUILDING_STRICT), [])
  const [ratio, setRatio] = useState(0.43)
  const [kg, setKg] = useState(1240.5)
  const [updatedAt, setUpdatedAt] = useState(() => Date.now())

  const rows: [string, string, string][] = [
    [
      'Interior bersih',
      `${SPU_BUILDING.interior.length} × ${SPU_BUILDING.interior.width} m = ${fmt(layoutA.interiorArea)} m²`,
      '—',
    ],
    [
      'Area penyimpanan',
      `${fmt(layoutA.storage.x1 - layoutA.storage.x0)} × ${fmt(layoutA.storage.y1 - layoutA.storage.y0)} m = ${fmt(layoutA.storage.area)} m²`,
      '—',
    ],
    ['Kedalaman baris', `${fmt(layoutA.rowDepth)} m`, '—'],
    ['Blok per baris', String(layoutA.blocksPerRow), String(layoutB.blocksPerRow)],
    ['Tapak pallet', String(layoutA.totals.footprints), String(layoutB.totals.footprints)],
    ['Tingkat (1,03 m/tingkat)', String(layoutA.levels), String(layoutB.levels)],
    ['Total slot pallet', String(layoutA.totals.slots), String(layoutB.totals.slots)],
    ['Posisi drum', String(layoutA.totals.drumPositions), String(layoutB.totals.drumPositions)],
    [
      'Lantai terpakai',
      `${fmt(layoutA.totals.floorUsedM2)} m² (${fmt(layoutA.totals.floorUsedPctInterior, 1)}%)`,
      `${fmt(layoutB.totals.floorUsedM2)} m² (${fmt(layoutB.totals.floorUsedPctInterior, 1)}%)`,
    ],
  ]

  return (
    <>
      <PageHeader
        eyebrow="Fase 0"
        title="Design system & kapasitas"
        description="Token warna, tipografi, motion, dan hasil hitung kapasitas SPU dari src/config/spu-building.ts."
      />

      <Section title="Denah & kapasitas (mohon diverifikasi)">
        <div className="glass p-3 lg:p-5">
          <LayoutPlan2D cfg={SPU_BUILDING} layout={layoutA} className="h-auto w-full" />
          <ul
            className="mt-3 flex flex-wrap gap-x-4 gap-y-2"
            aria-label="Legenda kelompok (usulan, wajib direview K3)"
          >
            {WASTE_GROUPS.map((g) => (
              <li key={g.code} className="flex items-center gap-2 text-sm">
                <span
                  className="size-3 rounded-sm"
                  style={{ background: `var(--${g.code.toLowerCase()})` }}
                />
                <span className="font-mono font-semibold">{g.code}</span>
                <span className="text-fg-muted">{g.name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-warn">
            Kelompok segregasi & penempatan zona: usulan, wajib direview K3.
          </p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="sr-only">Perbandingan kapasitas Opsi A dan Opsi B</caption>
            <thead className="text-fg-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Besaran</th>
                <th className="py-2 pr-3 font-medium">Opsi A (blok 2×2 pallet) — default</th>
                <th className="py-2 font-medium">Opsi B (blok 1 pallet)</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map(([k, a, b]) => (
                <tr key={k} className="border-b border-line">
                  <td className="py-2 pr-3 text-fg-muted">{k}</td>
                  <td className="py-2 pr-3 font-mono">{a}</td>
                  <td className="py-2 font-mono">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Warna">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {SWATCHES.map(([token, label]) => (
            <li key={token} className="glass overflow-hidden">
              <div
                className="h-14 border-b border-line"
                style={{ background: `var(--c-${token})` }}
              />
              <div className="p-2.5">
                <p className="text-sm font-semibold">{label}</p>
                <p className="font-mono text-[11px] text-fg-faint">{token}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tipografi">
        <div className="glass space-y-2 p-4">
          <p className="text-3xl font-bold tracking-tight">Plus Jakarta Sans — UI</p>
          <p className="text-fg-muted">Teks isi 15–16 px, kontras AA di kedua tema.</p>
          <p className="font-mono text-lg">
            JetBrains Mono — B105d · L2610-B105d-0007 · SPU-2610-0001-K7QX
          </p>
        </div>
      </Section>

      <Section title="Komponen & motion">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="glass grid place-items-center gap-3 p-4">
            <CapacityRing ratio={ratio} sublabel="contoh" />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setRatio((r) => Math.max(0, r - 0.17))}>
                −
              </Button>
              <Button variant="secondary" onClick={() => setRatio((r) => Math.min(1, r + 0.17))}>
                +
              </Button>
            </div>
          </div>
          <div className="glass space-y-3 p-4">
            <p className="text-sm text-fg-muted">Count-up</p>
            <p className="font-mono text-3xl font-semibold">
              <CountUp value={kg} decimals={1} suffix=" kg" />
            </p>
            <Button icon={<IconPlus size={18} />} onClick={() => setKg((v) => v + 200)}>
              Tambah 200 kg
            </Button>
            <div className="pt-2">
              <LiveDot updatedAt={updatedAt} />
            </div>
            <Button variant="ghost" onClick={() => setUpdatedAt(Date.now())}>
              Segarkan status live
            </Button>
          </div>
          <StepDemo />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="glass flex flex-wrap gap-2 p-4">
            <Button icon={<IconCheck size={18} />}>Terima</Button>
            <Button variant="danger">Tolak</Button>
            <Button variant="secondary">Sekunder</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className="glass space-y-2 p-4" aria-busy="true" aria-label="Contoh skeleton">
            <div className="skeleton h-5 w-2/5" />
            <div className="skeleton h-12" />
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <caption className="sr-only">Token motion</caption>
            <tbody>
              {MOTION_TOKENS.map(([k, v, use]) => (
                <tr key={k} className="border-b border-line">
                  <td className="py-2 pr-3 text-fg-muted">{k}</td>
                  <td className="py-2 pr-3 font-mono">{v}</td>
                  <td className="py-2 text-fg-muted">{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  )
}
