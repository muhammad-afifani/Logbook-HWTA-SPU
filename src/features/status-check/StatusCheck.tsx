import { useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { fieldAria, inputClass } from '@/components/ui/fieldUtils'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate, formatDateTime } from '@/lib/format'
import { ApiError, checkTicketStatus, NetworkError } from '@/lib/public-form/api'
import type { TicketStatusResult } from '@/lib/public-form/types'
import { normalizeTicketCode } from '@shared/ticket.ts'

/** Cek status tiket: hanya status + alasan penolakan + ringkasan tanpa data pribadi. */
export default function StatusCheck() {
  const [params] = useSearchParams()
  const id = useId()
  const [code, setCode] = useState(params.get('kode') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [result, setResult] = useState<TicketStatusResult | null>(null)
  const result$ = useRef<HTMLDivElement>(null)

  async function run(raw: string) {
    const normalized = normalizeTicketCode(raw)
    setResult(null)
    if (!normalized) {
      setError('Format kode tiket: SPU-YYMM-NNNN-XXXX, contoh SPU-2610-0001-K7QX.')
      return
    }
    setError(undefined)
    setBusy(true)
    try {
      setResult(await checkTicketStatus(normalized))
      setCode(normalized)
      setTimeout(() => result$.current?.focus({ preventScroll: false }), 50)
    } catch (e) {
      if (e instanceof NetworkError)
        setError('Tidak ada koneksi. Periksa internet Anda lalu coba lagi.')
      else if (e instanceof ApiError && e.status === 404)
        setError('Tiket tidak ditemukan. Periksa lagi kodenya.')
      else if (e instanceof ApiError && e.status === 429)
        setError('Terlalu banyak percobaan. Coba lagi beberapa saat lagi.')
      else if (e instanceof ApiError && e.status === 422) setError(e.message)
      else setError('Gagal memeriksa status. Coba lagi sebentar lagi.')
    } finally {
      setBusy(false)
    }
  }

  // Tautan dari layar sukses (/status?kode=...) langsung memeriksa.
  const auto = useRef(false)
  useEffect(() => {
    const k = params.get('kode')
    if (k && !auto.current) {
      auto.current = true
      void run(k)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <PageHeader
        eyebrow="Cek status"
        title="Status kiriman"
        description="Masukkan kode tiket untuk melihat status: menunggu, diverifikasi, atau ditolak. Data pribadi tidak ditampilkan."
      />
      <div className="mx-auto max-w-2xl space-y-4 px-4 lg:px-8">
        <form
          className="glass space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void run(code)
          }}
          noValidate
        >
          <Field id={id} label="Kode tiket" required error={error}>
            <input
              {...fieldAria(id, error)}
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="SPU-2610-0001-K7QX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${inputClass(!!error)} font-mono tracking-wider uppercase`}
            />
          </Field>
          <Button type="submit" size="lg" block disabled={busy || !code.trim()}>
            {busy ? 'Memeriksa…' : 'Cek status'}
          </Button>
        </form>

        {result && (
          <div
            ref={result$}
            tabIndex={-1}
            className="glass space-y-4 p-5 outline-none"
            aria-live="polite"
            data-testid="status-result"
          >
            <div>
              <p className="text-xs tracking-widest text-fg-muted uppercase">Kode tiket</p>
              <p className="mt-1 font-mono text-xl font-bold tracking-wider break-all text-accent">
                {result.ticket_code}
              </p>
            </div>
            <StatusBadge status={result.status} />
            {result.status === 'rejected' && (
              <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm">
                <p className="font-semibold text-danger">Alasan penolakan</p>
                <p className="mt-0.5">{result.reject_reason}</p>
              </div>
            )}
            {result.status === 'pending' && (
              <p className="text-sm text-fg-muted">Kiriman Anda menunggu verifikasi petugas SPU.</p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-fg-muted">Tanggal masuk</dt>
              <dd>{formatDate(result.entry_date)}</dd>
              <dt className="text-fg-muted">Dikirim</dt>
              <dd>{formatDateTime(result.submitted_at)}</dd>
              {result.verified_at && (
                <>
                  <dt className="text-fg-muted">
                    {result.status === 'rejected' ? 'Ditolak' : 'Diverifikasi'}
                  </dt>
                  <dd>{formatDateTime(result.verified_at)}</dd>
                </>
              )}
            </dl>
            <ul className="divide-y divide-line border-t border-line">
              {result.items.map((it, i) => (
                <li key={i} className="flex items-start gap-2 py-2 text-sm">
                  <span className="font-mono font-semibold">{it.waste_code}</span>
                  <span className="min-w-0 flex-1 text-fg-muted">{it.waste_name}</span>
                  <span className="shrink-0">
                    {it.package_count} × {it.packaging}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  )
}
