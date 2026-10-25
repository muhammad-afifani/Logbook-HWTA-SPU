import { useCallback, useEffect, useState } from 'react'
import { fetchFormOptions } from '@/lib/public-form/api'
import type { FormOptions } from '@/lib/public-form/types'
import { todayInZone } from '@shared/dates.ts'

const CACHE_KEY = 'spu-form-options-v1'

function readCache(): FormOptions | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { data?: FormOptions }
    return v.data && Array.isArray(v.data.waste_types) && v.data.waste_types.length > 0
      ? v.data
      : null
  } catch {
    return null
  }
}

export type OptionsStatus = 'loading' | 'ready' | 'error'

/**
 * Master data form: tampil cepat dari cache perangkat (form tetap bisa diisi tanpa sinyal),
 * lalu disegarkan dari server. "Hari ini" dihitung di zona waktu lokasi, bukan zona perangkat.
 */
export function useFormOptions() {
  const [options, setOptions] = useState<FormOptions | null>(() => readCache())
  const [status, setStatus] = useState<OptionsStatus>(() => (readCache() ? 'ready' : 'loading'))
  const [stale, setStale] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchFormOptions()
      .then((fresh) => {
        if (cancelled) return
        setOptions(fresh)
        setStatus('ready')
        setStale(false)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: fresh }))
        } catch {
          /* kuota/mode privat */
        }
      })
      .catch(() => {
        if (cancelled) return
        setStale(true)
        setStatus((s) => (s === 'ready' ? 'ready' : 'error'))
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const reload = useCallback(() => {
    setStatus((s) => (s === 'error' ? 'loading' : s))
    setReloadKey((k) => k + 1)
  }, [])

  const today = options ? todayInZone(options.timezone) : null
  return { options, status, stale, today, reload }
}
