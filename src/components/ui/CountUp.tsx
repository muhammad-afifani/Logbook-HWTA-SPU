import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { duration, ease } from '@/design/motion'

interface CountUpProps {
  value: number
  /** Jumlah digit desimal yang ditampilkan. */
  decimals?: number
  /** Mulai dari nilai ini pada render pertama (default 0). */
  from?: number
  className?: string
  suffix?: string
}

const formatters = new Map<number, Intl.NumberFormat>()
function fmt(decimals: number) {
  let f = formatters.get(decimals)
  if (!f) {
    f = new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    formatters.set(decimals, f)
  }
  return f
}

/**
 * Angka yang menghitung naik ke nilai baru. Menulis langsung ke textContent
 * (tanpa re-render React per frame). Reduced motion: langsung ke nilai akhir.
 */
export function CountUp({ value, decimals = 0, from = 0, className, suffix }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const last = useRef(from)
  const reduced = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const f = fmt(decimals)
    if (reduced) {
      el.textContent = f.format(value)
      last.current = value
      return
    }
    const controls = animate(last.current, value, {
      duration: duration.scene,
      ease: ease.out,
      onUpdate: (v) => {
        el.textContent = f.format(v)
      },
    })
    last.current = value
    return () => controls.stop()
  }, [value, decimals, reduced])

  return (
    <span className={`tabular ${className ?? ''}`}>
      <span ref={ref} aria-hidden="true">
        {fmt(decimals).format(from)}
      </span>
      {/* Nilai final untuk pembaca layar, tidak ikut beranimasi. */}
      <span className="sr-only">{fmt(decimals).format(value)}</span>
      {suffix}
    </span>
  )
}
