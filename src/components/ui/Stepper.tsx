import { IconMinus, IconPlus } from './icons'

interface StepperProps {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
}

const btn =
  'grid size-12 shrink-0 place-items-center rounded-xl border border-line-strong bg-surface-strong ' +
  'text-fg transition-transform active:scale-95 disabled:opacity-40'

/** Stepper +/- (target 48 px) dengan input angka yang bisa diketik. */
export function Stepper({
  id,
  label,
  value,
  onChange,
  min = 1,
  max = 10000,
  disabled,
}: StepperProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button
        type="button"
        className={btn}
        aria-label={`Kurangi ${label.toLowerCase()}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        <IconMinus size={20} />
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        disabled={disabled}
        value={String(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '')
          if (digits) onChange(clamp(Number(digits)))
        }}
        className="h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-bg-sunken text-center font-mono text-lg font-semibold"
      />
      <button
        type="button"
        className={btn}
        aria-label={`Tambah ${label.toLowerCase()}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <IconPlus size={20} />
      </button>
    </div>
  )
}
