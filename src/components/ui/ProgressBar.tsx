import { m, useReducedMotion } from 'motion/react'
import { duration, ease } from '@/design/motion'

interface ProgressBarProps {
  /** 0..1 */
  value: number
  label: string
  className?: string
}

/** Progres tipis; mengisi lewat scaleX (transform). */
export function ProgressBar({ value, label, className = '' }: ProgressBarProps) {
  const reduced = useReducedMotion()
  const v = Math.max(0, Math.min(1, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={`h-1.5 overflow-hidden rounded-full bg-line ${className}`}
    >
      <m.div
        className="h-full origin-left rounded-full bg-accent"
        initial={false}
        animate={{ scaleX: v }}
        transition={reduced ? { duration: 0 } : { duration: duration.transition, ease: ease.out }}
      />
    </div>
  )
}
