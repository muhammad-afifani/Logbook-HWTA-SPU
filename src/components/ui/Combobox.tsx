import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { fieldAria, inputClass } from './fieldUtils'

interface ComboboxProps {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  /** Saran (dari data yang disetujui petugas). Ketik bebas tetap diperbolehkan. */
  options: string[]
  placeholder?: string
  error?: string
  hint?: string
  autoComplete?: string
  maxLength?: number
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Combobox ARIA 1.2: input teks + daftar saran, panah/Enter/Esc, ketik bebas diperbolehkan. */
export function Combobox({
  id,
  value,
  onChange,
  onBlur,
  options,
  placeholder,
  error,
  hint,
  autoComplete = 'off',
  maxLength = 120,
}: ComboboxProps) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = norm(value)
    const list = q ? options.filter((o) => norm(o).includes(q)) : options
    return list.filter((o) => o !== value).slice(0, 6)
  }, [options, value])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const showList = open && filtered.length > 0
  const choose = (v: string) => {
    onChange(v)
    setActive(-1)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        {...fieldAria(id, error, hint)}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        className={inputClass(!!error)}
        onChange={(e) => {
          onChange(e.target.value)
          setActive(-1)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((a) => Math.min(filtered.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(-1, a - 1))
          } else if (e.key === 'Enter' && showList && active >= 0) {
            e.preventDefault()
            choose(filtered[active]!)
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      />
      <ul
        id={listId}
        role="listbox"
        hidden={!showList}
        className="glass absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto bg-bg-elevated p-1 shadow-xl"
      >
        {filtered.map((o, i) => (
          <li
            key={o}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onPointerDown={(e) => e.preventDefault() /* jaga fokus input */}
            onClick={() => choose(o)}
            className={`flex min-h-12 cursor-pointer items-center rounded-lg px-3 text-[15px] ${
              i === active ? 'bg-accent-soft text-accent' : ''
            }`}
          >
            {o}
          </li>
        ))}
      </ul>
    </div>
  )
}
