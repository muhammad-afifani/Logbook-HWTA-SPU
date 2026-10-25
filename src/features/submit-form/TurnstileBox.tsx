import { useEffect, useRef, useState } from 'react'
import { env } from '@/config/env'
import { loadTurnstile } from '@/lib/public-form/turnstile'

interface TurnstileBoxProps {
  onToken: (token: string) => void
  onExpire?: () => void
  /** Naikkan angka ini untuk mengatur ulang widget (mis. setelah token ditolak server). */
  resetSignal?: number
}

/** Cloudflare Turnstile (tema mengikuti perangkat). Mode demo melewati verifikasi. */
export function TurnstileBox({ onToken, onExpire, resetSignal = 0 }: TurnstileBoxProps) {
  const host = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const cb = useRef({ onToken, onExpire })
  useEffect(() => {
    cb.current = { onToken, onExpire }
  })
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(() =>
    env.demo ? 'ready' : env.turnstileSiteKey ? 'loading' : 'error',
  )
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (env.demo) {
      cb.current.onToken('demo')
      return
    }
    if (!env.turnstileSiteKey) return
    let cancelled = false
    loadTurnstile()
      .then((api) => {
        if (cancelled || !host.current) return
        widget.current = api.render(host.current, {
          sitekey: env.turnstileSiteKey,
          action: 'submit-waste',
          theme: 'auto',
          size: 'flexible',
          language: 'id',
          callback: (t) => cb.current.onToken(t),
          'expired-callback': () => cb.current.onExpire?.(),
          'error-callback': () => setState('error'),
        })
        setState('ready')
      })
      .catch(() => !cancelled && setState('error'))
    return () => {
      cancelled = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [attempt])

  useEffect(() => {
    if (resetSignal > 0 && widget.current) window.turnstile?.reset(widget.current)
  }, [resetSignal])

  if (env.demo) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm text-fg-muted">
        Mode demo: verifikasi keamanan dilewati.
      </p>
    )
  }
  return (
    <div>
      <div ref={host} aria-label="Verifikasi keamanan" className="min-h-[65px]" />
      {state === 'loading' && <p className="text-sm text-fg-muted">Memuat verifikasi keamanan…</p>}
      {state === 'error' && (
        <p role="alert" className="text-sm text-danger">
          {env.turnstileSiteKey
            ? 'Verifikasi keamanan gagal dimuat. '
            : 'Verifikasi keamanan belum dikonfigurasi. '}
          {env.turnstileSiteKey && (
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Coba lagi
            </button>
          )}
        </p>
      )}
    </div>
  )
}
