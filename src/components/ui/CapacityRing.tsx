import { m, useReducedMotion } from 'motion/react'
import { duration, ease } from '@/design/motion'
import { CountUp } from './CountUp'

interface CapacityRingProps {
  /** 0..1 */
  ratio: number
  label?: string
  sublabel?: string
  size?: number
  /** Ambang peringatan (default 0,8 & 0,95 — dari app_config nanti). */
  warnAt?: number
  criticalAt?: number
}

/** Cincin kapasitas: terisi dengan animasi path-draw, warna mengikuti ambang. */
export function CapacityRing({
  ratio,
  label = 'Slot terpakai',
  sublabel,
  size = 168,
  warnAt = 0.8,
  criticalAt = 0.95,
}: CapacityRingProps) {
  const reduced = useReducedMotion()
  const clamped = Math.max(0, Math.min(1, ratio))
  const stroke = 12
  const r = (size - stroke) / 2
  const color =
    clamped >= criticalAt
      ? 'var(--c-danger)'
      : clamped >= warnAt
        ? 'var(--c-warn)'
        : 'var(--c-accent)'

  return (
    <figure
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
      aria-label={`${label}: ${Math.round(clamped * 100)} persen`}
      role="img"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--c-border-strong)"
          strokeWidth={stroke}
        />
        <m.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: reduced ? clamped : 0 }}
          animate={{ pathLength: clamped }}
          transition={{ duration: reduced ? 0 : duration.sceneSlow, ease: ease.out }}
        />
      </svg>
      <figcaption className="absolute inset-0 grid place-content-center text-center">
        <span className="font-mono text-3xl font-semibold" style={{ color }}>
          <CountUp value={Math.round(clamped * 100)} suffix="%" />
        </span>
        <span className="text-xs text-fg-muted">{label}</span>
        {sublabel && <span className="mt-0.5 text-xs text-fg-faint">{sublabel}</span>}
      </figcaption>
    </figure>
  )
}
