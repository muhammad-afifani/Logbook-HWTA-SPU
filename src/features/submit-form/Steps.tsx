import { forwardRef, type ReactNode, useId } from 'react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { CountUp } from '@/components/ui/CountUp'
import { Field } from '@/components/ui/Field'
import { fieldAria, inputClass } from '@/components/ui/fieldUtils'
import { IconPlus } from '@/components/ui/icons'
import { addDays } from '@shared/dates.ts'
import { SITE } from '@/config/env'
import { formatDate, formatKg } from '@/lib/format'
import { parseDecimal } from '@/lib/format'
import { ItemCard } from './ItemCard'
import { PhotoPicker } from './PhotoPicker'
import { GroupChip } from './WastePicker'
import { phonePreview, totalKg } from './model'
import type { StepProps } from './stepTypes'
import { TurnstileBox } from './TurnstileBox'

const StepHeading = forwardRef<HTMLHeadingElement, { children: ReactNode }>(({ children }, ref) => (
  <h2 ref={ref} tabIndex={-1} className="text-xl font-bold outline-none">
    {children}
  </h2>
))
StepHeading.displayName = 'StepHeading'

/* ------------------------------------------------------------ langkah 1 */
export const StepSender = forwardRef<HTMLHeadingElement, StepProps>(function StepSender(p, ref) {
  const { draft, options, today, earliest, errors, set, touch } = p
  const preview = phonePreview(draft.phone)
  return (
    <div className="space-y-5">
      <StepHeading ref={ref}>Data pengirim</StepHeading>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-fg-muted">Lokasi</span>
        <span
          className="inline-flex h-8 items-center rounded-full border border-line-strong bg-surface-strong px-3 font-mono font-semibold"
          aria-label={`Lokasi tetap ${SITE}`}
        >
          {SITE}
        </span>
      </div>

      <Field
        id="entry_date"
        label="Tanggal masuk ke SPU"
        required
        error={errors.entry_date}
        hint={`Hari ini atau sampai ${options.backdate_max_days} hari ke belakang (${formatDate(earliest)} – ${formatDate(today)}).`}
      >
        <input
          {...fieldAria('entry_date', errors.entry_date)}
          type="date"
          min={earliest}
          max={today}
          value={draft.entry_date}
          onChange={(e) => set({ entry_date: e.target.value })}
          onBlur={() => touch('entry_date')}
          className={inputClass(!!errors.entry_date)}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="min-h-12 rounded-xl border border-line-strong px-4 text-sm font-semibold"
            onClick={() => set({ entry_date: today })}
          >
            Hari ini
          </button>
          <button
            type="button"
            className="min-h-12 rounded-xl border border-line-strong px-4 text-sm font-semibold"
            onClick={() => set({ entry_date: addDays(today, -1) })}
          >
            Kemarin
          </button>
          <span className="ml-auto font-mono text-sm text-fg-muted">
            {formatDate(draft.entry_date)}
          </span>
        </div>
      </Field>

      <Field
        id="source"
        label="Sumber (asal limbah)"
        required
        error={errors.source}
        hint="Pilih saran atau ketik sendiri."
      >
        <Combobox
          id="source"
          value={draft.source}
          onChange={(v) => set({ source: v })}
          onBlur={() => touch('source')}
          options={options.suggestions.source}
          error={errors.source}
          hint="Pilih saran atau ketik sendiri."
          placeholder="mis. Workshop, Gudang, Kapal…"
        />
      </Field>

      <Field
        id="sender_name"
        label="Nama pengirim limbah ke SPU"
        required
        error={errors.sender_name}
      >
        <input
          {...fieldAria('sender_name', errors.sender_name)}
          type="text"
          autoComplete="name"
          maxLength={120}
          value={draft.sender_name}
          onChange={(e) => set({ sender_name: e.target.value })}
          onBlur={() => touch('sender_name')}
          className={inputClass(!!errors.sender_name)}
        />
      </Field>

      <Field id="entity" label="Entity" required error={errors.entity}>
        <Combobox
          id="entity"
          value={draft.entity}
          onChange={(v) => set({ entity: v })}
          onBlur={() => touch('entity')}
          options={options.suggestions.entity}
          error={errors.entity}
          placeholder="Nama perusahaan / unit"
          autoComplete="organization"
        />
      </Field>

      <Field
        id="phone"
        label="No telepon yang dapat dihubungi"
        required
        error={errors.phone}
        hint={
          preview ? `Disimpan sebagai ${preview}` : 'Contoh: 0812-3456-7890 atau +62 812 3456 7890'
        }
      >
        <input
          {...fieldAria('phone', errors.phone, preview ? `Disimpan sebagai ${preview}` : 'Contoh')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={24}
          value={draft.phone}
          onChange={(e) => set({ phone: e.target.value })}
          onBlur={() => touch('phone')}
          className={`${inputClass(!!errors.phone)} font-mono`}
        />
      </Field>
    </div>
  )
})

/* ------------------------------------------------------------ langkah 2 */
interface StepItemsProps extends StepProps {
  photos: Blob[]
  onPhotos: (photos: Blob[]) => void
}

export const StepItems = forwardRef<HTMLHeadingElement, StepItemsProps>(function StepItems(p, ref) {
  const { draft, options, errors, setItem, addItem, removeItem, touch, photos, onPhotos } = p
  const total = totalKg(draft)
  return (
    <div className="space-y-5">
      <StepHeading ref={ref}>Item limbah</StepHeading>
      <p className="text-sm text-fg-muted">
        Satu baris untuk setiap jenis limbah dalam kiriman ini.
      </p>

      {draft.items.map((item, i) => (
        <ItemCard
          key={item.id}
          index={i}
          item={item}
          options={options}
          errors={errors}
          canRemove={draft.items.length > 1}
          onChange={(patch) => setItem(item.id, patch)}
          onRemove={() => removeItem(item.id)}
          onTouch={touch}
        />
      ))}
      {errors.items && (
        <p role="alert" className="text-sm text-danger">
          {errors.items}
        </p>
      )}

      <Button
        variant="secondary"
        block
        icon={<IconPlus size={18} />}
        onClick={addItem}
        disabled={draft.items.length >= 20}
      >
        Tambah jenis limbah lain
      </Button>

      <div className="glass flex items-baseline justify-between p-4" aria-live="polite">
        <span className="text-sm text-fg-muted">Total seluruh baris</span>
        <span className="font-mono text-2xl font-semibold">
          <CountUp value={total} decimals={2} suffix=" kg" />
        </span>
      </div>

      <PhotoPicker photos={photos} onChange={onPhotos} />
      {errors.photo_count && (
        <p role="alert" className="text-sm text-danger">
          {errors.photo_count}
        </p>
      )}
    </div>
  )
})

/* ------------------------------------------------------------ langkah 3 */
function CheckRow({
  id,
  checked,
  onChange,
  error,
  children,
}: {
  id: string
  checked: boolean
  onChange: (v: boolean) => void
  error?: string
  children: ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${
          error ? 'border-danger' : 'border-line-strong'
        } ${checked ? 'bg-accent-soft' : ''}`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="size-6 shrink-0 accent-[var(--c-accent)]"
        />
        <span className="text-[15px]">{children}</span>
      </label>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

interface StepConfirmProps extends StepProps {
  photoCount: number
  onToken: (t: string) => void
  onExpire: () => void
  resetSignal: number
  message: string | null
}

export const StepConfirm = forwardRef<HTMLHeadingElement, StepConfirmProps>(
  function StepConfirm(p, ref) {
    const { draft, options, errors, set, photoCount, onToken, onExpire, resetSignal, message } = p
    const notesId = useId()
    const wasteName = (code: string) => options.waste_types.find((w) => w.code === code)
    return (
      <div className="space-y-5">
        <StepHeading ref={ref}>Konfirmasi</StepHeading>

        <section className="glass space-y-3 p-4" aria-label="Ringkasan kiriman">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-fg-muted">Lokasi</dt>
            <dd className="font-mono font-semibold">{SITE}</dd>
            <dt className="text-fg-muted">Tanggal masuk</dt>
            <dd>{formatDate(draft.entry_date)}</dd>
            <dt className="text-fg-muted">Sumber</dt>
            <dd>{draft.source}</dd>
            <dt className="text-fg-muted">Pengirim</dt>
            <dd>
              {draft.sender_name} · {draft.entity}
            </dd>
            <dt className="text-fg-muted">Telepon</dt>
            <dd className="font-mono">{phonePreview(draft.phone) ?? draft.phone}</dd>
            <dt className="text-fg-muted">Foto</dt>
            <dd>{photoCount} foto</dd>
          </dl>
          <ul className="divide-y divide-line border-t border-line">
            {draft.items.map((it) => {
              const w = wasteName(it.waste_code)
              const kg = parseDecimal(it.weight_kg)
              return (
                <li key={it.id} className="flex items-start gap-2 py-2 text-sm">
                  {w && <GroupChip code={w.group_code} />}
                  <span className="min-w-0 flex-1">
                    <span className="font-mono font-semibold">{it.waste_code}</span>
                    <span className="line-clamp-1 text-fg-muted">{w?.name}</span>
                  </span>
                  <span className="font-mono">{Number.isFinite(kg) ? formatKg(kg) : '-'}</span>
                </li>
              )
            })}
          </ul>
          <p className="flex items-baseline justify-between border-t border-line pt-2">
            <span className="text-sm text-fg-muted">Total</span>
            <span className="font-mono text-xl font-semibold">
              <CountUp value={totalKg(draft)} decimals={2} suffix=" kg" />
            </span>
          </p>
        </section>

        <fieldset className="min-w-0 space-y-2">
          <legend className="mb-1 text-sm font-medium text-fg-muted">
            Konfirmasi kemasan{' '}
            <span className="text-danger" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> (wajib semua)</span>
          </legend>
          <CheckRow
            id="confirm_sealed"
            checked={draft.confirm_sealed}
            onChange={(v) => set({ confirm_sealed: v })}
            error={errors.confirm_sealed}
          >
            Kemasan tertutup rapat
          </CheckRow>
          <CheckRow
            id="confirm_no_leak"
            checked={draft.confirm_no_leak}
            onChange={(v) => set({ confirm_no_leak: v })}
            error={errors.confirm_no_leak}
          >
            Kemasan tidak bocor
          </CheckRow>
          <CheckRow
            id="confirm_labeled"
            checked={draft.confirm_labeled}
            onChange={(v) => set({ confirm_labeled: v })}
            error={errors.confirm_labeled}
          >
            Label B3 terpasang
          </CheckRow>
        </fieldset>

        <Field id={notesId} label="Catatan (opsional)" error={errors.notes}>
          <textarea
            {...fieldAria(notesId, errors.notes)}
            rows={3}
            maxLength={1000}
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
            className={`${inputClass(!!errors.notes)} h-auto py-3`}
          />
        </Field>

        <p className="rounded-xl border border-line px-3 py-2.5 text-sm text-fg-muted">
          <strong className="font-semibold text-fg">Privasi:</strong> nama dan nomor telepon Anda
          hanya terlihat oleh petugas SPU. Halaman publik tidak pernah menampilkannya.
        </p>

        <TurnstileBox onToken={onToken} onExpire={onExpire} resetSignal={resetSignal} />

        {message && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            {message}
          </p>
        )}
      </div>
    )
  },
)
