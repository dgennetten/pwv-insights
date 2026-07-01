// Pace / speed line chart shared by the in-app map modal (MapModal) and the
// saved report page (TrailLogMapPage), so the two stay in sync.

// Minimal structural shapes — both callers' richer tracker/timeline types
// satisfy these.
export interface PaceChartTracker {
  segments: Array<{ waypoints?: Array<{ name?: string; paceMinPerMi?: number; ts: number }> }>
}

// One dot rendered along the bottom axis per timeline observation.
export interface PaceChartDot { ts: number; color: string }

function fmtPace(minPerMi: number) {
  const m = Math.floor(minPerMi)
  const s = Math.round((minPerMi - m) * 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function PaceChart({ trackers, dots, paceFormat }: {
  trackers:   PaceChartTracker[]
  dots:       PaceChartDot[]
  paceFormat: 'min-per-mi' | 'mph'
}) {
  const rawPoints: { ts: number; pace: number }[] = []
  for (const t of trackers)
    for (const seg of t.segments)
      for (const wp of seg.waypoints ?? [])
        if (!wp.name && wp.paceMinPerMi != null)
          rawPoints.push({ ts: wp.ts, pace: wp.paceMinPerMi })
  rawPoints.sort((a, b) => a.ts - b.ts)
  if (rawPoints.length < 2) return null

  const W = 800; const H = 100
  const PL = 42; const PR = 10; const PT = 8; const PB = 24
  const plotW = W - PL - PR
  const plotH = H - PT - PB

  const allTs  = [...dots.map(d => d.ts), ...rawPoints.map(p => p.ts)]
  const tMin   = Math.min(...allTs); const tMax = Math.max(...allTs)
  const tRange = tMax - tMin || 1
  const xS = (ts: number) => PL + ((ts - tMin) / tRange) * plotW

  const isMph = paceFormat === 'mph'
  // For min/mi: slower (higher value) = top. For mph: faster (higher value) = top.
  // Both modes: higher y-value = top of chart.
  const plotValues = isMph ? rawPoints.map(p => 60 / p.pace) : rawPoints.map(p => p.pace)
  const vMin = Math.min(...plotValues); const vMax = Math.max(...plotValues)
  const pad  = (vMax - vMin) * 0.3 || 1
  const yMin = Math.max(0, vMin - pad); const yMax = vMax + pad
  const yRange = yMax - yMin
  const yS = (v: number) => PT + plotH * (1 - (v - yMin) / yRange)

  const axisY    = PT + plotH
  const linePath = rawPoints.map((d, i) => {
    const v = isMph ? 60 / d.pace : d.pace
    return `${i === 0 ? 'M' : 'L'}${xS(d.ts).toFixed(1)},${yS(v).toFixed(1)}`
  }).join(' ')
  const yTicks = [yMin, (yMin + yMax) / 2, yMax]
  const fmtTick = (v: number) => isMph ? v.toFixed(1) : fmtPace(v)

  return (
    <div className="shrink-0 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 px-2 pt-1.5 pb-0">
      <div className="flex items-center gap-3 px-2 mb-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
          {isMph
            ? <>Speed · mph <span className="font-normal normal-case">(faster ↑)</span></>
            : <>Pace · min/mi <span className="font-normal normal-case">(slower ↑)</span></>
          }
        </p>
        <div className="flex gap-2.5 ml-auto text-[10px] text-stone-400 dark:text-stone-500">
          <span><span style={{ color: '#0ea5e9' }}>●</span> Hiker</span>
          <span><span style={{ color: '#f59e0b' }}>●</span> Tree</span>
          <span><span style={{ color: '#ef4444' }}>●</span> Viol</span>
          <span><span style={{ color: '#a78bfa' }}>●</span> WP</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px`, display: 'block' }}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PL} y1={yS(v)} x2={W - PR} y2={yS(v)} stroke="#e7e5e4" strokeWidth={0.5} />
            <text x={PL - 4} y={yS(v) + 3.5} textAnchor="end" fontSize={8} fill="#a8a29e">{fmtTick(v)}</text>
          </g>
        ))}
        <line x1={PL} y1={axisY} x2={W - PR} y2={axisY} stroke="#d6d3d1" strokeWidth={0.75} />
        <path d={linePath} fill="none" stroke="#7c3aed" strokeWidth={1.5} strokeLinejoin="round" />
        {rawPoints.map((d, i) => {
          const v = isMph ? 60 / d.pace : d.pace
          return <circle key={i} cx={xS(d.ts)} cy={yS(v)} r={2.5} fill="#7c3aed" />
        })}
        {dots.map((d, i) => (
          <circle key={i} cx={xS(d.ts)} cy={axisY + 11} r={2.5} fill={d.color} opacity={0.85} />
        ))}
      </svg>
    </div>
  )
}
