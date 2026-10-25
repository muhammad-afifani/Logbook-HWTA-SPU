import { useEffect, useState } from 'react'

interface LiveDotProps {
  /** Waktu pembaruan terakhir (ms epoch). null = belum pernah. */
  updatedAt: number | null
  /** Lewat dari ini (detik) dianggap basi. */
  staleAfter?: number
  offline?: boolean
}

function relative(seconds: number): string {
  if (seconds < 5) return 'baru saja'
  if (seconds < 60) return `${seconds} detik lalu`
  const min = Math.floor(seconds / 60)
  if (min < 60) return `${min} menit lalu`
  return `${Math.floor(min / 60)} jam lalu`
}

/** Titik live berdenyut + "diperbarui X detik lalu". */
export function LiveDot({ updatedAt, staleAfter = 120, offline }: LiveDotProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const seconds = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null
  const state = offline ? 'offline' : seconds !== null && seconds > staleAfter ? 'stale' : 'live'
  const text = offline
    ? 'Offline'
    : seconds === null
      ? 'Menghubungkan…'
      : `Diperbarui ${relative(seconds)}`

  return (
    <span className="inline-flex items-center gap-2 text-xs text-fg-muted" role="status">
      <span className="live-dot" data-state={state} aria-hidden="true" />
      <span className="tabular">{text}</span>
    </span>
  )
}
