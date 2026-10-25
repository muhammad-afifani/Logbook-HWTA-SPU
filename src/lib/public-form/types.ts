/** Tipe data kontrak publik form (cocok dengan Edge Function form-options / submit-waste / check-status). */
export interface FormGroup {
  code: string
  name: string
  color_dark: string
  color_light: string
}
export interface FormWasteType {
  code: string
  name: string
  group_code: string
  default_packaging: string
  kg_per_package: number | null
}
export interface FormPackaging {
  code: string
  name: string
}
export interface FormOptions {
  site: string
  backdate_max_days: number
  timezone: string
  today: string
  groups: FormGroup[]
  waste_types: FormWasteType[]
  packaging_types: FormPackaging[]
  suggestions: { source: string[]; entity: string[] }
}

export interface UploadTarget {
  path: string
  url: string
  token: string
}
export interface SubmitResult {
  ticket_code: string
  created: boolean
  uploads: UploadTarget[]
}

export type TicketStatus = 'pending' | 'verified' | 'rejected'
export interface TicketStatusResult {
  ticket_code: string
  status: TicketStatus
  reject_reason: string | null
  entry_date: string
  submitted_at: string
  verified_at: string | null
  items: { waste_code: string; waste_name: string; package_count: number; packaging: string }[]
}
