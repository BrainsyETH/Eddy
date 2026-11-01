'use client';

// The river strip on Find a Float results: when a search is for one river, the
// whole river drawn as a ribbon with every float the search found marked on it.
// Each float carries the number shown on its card, so the strip answers what
// the cards cannot: where these floats sit on the river relative to each other.
//
// Layout (positions, label thinning, zoom) is shared/river-strip.ts; this file
// only draws it. Pins and the route line use the planner map's colours
// (components/map/AccessPointMarkers.tsx, line-style.ts) so the strip and the
// map read as one product.

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowRight, Flag, FlagOff, RotateCcw } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Segmented from '@/components/ui/Segmented';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import { floatPlanPath, floatRangeLabel, type FloatSearchOption } from '@shared/float-search';
import { riverStripLayout, type RiverStripView, type StripRoute } from '@shared/river-strip';

// AccessPointMarkers: river-forest put-in, sky-warm take-out, river-gravel stops.
const PUT_IN = '#478559';
const TAKE_OUT = '#f95d9b';
const GRAVEL = '#c7b8a6';
const ROUTE = 'var(--color-accent-500)';
const CASING = 'rgba(255, 255, 255, 0.9)';
const COMPACT_BELOW = 560;

export interface NumberedRoute {
  option: FloatSearchOption;
  number: number;
}

/** The strip's element id; a card's "Show on the river" scrolls here. */
export const RIVER_STRIP_ID = 'river-strip';

export default function RiverStrip({ riverSlug, riverName, routes, selectedId, hoveredId, onSelect, onHover, stale, onPlan }: {
  riverSlug: string;
  riverName: string;
  routes: NumberedRoute[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  /** Results are dimmed and inert; the plan link must not open. */
  stale: boolean;
  onPlan: () => boolean;
}) {
  const { data: accessPoints, isError } = useAccessPoints(riverSlug);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [chosenView, setChosenView] = useState<RiverStripView | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const compact = width > 0 && width < COMPACT_BELOW;
  const height = compact ? 190 : 230;
  // A phone opens zoomed on the chosen float; a hundred miles at that width is only dots.
  const view = chosenView ?? (compact ? 'stretch' : 'whole');
  const points = useMemo(() => (accessPoints ?? []).map(point => ({
    id: point.id, name: point.name, mile: point.riverMile, endpoint: point.isFloatEndpoint !== false,
  })), [accessPoints]);
  const layout = useMemo(() => riverStripLayout({
    seedKey: riverSlug,
    points,
    routes: routes.map(({ option, number }) => ({ id: option.id, number, putInId: option.putIn.id, takeOutId: option.takeOut.id })),
    selectedId,
    hoveredId,
    view,
    width,
    height,
    compact,
  }), [riverSlug, points, routes, selectedId, hoveredId, view, width, height, compact]);

  if (isError || (accessPoints && width > 0 && (!layout || layout.routes.length === 0))) return null;

  const selected = routes.find(route => route.option.id === selectedId)?.option ?? null;
  const placed = layout?.routes ?? [];
  const drawOrder = [...placed].sort((a, b) => rank(a) - rank(b));
  const flagged = placed.find(route => route.state === 'selected');

  return (
    <Card id={RIVER_STRIP_ID} variant="framed" as="section" aria-labelledby="river-strip-title" className="mb-6 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 pb-1 pt-4 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 id="river-strip-title" style={{ fontFamily: 'var(--font-display)' }} className="text-2xl font-semibold">{riverName}</h3>
          {accessPoints && <span className="text-sm text-[var(--color-text-secondary)]">
            {points.length} access points · {placed.length} {placed.length === 1 ? 'float' : 'floats'} found
          </span>}
        </div>
        <Segmented aria-label="River view" size="md" value={layout?.view ?? view} onChange={setChosenView}
          options={[
            { value: 'whole', label: 'Whole river' },
            { value: 'stretch', label: 'Your stretch', disabled: !selected, title: selected ? undefined : 'Choose a float first' },
          ]} />
      </div>

      <div className="px-3 pt-2 sm:px-5">
        {layout && <div className="mb-1 flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md" aria-hidden="true">
            <span className="tabular-nums">mi {formatMile(layout.domain.start)}</span>
            <div className="relative h-1.5 flex-1 rounded-full bg-[var(--color-border)]">
              {layout.overview.routes.map(route => <span key={route.id} className="absolute inset-y-0 rounded-full"
                style={{ left: `${route.start * 100}%`, width: `${(route.end - route.start) * 100}%`, background: route.selected ? ROUTE : 'var(--color-accent-300)' }} />)}
              {layout.overview.window && <span className="absolute -inset-y-1.5 rounded border-2 border-[var(--color-primary-500)]"
                style={{ left: `${layout.overview.window.start * 100}%`, width: `${(layout.overview.window.end - layout.overview.window.start) * 100}%` }} />}
            </div>
            <span className="tabular-nums">{formatMile(layout.domain.end)}</span>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 font-semibold">Downstream<ArrowRight size={14} aria-hidden="true" /></span>
        </div>}

        <div ref={box} className="relative" style={{ height }} aria-busy={!layout || undefined}>
          {layout && <>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 overflow-hidden" role="img"
              aria-label={`Schematic of the ${riverName} with ${placed.length} floats from your search${selected ? `; showing ${selected.putIn.name} to ${selected.takeOut.name}` : ''}.`}>
              <path d={layout.river} fill="none" stroke="var(--river-strip-bank)" strokeWidth={compact ? 34 : 42} strokeLinecap="round" strokeLinejoin="round" />
              <path d={layout.river} fill="none" stroke="var(--river-strip-sand)" strokeWidth={compact ? 29 : 36} strokeLinecap="round" strokeLinejoin="round" />
              <path d={layout.river} fill="none" stroke="var(--river-strip-water)" strokeWidth={compact ? 18 : 22} strokeLinecap="round" strokeLinejoin="round" />
              <path d={layout.river} className="river-strip-flow" fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="6 14" strokeLinecap="round" />
              {drawOrder.map(route => route.state === 'other'
                ? <path key={route.id} d={route.path} fill="none" stroke={ROUTE} strokeOpacity={0.55} strokeWidth={compact ? 4 : 5} strokeLinecap="round" strokeLinejoin="round" />
                : <g key={route.id}>
                  <path d={route.path} fill="none" stroke={CASING} strokeWidth={route.state === 'selected' ? 13 : 11} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={route.path} fill="none" stroke={ROUTE} strokeWidth={route.state === 'selected' ? 7 : 6} strokeLinecap="round" strokeLinejoin="round" />
                </g>)}
            </svg>

            {layout.dots.map(dot => <span key={dot.id} title={`${dot.name} · mile ${formatMile(dot.mile)}`}
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{ left: dot.x, top: dot.y, background: dot.endpoint ? GRAVEL : 'var(--color-surface)', borderColor: dot.endpoint ? '#ffffff' : GRAVEL, boxShadow: '1px 1px 0 var(--color-neutral-700)' }} />)}

            {layout.labels.map(label => <span key={label.id} aria-hidden="true"
              className={`river-strip-label pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap ${compact ? 'text-xs' : 'text-[13px]'} ${label.emphasis === 'selected' ? 'font-bold' : label.emphasis === 'route' ? 'font-semibold' : 'font-medium text-[var(--color-text-secondary)]'}`}
              style={{ left: label.x, top: label.y }}>{label.name}</span>)}

            {flagged && <>
              <EndpointPin x={flagged.putIn.x} y={flagged.putIn.y} color={PUT_IN} kind="put" />
              <EndpointPin x={flagged.takeOut.x} y={flagged.takeOut.y} color={TAKE_OUT} kind="take" />
            </>}

            {placed.filter(route => route.chip).map(route => {
              const option = routes.find(r => r.option.id === route.id)!.option;
              const on = route.state === 'selected';
              return <button key={route.id} type="button" aria-pressed={on}
                aria-label={`Float ${route.number}: ${option.putIn.name} to ${option.takeOut.name}`}
                onClick={() => onSelect(route.id)} onMouseEnter={() => onHover(route.id)} onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(route.id)} onBlur={() => onHover(null)}
                className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]"
                style={{ left: route.chip!.x, top: route.chip!.y }}>
                <NumberChip number={route.number} state={route.state} size={on ? 30 : route.state === 'hovered' ? 28 : compact ? 24 : 26} />
              </button>;
            })}
          </>}
        </div>

        {layout && <div className="relative h-5 text-xs tabular-nums text-[var(--color-text-secondary)]" aria-hidden="true">
          {layout.ticks.map(tick => <span key={tick.mile} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: tick.x }}>mi {formatMile(tick.mile)}</span>)}
        </div>}
        <p className="mb-3 mt-1 text-xs text-[var(--color-text-secondary)]">Numbers match the floats below. River miles are to scale; the bends are illustrative.</p>
      </div>

      <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-3 sm:px-5">
        {selected ? <>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <Pin color={PUT_IN} size={24}><Flag size={13} color="#ffffff" strokeWidth={2.5} aria-hidden="true" /></Pin>
              <span>{selected.putIn.name}</span>
              <span aria-label="to" className="text-[var(--color-text-muted)]">→</span>
              <Pin color={TAKE_OUT} size={24}><FlagOff size={13} color="#ffffff" strokeWidth={2.5} aria-hidden="true" /></Pin>
              <span>{selected.takeOut.name}</span>
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {selected.distanceMiles.toFixed(1)} mi downstream · {floatRangeLabel(selected.timeRange).replace(' hours', ' hr')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onSelect(null)}><RotateCcw size={16} aria-hidden="true" />Clear</Button>
            <Button href={floatPlanPath(selected)} tabIndex={stale ? -1 : undefined}
              aria-label={`Plan this float from ${selected.putIn.name} to ${selected.takeOut.name}`}
              onClick={(event: MouseEvent<HTMLAnchorElement>) => { if (stale || !onPlan()) event.preventDefault(); }}>
              Plan this float<ArrowRight size={18} aria-hidden="true" />
            </Button>
          </div>
        </> : <p className="text-sm">Tap a number, or a float below, to see it on the river.</p>}
      </div>
    </Card>
  );
}

function rank(route: StripRoute) {
  return route.state === 'other' ? 0 : route.state === 'hovered' ? 1 : 2;
}

function formatMile(mile: number) {
  return Number.isInteger(mile) ? String(mile) : mile.toFixed(1);
}

function Pin({ color, size, children }: { color: string; size: number; children: ReactNode }) {
  return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: color }}>{children}</span>;
}

function EndpointPin({ x, y, color, kind }: { x: number; y: number; color: string; kind: 'put' | 'take' }) {
  return <span aria-hidden="true" className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white"
    style={{ left: x, top: y, background: color, boxShadow: '2px 2px 0 var(--color-neutral-700)' }}>
    {kind === 'put' ? <Flag size={16} color="#ffffff" strokeWidth={2.5} /> : <FlagOff size={16} color="#ffffff" strokeWidth={2.5} />}
  </span>;
}

/** The route's number, as on the strip and on its card. */
export function NumberChip({ number, state, size = 28 }: { number: number; state: 'selected' | 'hovered' | 'other'; size?: number }) {
  const on = state === 'selected';
  return <span aria-hidden="true" className="flex shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-bold tabular-nums"
    style={{
      width: size, height: size,
      background: on ? 'var(--color-accent-700)' : state === 'hovered' ? 'var(--color-accent-100)' : 'var(--color-surface)',
      color: on ? '#ffffff' : state === 'hovered' ? 'var(--color-accent-900)' : 'var(--color-text-primary)',
      borderColor: on ? '#ffffff' : 'var(--color-accent-500)',
      boxShadow: '2px 2px 0 var(--color-neutral-700)',
    }}>{number}</span>;
}
