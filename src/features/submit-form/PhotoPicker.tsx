import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconPlus } from '@/components/ui/icons'
import { compressImage, MAX_PHOTOS, PhotoError } from '@/lib/public-form/image-compress'

interface PhotoPickerProps {
  photos: Blob[]
  onChange: (photos: Blob[]) => void
  disabled?: boolean
}

/** Foto opsional (maks. 3): dikompres di perangkat (sisi ≤ 1280 px), diunggah ke bucket privat saat kirim. */
export function PhotoPicker({ photos, onChange, disabled }: PhotoPickerProps) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urls = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setBusy(true)
    const next = [...photos]
    try {
      for (const file of [...files]) {
        if (next.length >= MAX_PHOTOS) {
          setError(`Maksimal ${MAX_PHOTOS} foto.`)
          break
        }
        next.push(await compressImage(file))
      }
    } catch (e) {
      setError(e instanceof PhotoError ? e.message : 'Foto tidak bisa diproses. Coba foto lain.')
    } finally {
      setBusy(false)
      onChange(next)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div>
      <p className="text-sm font-medium text-fg-muted">
        Foto kemasan <span className="text-fg-faint">(opsional, maksimal {MAX_PHOTOS})</span>
      </p>
      {photos.length > 0 && (
        <ul className="mt-2 grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <li
              key={urls[i]}
              className="overflow-hidden rounded-xl border border-line-strong bg-bg-sunken"
            >
              <img
                src={urls[i]}
                alt={`Foto ${i + 1}`}
                className="aspect-square w-full object-cover"
              />
              <div className="flex items-center justify-between gap-1 px-2 py-1">
                <span className="font-mono text-[11px] text-fg-faint">
                  {Math.round(p.size / 1024)} KB
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  className="min-h-12 px-1 text-sm font-semibold text-danger"
                  onClick={() => onChange(photos.filter((_, j) => j !== i))}
                  aria-label={`Hapus foto ${i + 1}`}
                >
                  Hapus
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="photo-input"
        onChange={(e) => void onFiles(e.target.files)}
      />
      {photos.length < MAX_PHOTOS && (
        <Button
          variant="secondary"
          className="mt-2"
          icon={<IconPlus size={18} />}
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Memproses foto…' : photos.length ? 'Tambah foto' : 'Ambil / pilih foto'}
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
