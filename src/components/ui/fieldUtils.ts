/** Kelas input seragam: tinggi 48 px (target sentuh), font 16 px (mencegah zoom otomatis iOS). */
export const inputClass = (invalid?: boolean) =>
  'h-12 w-full rounded-xl border bg-bg-sunken px-4 text-base text-fg placeholder:text-fg-faint ' +
  (invalid ? 'border-danger' : 'border-line-strong')

/** Atribut ARIA untuk kontrol di dalam Field. */
export function fieldAria(id: string, error?: string, hint?: string) {
  const describedBy = [error ? `${id}-error` : '', hint ? `${id}-hint` : '']
    .filter(Boolean)
    .join(' ')
  return {
    id,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': describedBy || undefined,
  }
}
