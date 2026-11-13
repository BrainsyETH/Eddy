'use client';

// Seven days of lake level as one thin line, with the conservation pool as a
// dashed reference when it is near the week's range. Single series: no legend,
// the title names it. Hover and keyboard scrub read out one reading at a time.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { lakeChartModel, nearestPoint, type LakeChartPoint } from '@/lib/lakes/chart';

const PAD = { top: 10, right: 12, bottom: 24, left: 44 };
const DEFAULT_W = 640;

/** The container's width in CSS pixels, so the viewBox matches it and text keeps its size on a phone. */
function useMeasuredWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(DEFAULT_W);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // The inset photo layout leaves less than 240px on a 320px phone. Match
    // the actual plot width so its labels and keyboard/touch coordinates agree.
    const apply = () => setWidth(Math.max(160, Math.round(el.getBoundingClientRect().width)));
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function dayLabel(t: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date(t));
}

function readingLabel(p: LakeChartPoint, timeZone: string): string {
  const when = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(p.t));
  return `${p.ft.toFixed(2)} ft · ${when}`;
}

export default function LakeLevelChart({
  history, conservationFt, now, timeZone, datum, compact = false,
}: {
  history: Array<[string, number]>;
  conservationFt?: number;
  now: number;
  timeZone: string;
  datum: string;
  compact?: boolean;
}) {
  const H = compact ? 112 : 180;
  const model = useMemo(() => lakeChartModel(history, { conservationFt, now }), [history, conservationFt, now]);
  const [hoverAt, setHoverAt] = useState<number | null>(null);
  const titleId = useId();
  const fillId = useId();
  const [frame, W] = useMeasuredWidth<HTMLElement>();
  if (!model) return null;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - model.t0) / (model.t1 - model.t0)) * plotW;
  const y = (ft: number) => PAD.top + (1 - (ft - model.minFt) / (model.maxFt - model.minFt)) * plotH;
  const path = model.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p.ft).toFixed(1)}`).join(' ');
  const active = (hoverAt === null ? null : nearestPoint(model.points, hoverAt)) ?? model.points[model.points.length - 1];

  const scrub = (clientX: number, rect: DOMRect) => {
    const frac = Math.max(0, Math.min(1, ((clientX - rect.left) / rect.width * W - PAD.left) / plotW));
    const t = model.t0 + frac * (model.t1 - model.t0);
    setHoverAt(nearestPoint(model.points, t)?.t ?? null);
  };

  return (
    <figure className="mt-4" aria-labelledby={titleId} ref={frame}>
      <figcaption id={titleId} className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-neutral-500">
        <span>Last 7 days, ft {datum}</span>
        <span className="font-mono text-neutral-700" aria-live="polite">{readingLabel(active, timeZone)}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="mt-1 block max-w-full touch-pan-y select-none"
        role="img"
        aria-label={`Lake level over the last seven days, from ${model.minFt.toFixed(1)} to ${model.maxFt.toFixed(1)} feet. Use left and right arrow keys to inspect readings.`}
        tabIndex={0}
        onMouseMove={(e) => scrub(e.clientX, e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setHoverAt(null)}
        onTouchStart={(e) => scrub(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
        onTouchMove={(e) => scrub(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
        onTouchEnd={() => setHoverAt(null)}
        onKeyDown={(e) => {
          const index = model.points.findIndex((p) => p === active);
          if (e.key === 'ArrowLeft' && index > 0) { setHoverAt(model.points[index - 1].t); e.preventDefault(); }
          if (e.key === 'ArrowRight' && index < model.points.length - 1) { setHoverAt(model.points[index + 1].t); e.preventDefault(); }
        }}
      >
        <defs><linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-primary-400)" stopOpacity=".24" /><stop offset="100%" stopColor="var(--color-primary-400)" stopOpacity=".02" /></linearGradient></defs>
        <path d={`${path} L${x(model.points[model.points.length - 1].t)} ${H - PAD.bottom} L${x(model.points[0].t)} ${H - PAD.bottom} Z`} fill={`url(#${fillId})`} aria-hidden="true" />
        {model.valueTicks.map((tick) => (
          <g key={tick.value}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick.value)} y2={y(tick.value)} className="stroke-neutral-200" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(tick.value)} textAnchor="end" dominantBaseline="middle" className="fill-neutral-500" fontSize={11} fontFamily="var(--font-mono, ui-monospace, monospace)">
              {tick.value.toFixed(1)}
            </text>
          </g>
        ))}
        {model.timeTicks.map((tick) => (
          <text key={tick.value} x={x(tick.value)} y={H - 6} textAnchor={tick.position === 0 ? 'start' : tick.position === 1 ? 'end' : 'middle'} className="fill-neutral-500" fontSize={11}>
            {dayLabel(tick.value, timeZone)}
          </text>
        ))}
        {model.referencePosition !== null && conservationFt !== undefined && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(conservationFt)} y2={y(conservationFt)} className="stroke-neutral-400" strokeWidth={1} strokeDasharray="4 4" />
            <text x={W - PAD.right} y={y(conservationFt) - 4} textAnchor="end" className="fill-neutral-500" fontSize={10}>
              conservation pool {conservationFt.toFixed(0)} ft
            </text>
          </g>
        )}
        <path d={path} fill="none" className="stroke-primary-600" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={x(active.t)} x2={x(active.t)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-neutral-300" strokeWidth={1} />
        <circle cx={x(active.t)} cy={y(active.ft)} r={4} className="fill-primary-600 stroke-white" strokeWidth={2} />
      </svg>
      {model.referenceNote && <p className="mt-1 text-xs text-neutral-500">{model.referenceNote}.</p>}
    </figure>
  );
}
