import { useMemo, useRef, useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { fieldAria, inputClass } from '@/components/ui/fieldUtils'
import type { FormOptions, FormWasteType } from '@/lib/public-form/types'

interface WastePickerProps {
  id: string
  value: string
  onChange: (code: string) => void
  onBlur?: () => void
  options: FormOptions
  error?: string
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '')
const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/** Kelompok dengan warna + KODE (warna tidak berdiri sendiri). */
export function GroupChip({ code }: { code: string }) {
  return (
    <span
      className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-1.5 font-mono text-[11px] font-semibold"
      title={`Kelompok ${code}`}
    >
      <span
        className="size-2.5 rounded-sm"
        style={{ background: `var(--${code.toLowerCase()})` }}
        aria-hidden="true"
      />
      {code}
    </span>
  )
}

/** Picker jenis limbah B3: bottom sheet dengan pencarian kode/nama dan label warna kelompok. */
export function WastePicker({ id, value, onChange, onBlur, options, error }: WastePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const selected = options.waste_types.find((w) => w.code === value)

  const groups = useMemo(() => {
    const qCode = norm(query)
    const qTokens = tokens(query)
    const match = (w: FormWasteType) =>
      !query.trim() ||
      norm(w.code).includes(qCode) ||
      qTokens.every((t) => w.name.toLowerCase().includes(t))
    return options.groups
      .map((g) => ({
        group: g,
        items: options.waste_types.filter((w) => w.group_code === g.code && match(w)),
      }))
      .filter((g) => g.items.length > 0)
  }, [options, query])

  const close = () => {
    setOpen(false)
    setQuery('')
    onBlur?.()
  }

  return (
    <>
      <button
        {...fieldAria(id, error)}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={`${inputClass(!!error)} flex h-auto min-h-12 items-center gap-2 py-2 text-left`}
      >
        {selected ? (
          <>
            <GroupChip code={selected.group_code} />
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-sm font-semibold">{selected.code}</span>
              <span className="line-clamp-2 text-sm text-fg-muted">{selected.name}</span>
            </span>
          </>
        ) : (
          <span className="text-fg-faint">Pilih jenis limbah B3…</span>
        )}
        <span aria-hidden="true" className="ml-auto text-fg-faint">
          ▾
        </span>
      </button>

      <BottomSheet
        open={open}
        onClose={close}
        title="Pilih jenis limbah B3"
        initialFocus={() => search.current}
      >
        <div className="sticky top-0 z-10 -mx-4 bg-bg-elevated px-4 pb-3">
          <input
            ref={search}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Cari kode atau nama limbah"
            placeholder="Cari kode atau nama, mis. B105d atau oli"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={inputClass()}
          />
        </div>
        {groups.length === 0 && (
          <p className="py-6 text-center text-fg-muted">
            Tidak ada yang cocok. Hubungi petugas SPU bila jenis limbah Anda belum ada di daftar.
          </p>
        )}
        {groups.map(({ group, items }) => (
          <section key={group.code} aria-label={`${group.code} ${group.name}`} className="mb-3">
            <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
              <GroupChip code={group.code} />
              {group.name}
            </h3>
            <ul>
              {items.map((w) => (
                <li key={w.code}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(w.code)
                      close()
                    }}
                    aria-pressed={w.code === value}
                    className={`flex min-h-14 w-full items-start gap-3 rounded-xl px-2 py-2 text-left ${
                      w.code === value ? 'bg-accent-soft' : ''
                    }`}
                  >
                    <span className="mt-0.5 w-[4.5rem] shrink-0 font-mono text-sm font-semibold">
                      {w.code}
                    </span>
                    <span className="text-[15px] leading-snug">{w.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="pt-2 pb-1 text-xs text-fg-faint">
          Kelompok warna adalah usulan dan sedang direview K3.
        </p>
      </BottomSheet>
    </>
  )
}
