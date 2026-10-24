'use client';

import type { ComparisonProvider } from '@/types/api';

export interface ComparisonChartPoint { date: string; value: number | null; compositionChanged?: boolean; }
export interface ComparisonChartSeries { provider: ComparisonProvider; points: ComparisonChartPoint[]; }

const COLORS: Record<ComparisonProvider, string> = { tcgdex: 'var(--brand)', tcgcsv: 'var(--info)' };
const LABELS: Record<ComparisonProvider, string> = { tcgdex: 'TCGdex', tcgcsv: 'TCGCSV' };
const WIDTH = 360, HEIGHT = 172, LEFT = 66, RIGHT = 12, TOP = 12, BOTTOM = 30;
const day = (date: string) => Date.parse(`${date}T00:00:00Z`);
const usd = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(value);

/** SVG liviano: la escala X usa días UTC y los cortes nunca interpolan huecos. */
export function ComparisonChart({ series, label = 'Comparación diaria de precios en USD' }: { series: ComparisonChartSeries[]; label?: string }) {
  const dates = series.flatMap((s) => s.points.map((p) => day(p.date)).filter(Number.isFinite));
  const values = series.flatMap((s) => s.points.flatMap((p) => p.value !== null && Number.isFinite(p.value) ? [p.value] : []));
  if (dates.length === 0 || values.length === 0) return <p className="rounded-control bg-surface-2 p-4 text-body text-secondary">Todavía no hay observaciones para graficar.</p>;
  const minX = Math.min(...dates), maxX = Math.max(...dates);
  const lowest = Math.min(...values), highest = Math.max(...values);
  const padding = Math.max((highest - lowest) * 0.15, highest * 0.02, 0.01);
  const minY = Math.max(0, lowest - padding), maxY = highest + padding;
  const hasGaps = series.some((s) => {
    const ordered = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
    return ordered.some((point, index) => point.value === null || (index > 0 && day(point.date) - day(ordered[index - 1]!.date) > 86_400_000));
  });
  const ticks = maxX === minX ? [minX] : [minX, ...(maxX - minX >= 4 * 86_400_000 ? [minX + Math.floor((maxX - minX) / 86_400_000 / 2) * 86_400_000] : []), maxX];
  const dateLabel = (time: number) => new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(time);
  const x = (t: number) => LEFT + (maxX === minX ? (WIDTH - LEFT - RIGHT) / 2 : (t - minX) / (maxX - minX) * (WIDTH - LEFT - RIGHT));
  const y = (n: number) => TOP + (maxY === minY ? (HEIGHT - TOP - BOTTOM) / 2 : (maxY - n) / (maxY - minY) * (HEIGHT - TOP - BOTTOM));
  return <figure aria-label={label} className="min-w-0">
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${label}. Rango de ${usd(minY)} a ${usd(maxY)}, entre ${new Date(minX).toISOString().slice(0, 10)} y ${new Date(maxX).toISOString().slice(0, 10)}.`} className="h-40 w-full overflow-visible">
      {[maxY, (minY + maxY) / 2, minY].map((value, index) => <g key={`axis-${index}`} aria-hidden="true">
        <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(value)} y2={y(value)} stroke="var(--border-default)" strokeDasharray="3 4" />
        <text x={LEFT - 8} y={y(value)} dominantBaseline="middle" textAnchor="end" fill="var(--text-tertiary)" fontSize="10">{usd(value)}</text>
      </g>)}
      {ticks.map((time) => <text key={time} x={x(time)} y={HEIGHT - 6} textAnchor="middle" fill="var(--text-tertiary)" fontSize="10">{dateLabel(time)}</text>)}
      {series.map((s) => {
        const ordered = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
        const runs: ComparisonChartPoint[][] = [];
        for (const point of ordered) {
          const current = runs.at(-1);
          const previous = current?.at(-1);
          if (point.value === null || !Number.isFinite(point.value)) { if (current) runs.push([]); continue; }
          if (previous && day(point.date) - day(previous.date) !== 86_400_000) runs.push([]);
          if (!runs.at(-1)) runs.push([]);
          runs.at(-1)?.push(point);
        }
        return <g key={s.provider} fill="none" stroke={COLORS[s.provider]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {runs.filter((run) => run.length > 1).map((run, index) => <polyline key={`${s.provider}-${index}`} points={run.map((p) => `${x(day(p.date))},${y(p.value as number)}`).join(' ')} strokeDasharray={s.provider === 'tcgcsv' ? '6 4' : undefined} />)}
          {ordered.filter((point) => point.value !== null && Number.isFinite(point.value)).map((point) => <circle key={`${s.provider}-point-${point.date}`} cx={x(day(point.date))} cy={y(point.value as number)} r="3.5" fill={COLORS[s.provider]} stroke="var(--surface)"><title>{LABELS[s.provider]} · {dateLabel(day(point.date))} · {usd(point.value as number)}</title></circle>)}
          {s.points.filter((point) => point.compositionChanged && point.value !== null).map((point) => <rect key={`${s.provider}-composition-${point.date}`} x={x(day(point.date)) - 4} y={y(point.value as number) - 4} width="8" height="8" fill="var(--surface)" stroke={COLORS[s.provider]} strokeWidth="2" />)}
        </g>;
      })}
    </svg>
    <div className="flex justify-between gap-3 text-caption text-tertiary"><span>{usd(minY)} – {usd(maxY)}</span><span>{new Date(minX).toISOString().slice(0, 10)} – {new Date(maxX).toISOString().slice(0, 10)}</span></div>
    <p className="mt-2 text-caption text-tertiary">Cada punto es una observación diaria. Escala ajustada al rango de precios observado.{hasGaps ? ' Los días sin datos quedan separados; no conocemos cómo cambió el precio entre esas fechas.' : ''}{values.length < 3 ? ' Todavía hay pocas observaciones para mostrar subidas y bajadas.' : ''}</p>
    <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-caption text-secondary">
      {series.map((s) => <span key={s.provider} className="inline-flex min-h-11 items-center gap-2"><span aria-hidden="true" className="w-6 border-t-2" style={{ borderColor: COLORS[s.provider], borderTopStyle: s.provider === 'tcgcsv' ? 'dashed' : 'solid' }} />{LABELS[s.provider]} · {s.points.filter((point) => point.value !== null && Number.isFinite(point.value)).length || 'sin'} observaciones</span>)}
      {series.some((s) => s.points.some((point) => point.compositionChanged)) ? <span className="inline-flex min-h-11 items-center gap-2"><span aria-hidden="true" className="size-2 border-2 border-line-strong bg-surface" />Cambió la composición</span> : null}
    </figcaption>
  </figure>;
}
