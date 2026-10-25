import type { TicketStatus } from '@/lib/public-form/types'
import { IconCheck, IconClock, IconClose } from './icons'

const META: Record<TicketStatus, { label: string; cls: string; Icon: typeof IconClock }> = {
  pending: { label: 'Menunggu verifikasi', cls: 'bg-warn-soft text-warn', Icon: IconClock },
  verified: { label: 'Diverifikasi', cls: 'bg-accent-soft text-accent', Icon: IconCheck },
  rejected: { label: 'Ditolak', cls: 'bg-danger-soft text-danger', Icon: IconClose },
}

/** Status tiket: warna + ikon + teks (warna tidak berdiri sendiri). */
export function StatusBadge({ status }: { status: TicketStatus }) {
  const { label, cls, Icon } = META[status]
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${cls}`}
    >
      <Icon size={16} />
      {label}
    </span>
  )
}
