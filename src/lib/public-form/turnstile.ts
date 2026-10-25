/** Pemuat Cloudflare Turnstile (skrip dimuat malas saat langkah Konfirmasi dibuka). */
export interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string
      action?: string
      theme?: 'auto' | 'light' | 'dark'
      size?: 'normal' | 'flexible' | 'compact'
      language?: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
    },
  ): string
  reset(widgetId?: string): void
  remove(widgetId?: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | null = null

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile tidak tersedia'))
    s.onerror = () => {
      loading = null
      reject(new Error('Gagal memuat verifikasi keamanan'))
    }
    document.head.appendChild(s)
  })
  return loading
}
