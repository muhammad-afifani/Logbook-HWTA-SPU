import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StickyActionBar } from '@/components/ui/StickyActionBar'
import { env } from '@/config/env'
import { stepFade, stepSlide } from '@/design/motion'
import * as api from '@/lib/public-form/api'
import { earliestEntryDate } from '@/lib/public-form/api'
import {
  clearDraft,
  clearDraftPhotos,
  createDebouncedSaver,
  type Draft,
  type DraftItem,
  emptyDraft,
  emptyItem,
  isDraftMeaningful,
  loadDraft,
  loadDraftPhotos,
  saveDraftPhotos,
} from '@/lib/public-form/draft-store'
import { defaultStore } from '@/lib/public-form/kv'
import { sendSubmission } from '@/lib/public-form/submit-service'
import type { FormOptions } from '@/lib/public-form/types'
import type { SubmissionInput } from '@shared/submission.ts'
import {
  draftToInput,
  errorsForStep,
  firstInvalidStep,
  STEP_LABELS,
  stepOfKey,
  totalKg,
  validateDraft,
} from './model'
import { QueueBanner } from './QueueBanner'
import { StepConfirm, StepItems, StepSender } from './Steps'
import { SuccessTicket } from './SuccessTicket'
import { useFormOptions } from './useFormOptions'
import { useOfflineQueue } from './useOfflineQueue'

type Phase = 'edit' | 'sending' | 'sent' | 'queued'
interface Sent {
  ticket: string
  input: SubmissionInput
  photos: Blob[]
  total: number
  photosFailed: number
}

const focusFirstInvalid = () =>
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>('[aria-invalid="true"]')
    el?.scrollIntoView({ block: 'center' })
    el?.focus({ preventScroll: true })
  })

const header = (
  <div>
    <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
      Form publik
    </p>
    <h1 className="mt-1 text-2xl font-bold tracking-tight text-balance lg:text-3xl">
      Lapor limbah B3 masuk
    </h1>
  </div>
)

/** Draft awal: pulihkan dari perangkat bila ada isinya dan tanggalnya masih dalam rentang. */
function initialDraft(today: string, earliest: string): { draft: Draft; restored: boolean } {
  const saved = loadDraft()
  if (saved && isDraftMeaningful(saved)) {
    const inRange = saved.entry_date <= today && saved.entry_date >= earliest
    return { draft: { ...saved, entry_date: inRange ? saved.entry_date : today }, restored: true }
  }
  return { draft: emptyDraft(today), restored: false }
}

/** Cangkang: memuat master data (cache dulu, lalu server). Badan form baru dibuat setelah siap. */
export default function SubmitWizard() {
  const { options, status, stale, today, reload } = useFormOptions()
  const queue = useOfflineQueue()

  if (status === 'error' && !options) {
    return (
      <div className="space-y-4 px-4 pt-5 lg:px-8">
        {header}
        <div role="alert" className="glass space-y-3 p-4">
          <p className="font-semibold">Data form belum bisa dimuat</p>
          <p className="text-sm text-fg-muted">Periksa koneksi internet Anda lalu coba lagi.</p>
          <Button onClick={reload}>Coba lagi</Button>
        </div>
        <QueueBanner queue={queue} />
      </div>
    )
  }
  if (!options || !today) {
    return (
      <div className="space-y-3 px-4 pt-5 lg:px-8" aria-busy="true" aria-label="Memuat form">
        {header}
        <div className="skeleton h-2" />
        <div className="skeleton h-14" />
        <div className="skeleton h-14" />
        <div className="skeleton h-14" />
      </div>
    )
  }
  return <WizardBody options={options} today={today} stale={stale} queue={queue} />
}

function WizardBody({
  options,
  today,
  stale,
  queue,
}: {
  options: FormOptions
  today: string
  stale: boolean
  queue: ReturnType<typeof useOfflineQueue>
}) {
  const reduced = useReducedMotion()
  const store = useMemo(() => defaultStore(), [])
  const [saver] = useState(() => createDebouncedSaver())
  const heading = useRef<HTMLHeadingElement>(null)
  const earliest = earliestEntryDate({ today, backdate_max_days: options.backdate_max_days })
  const [init] = useState(() => initialDraft(today, earliest))

  const [draft, setDraft] = useState<Draft>(init.draft)
  const [photos, setPhotos] = useState<Blob[]>([])
  const [restored, setRestored] = useState(init.restored)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [attempted, setAttempted] = useState<Record<number, boolean>>({})
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [dir, setDir] = useState<1 | -1>(1)
  const [phase, setPhase] = useState<Phase>('edit')
  const [token, setToken] = useState<string | null>(null)
  const [resetSignal, setResetSignal] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [sent, setSent] = useState<Sent | null>(null)
  const [retrying, setRetrying] = useState(false)

  /* ---- foto draft dipulihkan (async, di callback promise) ---- */
  useEffect(() => {
    if (init.restored) void loadDraftPhotos(store).then((p) => setPhotos(p))
  }, [init.restored, store])

  /* ---- simpan otomatis di perangkat ---- */
  useEffect(() => {
    if (phase === 'edit') saver.save(draft)
  }, [draft, phase, saver])
  useEffect(() => () => saver.flush(), [saver])
  useEffect(() => {
    const flush = () => saver.flush()
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [saver])

  /* ---- foto: simpan ke perangkat + sinkron jumlah ---- */
  const onPhotos = useCallback(
    (next: Blob[]) => {
      setPhotos(next)
      setDraft((d) => ({ ...d, photo_count: next.length }))
      void saveDraftPhotos(store, next)
    },
    [store],
  )

  /* ---- error ---- */
  const validateOpts = useMemo(
    () => ({ today, backdateMaxDays: options.backdate_max_days }),
    [options.backdate_max_days, today],
  )
  const allErrors = useMemo(
    () => ({ ...validateDraft(draft, validateOpts), ...serverErrors }),
    [draft, validateOpts, serverErrors],
  )
  const visibleErrors = useMemo(() => {
    const out: Record<string, string | undefined> = {}
    for (const [k, v] of Object.entries(allErrors)) {
      if (attempted[stepOfKey(k)] || touched[k]) out[k] = v
    }
    return out
  }, [allErrors, attempted, touched])

  /* ---- mutasi draft ---- */
  const set = useCallback((patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setServerErrors((e) => (Object.keys(e).length ? {} : e))
  }, [])
  const setItem = useCallback((id: string, patch: Partial<DraftItem>) => {
    setDraft((d) =>
      d ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : d,
    )
  }, [])
  const addItem = useCallback(
    () => setDraft((d) => (d ? { ...d, items: [...d.items, emptyItem()] } : d)),
    [],
  )
  const removeItem = useCallback(
    (id: string) =>
      setDraft((d) =>
        d && d.items.length > 1 ? { ...d, items: d.items.filter((i) => i.id !== id) } : d,
      ),
    [],
  )
  const touch = useCallback(
    (key: string) => setTouched((t) => (t[key] ? t : { ...t, [key]: true })),
    [],
  )

  /* ---- navigasi langkah ---- */
  const goTo = useCallback(
    (n: 0 | 1 | 2) => {
      setDir(n >= draft.step ? 1 : -1)
      // Hanya mengganti langkah: error dari server TIDAK boleh terhapus oleh navigasi
      // (hanya ketikan pengguna yang menghapusnya, lewat `set`).
      setDraft((d) => ({ ...d, step: n }))
      setMessage(null)
      window.scrollTo({ top: 0 })
      setTimeout(() => heading.current?.focus({ preventScroll: true }), 60)
    },
    [draft.step],
  )

  function next() {
    const step = draft.step
    setAttempted((a) => ({ ...a, [step]: true }))
    if (Object.keys(errorsForStep(allErrors, step)).length > 0) {
      focusFirstInvalid()
      return
    }
    if (step < 2) goTo((step + 1) as 1 | 2)
  }

  function resetForm() {
    clearDraft()
    void clearDraftPhotos(store)
    saver.cancel()
    setDraft(emptyDraft(today))
    setPhotos([])
    setTouched({})
    setAttempted({})
    setServerErrors({})
    setSent(null)
    setToken(null)
    setMessage(null)
    setRestored(false)
    setPhase('edit')
    setDir(1)
    window.scrollTo({ top: 0 })
  }

  /* ---- kirim ---- */
  async function submit() {
    if (phase === 'sending') return
    const errors = validateDraft(draft, validateOpts)
    const bad = firstInvalidStep(errors)
    if (bad !== null) {
      setAttempted({ 0: true, 1: true, 2: true })
      if (bad !== draft.step) goTo(bad)
      focusFirstInvalid()
      return
    }
    if (!env.demo && !token) {
      setMessage('Selesaikan verifikasi keamanan dulu.')
      return
    }
    setPhase('sending')
    setMessage(null)
    const input = draftToInput(draft) as SubmissionInput
    const out = await sendSubmission(api, input, photos, env.demo ? 'demo' : (token ?? undefined))

    if (out.kind === 'sent') {
      saver.cancel()
      clearDraft()
      void clearDraftPhotos(store)
      setSent({
        ticket: out.ticket,
        input,
        photos,
        total: totalKg(draft),
        photosFailed: out.photosFailed,
      })
      setPhase('sent')
      window.scrollTo({ top: 0 })
      return
    }
    if (out.kind === 'offline') {
      try {
        await queue.enqueue({ key: draft.idempotency_key, submission: input, photos })
        saver.cancel()
        clearDraft()
        void clearDraftPhotos(store)
        setPhase('queued')
        window.scrollTo({ top: 0 })
        return
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Tidak ada koneksi. Coba lagi.')
      }
    } else if (out.kind === 'invalid') {
      setServerErrors(out.fields ?? {})
      setAttempted({ 0: true, 1: true, 2: true })
      const step = firstInvalidStep(out.fields ?? {})
      if (step !== null && step !== draft.step) goTo(step)
      focusFirstInvalid()
      setMessage(out.message)
    } else if (out.kind === 'rate-limited') {
      const min = out.retryAfter ? Math.max(1, Math.ceil(out.retryAfter / 60)) : null
      setMessage(
        `Terlalu banyak kiriman dari jaringan ini. Coba lagi${min ? ` dalam ${min} menit` : ' nanti'}.`,
      )
    } else if (out.kind === 'needs-verification') {
      setMessage('Verifikasi keamanan kedaluwarsa atau ditolak. Selesaikan lagi, lalu kirim.')
    } else if (out.kind === 'error') {
      setMessage(out.message)
    }
    // Token Turnstile hanya sekali pakai: minta yang baru setelah percobaan gagal.
    setToken(null)
    setResetSignal((n) => n + 1)
    setPhase('edit')
  }

  async function retryPhotos() {
    if (!sent) return
    setRetrying(true)
    // Idempoten: server mengenali idempotency_key dan memberi URL unggah baru tanpa Turnstile.
    const out = await sendSubmission(api, sent.input, sent.photos)
    setRetrying(false)
    if (out.kind === 'sent') setSent({ ...sent, photosFailed: out.photosFailed })
  }

  /* ---- render ---- */
  const step = draft.step
  const common = {
    draft,
    options,
    today,
    earliest,
    errors: visibleErrors,
    set,
    setItem,
    addItem,
    removeItem,
    touch,
  }

  return (
    <div className="px-4 pt-5 pb-32 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-4">
        {header}
        <QueueBanner queue={queue} />

        {phase === 'sent' && sent ? (
          <SuccessTicket
            ticket={sent.ticket}
            submission={sent.input}
            options={options}
            total={sent.total}
            photosFailed={sent.photosFailed}
            retrying={retrying}
            onRetryPhotos={() => void retryPhotos()}
            onReset={resetForm}
          />
        ) : phase === 'queued' ? (
          <div className="glass space-y-3 p-5" role="status">
            <h2 className="text-xl font-bold" tabIndex={-1}>
              Tersimpan di perangkat ini
            </h2>
            <p className="text-fg-muted">
              Tidak ada koneksi, jadi kiriman Anda disimpan dan akan dikirim otomatis saat internet
              kembali. Jangan hapus data peramban sebelum terkirim. Kode tiket akan muncul setelah
              terkirim.
            </p>
            <Button size="lg" block onClick={resetForm}>
              Isi lagi
            </Button>
          </div>
        ) : (
          <>
            {restored && (
              <div
                className="flex items-center gap-3 rounded-xl bg-accent-soft px-3 py-2 text-sm"
                role="status"
              >
                <span className="min-w-0 flex-1">Draft dipulihkan dari perangkat ini.</span>
                <button type="button" className="min-h-12 px-2 font-semibold" onClick={resetForm}>
                  Mulai baru
                </button>
              </div>
            )}
            {stale && (
              <p className="text-xs text-fg-faint" role="status">
                Memakai data tersimpan karena koneksi ke server bermasalah.
              </p>
            )}

            <div>
              <p className="mb-2 text-sm text-fg-muted" aria-live="polite">
                Langkah {step + 1} dari 3 ·{' '}
                <span className="font-semibold text-fg">{STEP_LABELS[step]}</span>
              </p>
              <ProgressBar value={(step + 1) / 3} label={`Langkah ${step + 1} dari 3`} />
            </div>

            <div className="relative overflow-x-clip">
              <AnimatePresence initial={false} custom={dir} mode="popLayout">
                <m.div
                  key={step}
                  custom={dir}
                  variants={reduced ? stepFade : stepSlide}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  {step === 0 && <StepSender ref={heading} {...common} />}
                  {step === 1 && (
                    <StepItems ref={heading} {...common} photos={photos} onPhotos={onPhotos} />
                  )}
                  {step === 2 && (
                    <StepConfirm
                      ref={heading}
                      {...common}
                      photoCount={photos.length}
                      onToken={setToken}
                      onExpire={() => setToken(null)}
                      resetSignal={resetSignal}
                      message={message}
                    />
                  )}
                </m.div>
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {phase !== 'sent' && phase !== 'queued' && (
        <StickyActionBar>
          {step > 0 && (
            <Button
              variant="secondary"
              size="lg"
              disabled={phase === 'sending'}
              onClick={() => goTo((step - 1) as 0 | 1)}
            >
              Kembali
            </Button>
          )}
          {step < 2 ? (
            <Button size="lg" className="flex-1" onClick={next}>
              Lanjut
            </Button>
          ) : (
            <Button
              size="lg"
              className="flex-1"
              disabled={phase === 'sending' || (!env.demo && !token)}
              onClick={() => void submit()}
            >
              {phase === 'sending' ? 'Mengirim…' : 'Kirim'}
            </Button>
          )}
        </StickyActionBar>
      )}
    </div>
  )
}
