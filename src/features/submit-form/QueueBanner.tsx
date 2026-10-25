import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/format'
import { copyText } from '@/lib/clipboard'
import { TurnstileBox } from './TurnstileBox'
import type { useOfflineQueue } from './useOfflineQueue'

type Queue = ReturnType<typeof useOfflineQueue>

/** Kiriman tertunda (tersimpan di perangkat) + hasil kirim ulang otomatis. */
export function QueueBanner({ queue }: { queue: Queue }) {
  const { items, busy, needsToken, notices } = queue
  const [token, setToken] = useState<string | null>(null)
  const [reset, setReset] = useState(0)
  if (items.length === 0 && notices.length === 0) return null

  return (
    <section aria-label="Kiriman tertunda" className="space-y-2">
      {notices.map((n, i) => (
        <div
          key={i}
          role={n.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
            n.kind === 'sent' ? 'bg-accent-soft text-fg' : 'bg-danger-soft text-danger'
          }`}
        >
          <span className="min-w-0 flex-1">
            {n.text}
            {n.ticket && (
              <>
                {' '}
                Kode: <span className="font-mono font-semibold">{n.ticket}</span>
              </>
            )}
          </span>
          {n.ticket && (
            <button
              type="button"
              className="min-h-12 px-2 font-semibold"
              onClick={() => void copyText(n.ticket!)}
            >
              Salin
            </button>
          )}
          <button
            type="button"
            className="min-h-12 px-2 font-semibold"
            onClick={() => queue.dismissNotice(i)}
            aria-label="Tutup pemberitahuan"
          >
            Tutup
          </button>
        </div>
      ))}

      {items.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn-soft p-3 text-sm" role="status">
          <p className="font-semibold text-warn">
            {items.length} kiriman tertunda · tersimpan di perangkat ini
          </p>
          <ul className="mt-1 space-y-1">
            {items.map((it) => (
              <li key={it.key} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-fg">
                  {formatDate(it.submission.entry_date)} · {it.submission.items.length} jenis limbah
                  {it.lastError && <span className="block text-danger">{it.lastError}</span>}
                </span>
                <button
                  type="button"
                  className="min-h-12 px-2 font-semibold text-danger"
                  onClick={() => void queue.remove(it.key)}
                  aria-label="Hapus kiriman tertunda"
                >
                  Hapus
                </button>
              </li>
            ))}
          </ul>
          {needsToken ? (
            <div className="mt-2 space-y-2">
              <p className="text-fg">Selesaikan verifikasi keamanan untuk mengirim.</p>
              <TurnstileBox
                onToken={(t) => {
                  setToken(t)
                  void queue.flush(t).then(() => {
                    setToken(null)
                    setReset((r) => r + 1)
                  })
                }}
                onExpire={() => setToken(null)}
                resetSignal={reset}
              />
              {token && busy && <p className="text-fg-muted">Mengirim…</p>}
            </div>
          ) : (
            <Button
              className="mt-2"
              variant="secondary"
              disabled={busy}
              onClick={() => void queue.flush()}
            >
              {busy ? 'Mengirim…' : 'Kirim sekarang'}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
