import { useEffect } from 'react'

/**
 * Menjaga bar aksi tetap terlihat saat keyboard virtual muncul (visualViewport).
 * - --kb-offset: tinggi area yang tertutup keyboard di iOS (layout viewport tidak menyusut).
 * - html[data-keyboard=open]: keyboard terdeteksi terbuka → navigasi bawah disembunyikan (lihat index.css).
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    let baseline = Math.max(window.innerHeight, vv.height)
    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')
      if (!editing) baseline = Math.max(window.innerHeight, vv.height)
      const shrunk = baseline - vv.height > 150
      root.style.setProperty('--kb-offset', `${inset}px`)
      root.dataset.keyboard = editing && (inset > 120 || shrunk) ? 'open' : 'closed'
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('focusin', update)
    window.addEventListener('focusout', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('focusin', update)
      window.removeEventListener('focusout', update)
      root.style.removeProperty('--kb-offset')
      delete root.dataset.keyboard
    }
  }, [])
}
