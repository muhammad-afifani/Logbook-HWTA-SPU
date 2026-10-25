import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useKeyboardInset } from './useKeyboardInset'

/**
 * Bar aksi menempel di bawah (di atas navigasi bawah), naik mengikuti keyboard.
 * Dirender lewat portal ke <body>: leluhur ber-transform (animasi halaman) menjadi acuan posisi
 * bagi `position: fixed`, sehingga di dalam pohon halaman bar sempat salah tempat saat animasi.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  useKeyboardInset()
  return createPortal(
    <div className="action-bar border-t border-line bg-bg/90 backdrop-blur-md" data-action-bar>
      <div className="mx-auto flex max-w-2xl gap-3 px-4 py-3">{children}</div>
    </div>,
    document.body,
  )
}
