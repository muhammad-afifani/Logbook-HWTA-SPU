import { AnimatePresence, animate, m, useMotionValue, useReducedMotion } from 'motion/react'
import { type ReactNode, useCallback, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { duration, ease, spring } from '@/design/motion'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Tinggi sheet sebagai pecahan layar (snap). Default satu titik: hampir penuh. Urut naik. */
  snapPoints?: number[]
  /** Elemen yang difokuskan saat dibuka (default: judul). */
  initialFocus?: () => HTMLElement | null
}

const DISMISS_PX = 110
const FLICK = 0.55 // px/ms

/**
 * Bottom sheet: geser handle untuk menutup atau pindah snap point; Esc menutup; fokus dikunci
 * di dalam sheet dan dikembalikan ke pemicu. Gerak hanya transform/opacity; reduced motion = fade.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  snapPoints = [0.88],
  initialFocus,
}: BottomSheetProps) {
  const reduced = useReducedMotion()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const y = useMotionValue(0)
  const drag = useRef<{
    startY: number
    startOffset: number
    t: number
    v: number
    lastY: number
  } | null>(null)
  const snap = useRef(snapPoints.length - 1)
  const opener = useRef<HTMLElement | null>(null)

  const heightPx = () => window.innerHeight * snapPoints[snapPoints.length - 1]!
  const offsetFor = (i: number) =>
    heightPx() * (1 - snapPoints[i]! / snapPoints[snapPoints.length - 1]!)

  // Kunci scroll latar + fokus
  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement as HTMLElement | null
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    snap.current = snapPoints.length - 1
    y.set(0)
    const raf = requestAnimationFrame(() => {
      const target =
        initialFocus?.() ?? panelRef.current?.querySelector<HTMLElement>('[data-sheet-title]')
      target?.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = prev
      opener.current?.focus?.({ preventScroll: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
      )
      if (!nodes || nodes.length === 0) return
      const first = nodes[0]!
      const last = nodes[nodes.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = {
      startY: e.clientY,
      startOffset: y.get(),
      t: performance.now(),
      v: 0,
      lastY: e.clientY,
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const now = performance.now()
    d.v = (e.clientY - d.lastY) / Math.max(1, now - d.t)
    d.t = now
    d.lastY = e.clientY
    // Tarik ke atas melewati snap tertinggi diberi hambatan.
    const next = d.startOffset + (e.clientY - d.startY)
    y.set(next < 0 ? next * 0.2 : next)
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const cur = y.get()
    const lowest = offsetFor(0)
    if (cur > lowest + DISMISS_PX || d.v > FLICK) {
      onClose()
      return
    }
    // Snap ke titik terdekat (dengan dorongan flick).
    const projected = cur + d.v * 120
    let best = 0
    for (let i = 0; i < snapPoints.length; i++) {
      if (Math.abs(offsetFor(i) - projected) < Math.abs(offsetFor(best) - projected)) best = i
    }
    snap.current = best
    animate(y, offsetFor(best), reduced ? { duration: 0 } : spring.sheet)
  }

  const node = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
          <m.div
            className="absolute inset-0 bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.transitionFast, ease: ease.out }}
            onClick={onClose}
            aria-hidden="true"
          />
          <m.div
            className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-lg"
            initial={reduced ? { opacity: 0 } : { y: '100%' }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={reduced ? { duration: duration.microSlow } : spring.sheet}
          >
            <m.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              style={{ y, height: `${snapPoints[snapPoints.length - 1]! * 100}dvh` }}
              className="glass flex flex-col rounded-b-none bg-bg-elevated"
            >
              <div
                className="grid h-9 shrink-0 cursor-grab touch-none place-items-center"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <span className="h-1.5 w-10 rounded-full bg-line-strong" aria-hidden="true" />
              </div>
              <h2
                id={titleId}
                data-sheet-title
                tabIndex={-1}
                className="px-4 pb-2 text-lg font-bold outline-none"
              >
                {title}
              </h2>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,var(--safe-bottom))]">
                {children}
              </div>
            </m.div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  )
  return createPortal(node, document.body)
}
