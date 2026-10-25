import type { BuildingConfig } from '@/config/spu-building'
import { GROUP_BY_CODE } from '@/config/waste-groups'
import type { Layout } from '@/domain/capacity/computeLayout'

interface LayoutPlan2DProps {
  cfg: BuildingConfig
  layout: Layout
  className?: string
}

const T = 0.2 // tebal dinding gambar (m)

/**
 * Denah 2D dari atas (SVG) — dihitung dari computeLayout yang sama dengan 3D.
 * Menjadi dasar fallback 2D bila WebGL tidak tersedia (Fase 5).
 */
export function LayoutPlan2D({ cfg, layout, className }: LayoutPlan2DProps) {
  const { length: L, width: W } = cfg.interior
  const roller = cfg.doors.roller
  const emergency = cfg.doors.emergency
  const pad = 0.7

  const summary =
    `Denah SPU ${L} × ${W} m: ${layout.totals.blocks} blok, ${layout.totals.footprints} tapak pallet, ` +
    `${layout.levels} tingkat, total ${layout.totals.slots} slot. Pintu roller di sisi barat, ` +
    `pintu darurat di sisi timur, lorong utama ${cfg.mainAisleWidth} m di tengah.`

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${L + pad * 2} ${W + pad * 2}`}
      className={className}
      role="img"
      aria-label={summary}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <defs>
        <pattern
          id="hatch"
          width="0.35"
          height="0.35"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="0.35" stroke="var(--c-border-strong)" strokeWidth="0.06" />
        </pattern>
      </defs>

      {/* Lantai */}
      <rect x={0} y={0} width={L} height={W} fill="var(--c-bg-sunken)" />

      {/* Area penerimaan / bebas pintu */}
      <rect
        x={layout.receiving.x0}
        y={layout.receiving.y0}
        width={layout.receiving.x1 - layout.receiving.x0}
        height={layout.receiving.y1 - layout.receiving.y0}
        fill="url(#hatch)"
      />
      <text x={0.25} y={0.55} fontSize={0.32} fill="var(--c-text-muted)">
        Area penerimaan
      </text>

      {/* Batas jarak dinding */}
      <rect
        x={layout.inner.x0}
        y={layout.inner.y0}
        width={layout.inner.x1 - layout.inner.x0}
        height={layout.inner.y1 - layout.inner.y0}
        fill="none"
        stroke="var(--c-border-strong)"
        strokeWidth={0.04}
        strokeDasharray="0.15 0.12"
      />

      {/* Lorong utama = jalur evakuasi */}
      <rect
        x={0}
        y={layout.mainAisle.y0}
        width={L}
        height={layout.mainAisle.y1 - layout.mainAisle.y0}
        fill="var(--c-accent-soft)"
      />
      {Array.from({ length: 7 }, (_, i) => {
        const x = 2 + i * 2
        const y = (layout.mainAisle.y0 + layout.mainAisle.y1) / 2
        return (
          <path
            key={x}
            d={`M${x - 0.25} ${y - 0.22} L${x + 0.1} ${y} L${x - 0.25} ${y + 0.22}`}
            fill="none"
            stroke="var(--c-accent)"
            strokeWidth={0.07}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}

      {/* Blok + tapak pallet */}
      {layout.blocks.map((b) => {
        const color = b.zone ? `var(--${b.zone.toLowerCase()})` : 'var(--c-text-faint)'
        const fps = layout.footprints.filter((f) => f.blockId === b.id)
        const group = b.zone ? GROUP_BY_CODE[b.zone] : null
        return (
          <g key={b.id}>
            <title>{`${b.id} · ${b.zone ?? '-'} ${group?.name ?? ''}`}</title>
            {fps.map((f) => (
              <rect
                key={f.id}
                x={f.x - cfg.pallet.size / 2 + 0.04}
                y={f.y - cfg.pallet.size / 2 + 0.04}
                width={cfg.pallet.size - 0.08}
                height={cfg.pallet.size - 0.08}
                rx={0.08}
                fill={color}
                fillOpacity={0.22}
                stroke={color}
                strokeWidth={0.05}
              />
            ))}
            <text
              x={(b.x0 + b.x1) / 2}
              y={(b.y0 + b.y1) / 2 + 0.16}
              fontSize={0.46}
              fontWeight={700}
              textAnchor="middle"
              fill="var(--c-text)"
              stroke="var(--c-bg-sunken)"
              strokeWidth={0.14}
              paintOrder="stroke"
            >
              {b.zone ?? b.id}
            </text>
          </g>
        )
      })}

      {/* Dinding dengan bukaan pintu */}
      <g fill="var(--c-text-muted)">
        {/* utara & selatan */}
        <rect x={-T} y={-T} width={L + 2 * T} height={T} />
        <rect x={-T} y={W} width={L + 2 * T} height={T} />
        {/* barat, terputus pintu roller */}
        <rect x={-T} y={0} width={T} height={roller.centerY - roller.width / 2} />
        <rect
          x={-T}
          y={roller.centerY + roller.width / 2}
          width={T}
          height={W - roller.centerY - roller.width / 2}
        />
        {/* timur, terputus pintu darurat */}
        <rect x={L} y={0} width={T} height={emergency.centerY - emergency.width / 2} />
        <rect
          x={L}
          y={emergency.centerY + emergency.width / 2}
          width={T}
          height={W - emergency.centerY - emergency.width / 2}
        />
      </g>
      <text
        x={-0.45}
        y={roller.centerY}
        fontSize={0.3}
        fill="var(--c-warn)"
        textAnchor="middle"
        transform={`rotate(-90 -0.45 ${roller.centerY})`}
      >
        PINTU ROLLER {roller.width} m
      </text>
      <text
        x={L + 0.45}
        y={emergency.centerY}
        fontSize={0.3}
        fill="var(--c-accent)"
        textAnchor="middle"
        transform={`rotate(90 ${L + 0.45} ${emergency.centerY})`}
      >
        PINTU DARURAT
      </text>
    </svg>
  )
}
