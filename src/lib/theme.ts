import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const KEY = 'spu-theme'
const THEME_COLOR: Record<Theme, string> = { dark: '#0b1513', light: '#f2f5f3' }
const listeners = new Set<() => void>()

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* mode privat: abaikan */
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'dark' as Theme)
  return [theme, setTheme]
}
