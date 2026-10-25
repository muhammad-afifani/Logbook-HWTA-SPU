/** Penanda fitur yang belum dibangun (dihapus bertahap per fase). */
export function PhaseNote({ phase, children }: { phase: number; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-sm text-fg-muted">
      <span className="rounded-md bg-surface-strong px-1.5 py-0.5 font-mono text-[11px] font-semibold text-fg">
        FASE {phase}
      </span>
      <span>{children}</span>
    </p>
  )
}
