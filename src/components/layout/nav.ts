import type { ComponentType, SVGProps } from 'react'
import { IconForm, IconGauge, IconShield, IconTicket } from '@/components/ui/icons'

export interface NavItem {
  to: string
  label: string
  /** Label pendek untuk bottom navigation di HP. */
  short: string
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/lapor', label: 'Lapor limbah', short: 'Lapor', icon: IconForm },
  { to: '/status', label: 'Cek status tiket', short: 'Status', icon: IconTicket },
  { to: '/dashboard', label: 'Dashboard', short: 'Dashboard', icon: IconGauge },
  { to: '/petugas', label: 'Area petugas', short: 'Petugas', icon: IconShield },
]
