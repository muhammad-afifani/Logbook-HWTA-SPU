import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultStore } from '@/lib/public-form/kv'
import { createQueue, type QueuedSubmission } from '@/lib/public-form/offline-queue'
import { sendSubmission } from '@/lib/public-form/submit-service'
import * as api from '@/lib/public-form/api'

export interface QueueNotice {
  kind: 'sent' | 'error'
  text: string
  ticket?: string
}

/**
 * Antrean kirim ulang. Saat online dicoba dulu TANPA token Turnstile: bila kiriman ternyata sudah
 * sampai di server (respons hilang), server mengenali idempotency_key dan menjawab 200. Hanya bila
 * server minta verifikasi, `needsToken` aktif dan pengguna menyelesaikan Turnstile.
 */
export function useOfflineQueue() {
  const [queue] = useState(() => createQueue(defaultStore()))
  const [items, setItems] = useState<QueuedSubmission[]>([])
  const [busy, setBusy] = useState(false)
  const [needsToken, setNeedsToken] = useState(false)
  const [notices, setNotices] = useState<QueueNotice[]>([])
  const running = useRef(false)

  const refresh = useCallback(async () => {
    setItems(await queue.list())
  }, [queue])

  const flush = useCallback(
    async (token?: string) => {
      if (running.current) return
      running.current = true
      setBusy(true)
      try {
        for (const item of await queue.list()) {
          const out = await sendSubmission(api, item.submission, item.photos, token)
          if (out.kind === 'sent') {
            await queue.remove(item.key)
            setNeedsToken(false)
            setNotices((n) => [
              ...n,
              { kind: 'sent', ticket: out.ticket, text: 'Kiriman tertunda berhasil dikirim.' },
            ])
          } else if (out.kind === 'needs-verification') {
            setNeedsToken(true)
            break
          } else if (out.kind === 'invalid') {
            await queue.update(item.key, { lastError: out.message })
            setNotices((n) => [
              ...n,
              { kind: 'error', text: `Kiriman tertunda ditolak: ${out.message}` },
            ])
          } else if (out.kind === 'rate-limited') {
            setNotices((n) => [
              ...n,
              { kind: 'error', text: 'Terlalu banyak kiriman. Coba lagi nanti.' },
            ])
            break
          } else {
            break // offline / error server: coba lagi nanti
          }
        }
      } finally {
        running.current = false
        setBusy(false)
        await refresh()
      }
    },
    [queue, refresh],
  )

  useEffect(() => {
    let cancelled = false
    queue.list().then((list) => {
      if (cancelled) return
      setItems(list)
      if (list.length > 0 && navigator.onLine) void flush()
    })
    const onOnline = () => void flush()
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
    }
  }, [flush, queue])

  return {
    items,
    busy,
    needsToken,
    notices,
    enqueue: async (item: Parameters<typeof queue.enqueue>[0]) => {
      await queue.enqueue(item)
      await refresh()
    },
    remove: async (key: string) => {
      await queue.remove(key)
      await refresh()
    },
    flush,
    dismissNotice: (i: number) => setNotices((n) => n.filter((_, j) => j !== i)),
  }
}
