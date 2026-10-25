import { Field } from '@/components/ui/Field'
import { fieldAria, inputClass } from '@/components/ui/fieldUtils'
import { Stepper } from '@/components/ui/Stepper'
import type { DraftItem } from '@/lib/public-form/draft-store'
import type { FormOptions } from '@/lib/public-form/types'
import { WastePicker } from './WastePicker'

interface ItemCardProps {
  index: number
  item: DraftItem
  options: FormOptions
  errors: Record<string, string | undefined>
  canRemove: boolean
  onChange: (patch: Partial<DraftItem>) => void
  onRemove: () => void
  onTouch: (field: string) => void
}

export function ItemCard({
  index,
  item,
  options,
  errors,
  canRemove,
  onChange,
  onRemove,
  onTouch,
}: ItemCardProps) {
  const p = `items.${index}`
  const pid = (f: string) => `item-${index}-${f}`
  const err = (f: string) => errors[`${p}.${f}`]
  const estimated = item.package_count === null

  return (
    <fieldset className="glass min-w-0 space-y-4 p-4">
      <legend className="sr-only">Limbah {index + 1}</legend>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Limbah {index + 1}</h3>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="min-h-12 px-2 text-sm font-semibold text-danger"
            aria-label={`Hapus limbah ${index + 1}`}
          >
            Hapus
          </button>
        )}
      </div>

      <Field id={pid('waste')} label="Jenis Limbah B3" required error={err('waste_code')}>
        <WastePicker
          id={pid('waste')}
          value={item.waste_code}
          options={options}
          error={err('waste_code')}
          onBlur={() => onTouch(`${p}.waste_code`)}
          onChange={(code) => {
            const w = options.waste_types.find((x) => x.code === code)
            onChange({
              waste_code: code,
              packaging_code: w?.default_packaging ?? item.packaging_code,
            })
          }}
        />
      </Field>

      <Field id={pid('pkg')} label="Jenis kemasan" required error={err('packaging_code')}>
        <select
          {...fieldAria(pid('pkg'), err('packaging_code'))}
          value={item.packaging_code}
          onChange={(e) => onChange({ packaging_code: e.target.value })}
          onBlur={() => onTouch(`${p}.packaging_code`)}
          className={inputClass(!!err('packaging_code'))}
        >
          <option value="" disabled>
            Pilih kemasan…
          </option>
          {options.packaging_types.map((k) => (
            <option key={k.code} value={k.code}>
              {k.name}
            </option>
          ))}
        </select>
      </Field>

      <div>
        <p className="text-sm font-medium text-fg-muted" id={pid('count-label')}>
          Jumlah kemasan{' '}
          <span aria-hidden="true" className="text-danger">
            *
          </span>
          <span className="sr-only"> (wajib)</span>
        </p>
        <div className="mt-1.5">
          <Stepper
            id={pid('count')}
            label="Jumlah kemasan"
            value={item.package_count ?? 1}
            disabled={estimated}
            onChange={(n) => onChange({ package_count: n })}
          />
        </div>
        {err('package_count') && (
          <p role="alert" className="mt-1.5 text-sm text-danger">
            {err('package_count')}
          </p>
        )}
        <label className="mt-2 flex min-h-12 cursor-pointer items-center gap-3 text-sm text-fg-muted">
          <input
            type="checkbox"
            className="size-6 accent-[var(--c-accent)]"
            checked={estimated}
            onChange={(e) => onChange({ package_count: e.target.checked ? null : 1 })}
          />
          Jumlah belum pasti — perkirakan dari berat
        </label>
      </div>

      <Field
        id={pid('kg')}
        label="Jumlah (Kg)"
        required
        error={err('weight_kg')}
        hint="Boleh desimal, contoh 12,5"
      >
        <div className="relative">
          <input
            {...fieldAria(pid('kg'), err('weight_kg'), 'Boleh desimal, contoh 12,5')}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={item.weight_kg}
            onChange={(e) => onChange({ weight_kg: e.target.value })}
            onBlur={() => onTouch(`${p}.weight_kg`)}
            className={`${inputClass(!!err('weight_kg'))} pr-14 font-mono`}
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-fg-faint">
            kg
          </span>
        </div>
      </Field>
    </fieldset>
  )
}
