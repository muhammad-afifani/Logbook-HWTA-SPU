import type { Draft, DraftItem } from '@/lib/public-form/draft-store'
import type { FormOptions } from '@/lib/public-form/types'

export interface StepProps {
  draft: Draft
  options: FormOptions
  today: string
  earliest: string
  /** Hanya error yang boleh tampil (sudah disentuh / sudah coba lanjut). */
  errors: Record<string, string | undefined>
  set: (patch: Partial<Draft>) => void
  setItem: (id: string, patch: Partial<DraftItem>) => void
  addItem: () => void
  removeItem: (id: string) => void
  touch: (key: string) => void
}
