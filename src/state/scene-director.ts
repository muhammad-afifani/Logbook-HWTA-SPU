/**
 * Orkestrasi motion: hanya SATU adegan utama yang boleh bergerak pada satu waktu.
 *
 * Adegan (mis. "kamera ke slot baru + pallet meluncur", "count-up dashboard",
 * "intro sinematik site") meminta giliran lewat `request()`. Adegan berikutnya
 * menunggu sampai adegan aktif memanggil `finish()`. Adegan dengan `mergeKey`
 * yang sama digabung (mis. beberapa event realtime "+4 drum B105d" menjadi satu).
 */
import { create } from 'zustand'

export type ScenePriority = 'low' | 'normal' | 'high'

export interface Scene {
  id: string
  kind: string
  priority?: ScenePriority
  /** Adegan dengan mergeKey sama yang masih antre akan digabung. */
  mergeKey?: string
  payload?: unknown
}

interface SceneDirectorState {
  active: Scene | null
  queue: Scene[]
  request: (scene: Scene, merge?: (prev: Scene, next: Scene) => Scene) => void
  finish: (id: string) => void
  skip: () => void
  clear: () => void
}

const rank: Record<ScenePriority, number> = { high: 0, normal: 1, low: 2 }

function enqueue(
  queue: Scene[],
  scene: Scene,
  merge?: (prev: Scene, next: Scene) => Scene,
): Scene[] {
  if (scene.mergeKey) {
    const idx = queue.findIndex((s) => s.mergeKey === scene.mergeKey)
    if (idx >= 0) {
      const merged = merge ? merge(queue[idx]!, scene) : scene
      return queue.map((s, i) => (i === idx ? merged : s))
    }
  }
  const next = [...queue, scene]
  // Stabil: urut prioritas, lalu urutan masuk.
  return next
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank[a.s.priority ?? 'normal'] - rank[b.s.priority ?? 'normal'] || a.i - b.i)
    .map(({ s }) => s)
}

export const useSceneDirector = create<SceneDirectorState>((set, get) => ({
  active: null,
  queue: [],
  request: (scene, merge) => {
    const { active, queue } = get()
    if (!active) {
      set({ active: scene })
      return
    }
    set({ queue: enqueue(queue, scene, merge) })
  },
  finish: (id) => {
    const { active, queue } = get()
    if (!active || active.id !== id) return
    const [next, ...rest] = queue
    set({ active: next ?? null, queue: rest })
  },
  skip: () => {
    const { active } = get()
    if (active) get().finish(active.id)
  },
  clear: () => set({ active: null, queue: [] }),
}))
