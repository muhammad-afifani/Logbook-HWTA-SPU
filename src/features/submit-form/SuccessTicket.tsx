import { m, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { CountUp } from '@/components/ui/CountUp'
import { IconCopy } from '@/components/ui/icons'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { duration, ease, haptic, spring } from '@/design/motion'
import { copyText } from '@/lib/clipboard'
import { formatDate, formatKg } from '@/lib/format'
import type { FormOptions } from '@/lib/public-form/types'
import { useSceneDirector } from '@/state/scene-director'
import type { SubmissionInput } from '@shared/submission.ts'
import { GroupChip } from './WastePicker'

interface SuccessTicketProps {
  ticket: string
  submission: SubmissionInput
  options: FormOptions
  total: number
  photosFailed: number
  retrying: boolean
  onRetryPhotos: () => void
  onReset: () => void
}

/**
 * Layar sukses: centang digambar (path draw) → kartu tiket naik → total kg menghitung naik.
 * Satu adegan utama (lewat scene director). Reduced motion: fade sederhana.
 */
export function SuccessTicket({
  ticket,
  submission,
  options,
  total,
  photosFailed,
  retrying,
  onRetryPhotos,
  onReset,
}: SuccessTicketProps) {
  const reduced = useReducedMotion()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const dir = useSceneDirector.getState()
    dir.request({ id: 'submit-success', kind: 'success', priority: 'high' })
    haptic(12)
    const t = setTimeout(() => useSceneDirector.getState().finish('submit-success'), 1200)
    return () => {
      clearTimeout(t)
      useSceneDirector.getState().finish('submit-success')
    }
  }, [])

  async function onCopy() {
    if (await copyText(ticket)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    }
  }

  const draw = (delay: number) =>
    reduced
      ? {
          initial: { pathLength: 1, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { duration: duration.microSlow },
        }
      : {
          initial: { pathLength: 0, opacity: 1 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { duration: duration.sceneFast * 0.7, ease: ease.out, delay },
        }

  return (
    <div className="space-y-5" data-testid="success">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <svg width="84" height="84" viewBox="0 0 84 84" fill="none" aria-hidden="true">
          <m.circle
            cx="42"
            cy="42"
            r="36"
            stroke="var(--c-accent)"
            strokeWidth="5"
            strokeLinecap="round"
            {...draw(0)}
          />
          <m.path
            d="M26 43.5 37 54.5 59 31"
            stroke="var(--c-accent)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...draw(0.45)}
          />
        </svg>
        <h2 className="text-2xl font-bold" tabIndex={-1} id="success-heading">
          Kiriman terkirim
        </h2>
        <p className="max-w-sm text-fg-muted">
          Terima kasih. Petugas SPU akan memverifikasi kiriman Anda. Simpan kode tiket di bawah
          untuk mengecek statusnya.
        </p>
      </div>

      <m.section
        aria-label="Tiket"
        className="glass space-y-4 p-5"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 32 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={reduced ? { duration: duration.microSlow } : { ...spring.physical, delay: 0.8 }}
      >
        <div>
          <p className="text-xs tracking-widest text-fg-muted uppercase">Kode tiket</p>
          <p
            className="mt-1 font-mono text-2xl font-bold tracking-wider break-all text-accent"
            data-testid="ticket-code"
          >
            {ticket}
          </p>
        </div>
        <StatusBadge status="pending" />

        <ul className="divide-y divide-line border-y border-line">
          {submission.items.map((it, i) => {
            const w = options.waste_types.find((x) => x.code === it.waste_code)
            return (
              <li key={i} className="flex items-center gap-2 py-2 text-sm">
                {w && <GroupChip code={w.group_code} />}
                <span className="font-mono font-semibold">{it.waste_code}</span>
                <span className="ml-auto font-mono">{formatKg(it.weight_kg)}</span>
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-sm text-fg-muted">
            Tanggal masuk {formatDate(submission.entry_date)} · {submission.items.length} jenis
          </span>
          <span className="font-mono text-xl font-semibold whitespace-nowrap">
            <CountUp value={total} decimals={2} suffix=" kg" />
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<IconCopy size={18} />} onClick={() => void onCopy()}>
            {copied ? 'Tersalin' : 'Salin kode'}
          </Button>
          <Link
            to={`/status?kode=${encodeURIComponent(ticket)}`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line-strong bg-surface-strong px-4 text-[15px] font-semibold"
          >
            Cek status
          </Link>
        </div>
        <p className="sr-only" aria-live="polite">
          {copied ? 'Kode tiket disalin' : ''}
        </p>
      </m.section>

      {photosFailed > 0 && (
        <div role="alert" className="rounded-xl border border-warn/40 bg-warn-soft p-4 text-sm">
          <p className="font-semibold text-warn">{photosFailed} foto belum terunggah</p>
          <p className="mt-1 text-fg">
            Kiriman sudah tercatat. Unggah foto lagi saat koneksi membaik.
          </p>
          <Button className="mt-3" variant="secondary" disabled={retrying} onClick={onRetryPhotos}>
            {retrying ? 'Mengunggah…' : 'Coba unggah foto lagi'}
          </Button>
        </div>
      )}

      <Button size="lg" block onClick={onReset}>
        Isi lagi
      </Button>
    </div>
  )
}
