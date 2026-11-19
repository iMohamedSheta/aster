import { useId } from 'react'

const CHART_COLORS = ['#2a3747', '#526379', '#a85833', '#7d5a78', '#c4506d', '#9c8455']

export function Sparkline({
  values, width = 132, height = 34, color = '#2a3747', fill = true, className,
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
  fill?: boolean
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const pts = values.length ? values : [0, 0]
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const span = max - min || 1
  const x = (i: number) => (pts.length === 1 ? 0 : (i / (pts.length - 1)) * width)
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6)
  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#spark-${uid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {pts.length > 0 && <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="2.4" fill={color} />}
    </svg>
  )
}

export interface TrendPoint {
  label: string
  value: number
}

export function TrendArea({
  points, height = 190, color = '#2a3747', format = (n: number) => String(n), emptyLabel = 'No data for this period',
}: {
  points: TrendPoint[]
  height?: number
  color?: string
  format?: (n: number) => string
  emptyLabel?: string
}) {
  const uid = useId().replace(/:/g, '')
  const width = 720
  const padX = 6
  const padTop = 16
  const padBottom = 26
  const innerW = width - padX * 2
  const innerH = height - padTop - padBottom
  const values = points.map((p) => p.value)
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const x = (i: number) => padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v: number) => padTop + innerH - ((v - min) / span) * innerH
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')
  const area = points.length ? `${line} L${x(points.length - 1)},${height - padBottom} L${x(0)},${height - padBottom} Z` : ''
  const every = Math.max(1, Math.ceil(points.length / 8))

  if (!points.length) {
    return (
      <div className="flex h-[170px] items-center justify-center rounded-xl border border-dashed border-line text-[12px] text-faint">
        {emptyLabel}
      </div>
    )
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`trend-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={color} stopOpacity="0.2" />
          <stop offset="1" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={padX}
            x2={width - padX}
            y1={padTop + innerH * f}
            y2={padTop + innerH * f}
            stroke="currentColor"
            className="text-line"
            strokeWidth="1"
            strokeDasharray={f === 1 ? undefined : '3 5'}
          />
          <text
            x={width - padX}
            y={padTop + innerH * f - 4}
            textAnchor="end"
            className="fill-faint"
            fontSize="9.5"
          >
            {format(Math.round(max - (max - min) * f))}
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#trend-${uid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={`${p.label}-${i}`}>
          {i % every === 0 || i === points.length - 1 ? (
            <text x={x(i)} y={height - 7} textAnchor="middle" className="fill-faint" fontSize="9.5">
              {p.label}
            </text>
          ) : null}
          <circle cx={x(i)} cy={y(p.value)} r="2.2" fill="#fff" stroke={color} strokeWidth="1.5">
            <title>{`${p.label}: ${format(p.value)}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  )
}

export function BarList({
  items, format = (n: number) => String(n), color = '#2a3747', emptyLabel = 'Nothing recorded yet',
}: {
  items: { label: string; value: number; tone?: string }[]
  format?: (n: number) => string
  color?: string
  emptyLabel?: string
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  if (!items.length) return <div className="py-6 text-center text-[12px] text-faint">{emptyLabel}</div>
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-[12px] font-medium text-ink">{item.label}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted">{format(item.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: item.tone || CHART_COLORS[i % CHART_COLORS.length] || color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Donut({
  segments, size = 118, thickness = 13, centerLabel, centerValue,
}: {
  segments: { label: string; value: number; color: string }[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string | number
}) {
  const total = segments.reduce((a, s) => a + s.value, 0)
  const r = (size - thickness) / 2
  const circumference = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-elevated" strokeWidth={thickness} />
          {total > 0 && segments.map((s, i) => {
            const fraction = s.value / total
            const dash = fraction * circumference
            const el = (
              <circle
                key={`${s.label}-${i}`}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeLinecap="butt"
                strokeDasharray={`${Math.max(0, dash - 2)} ${circumference - dash + 2}`}
                strokeDashoffset={-offset}
              />
            )
            offset += dash
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[19px] font-semibold leading-none tabular-nums text-ink">{centerValue ?? total}</span>
          {centerLabel && <span className="mt-1 text-[9.5px] font-medium uppercase tracking-[0.07em] text-faint">{centerLabel}</span>}
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {segments.map((s, i) => (
          <div key={`${s.label}-${i}`} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{s.label}</span>
            <span className="text-[11px] font-medium tabular-nums text-ink">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MiniBars({ values, color = '#2a3747', height = 30 }: { values: number[]; color?: string; height?: number }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {values.map((v, i) => (
        <div
          key={i}
          className="min-w-[3px] flex-1 rounded-t-[2px]"
          style={{
            height: `${Math.max(8, (v / max) * 100)}%`,
            background: color,
            opacity: i === values.length - 1 ? 1 : 0.35 + (i / values.length) * 0.35,
          }}
        />
      ))}
    </div>
  )
}
