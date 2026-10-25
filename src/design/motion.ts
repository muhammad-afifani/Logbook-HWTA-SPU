/**
 * Token motion "Living Logbook" — satu-satunya tempat durasi, easing, dan spring.
 *
 * Aturan (lihat CLAUDE.md):
 *  - Gerak menjelaskan perubahan data, bukan hiasan.
 *  - Hanya animasikan transform dan opacity.
 *  - prefers-reduced-motion: ganti dengan fade sederhana (pakai `pick()` / `reduced*`).
 *  - Maksimal satu adegan utama bergerak sekaligus (lihat src/state/scene-director.ts).
 */
import type { Transition, Variants } from 'motion/react'

/** Durasi dalam detik (motion memakai detik). */
export const duration = {
  /** Mikro: hover/tap, centang, toggle. 120–200 ms. */
  microFast: 0.12,
  micro: 0.16,
  microSlow: 0.2,
  /** Transisi: halaman, sheet, langkah wizard. 300–500 ms. */
  transitionFast: 0.3,
  transition: 0.4,
  transitionSlow: 0.5,
  /** Adegan: count-up, grafik menggambar, kamera 3D. 700–1200 ms. */
  sceneFast: 0.7,
  scene: 0.9,
  sceneSlow: 1.2,
} as const

export const ease = {
  /** Keluar halus — default untuk hampir semua gerak. */
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>

/** Spring untuk elemen fisik (sheet, kartu swipe, objek 3D). */
export const spring = {
  physical: { type: 'spring', stiffness: 260, damping: 26, mass: 1 },
  sheet: { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 },
  soft: { type: 'spring', stiffness: 170, damping: 24, mass: 1 },
} as const satisfies Record<string, Transition>

export const stagger = {
  /** Jeda antar kartu yang muncul bertahap. */
  children: 0.05,
  max: 0.4,
} as const

export const transition = {
  micro: { duration: duration.micro, ease: ease.out },
  base: { duration: duration.transition, ease: ease.out },
  scene: { duration: duration.scene, ease: ease.out },
  fade: { duration: duration.microSlow, ease: 'linear' },
} as const satisfies Record<string, Transition>

/** Pilih versi reduced bila pengguna meminta gerak minimal. */
export function pick<T>(reduced: boolean | null, full: T, minimal: T): T {
  return reduced ? minimal : full
}

/* ---------- Variants umum ---------- */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: transition.base },
}

export const fadeOnly: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transition.fade },
}

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: stagger.children } },
}

/** Perpindahan langkah wizard: geser horizontal sesuai arah. */
export const stepSlide: Variants = {
  enter: (dir: 1 | -1) => ({ x: dir * 48, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: transition.base },
  exit: (dir: 1 | -1) => ({
    x: dir * -48,
    opacity: 0,
    transition: { duration: duration.transitionFast, ease: ease.out },
  }),
}

export const stepFade: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: transition.fade },
  exit: { opacity: 0, transition: transition.fade },
}

/** Halaman: naik tipis + fade. */
export const page: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, transition: { duration: duration.microSlow, ease: ease.out } },
}

export const pageReduced: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transition.fade },
  exit: { opacity: 0, transition: transition.fade },
}

/** Getaran ringan saat sukses (hanya perangkat yang mendukung). */
export function haptic(pattern: number | number[] = 12): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {
      /* diabaikan: sebagian browser memblokir tanpa gesture */
    }
  }
}
