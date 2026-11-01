'use client';

// The river strip on Find a Float results: when a search is for one river, the
// floats it found drawn on that river, each with a numbered callout matching
// its card. It answers what the cards cannot: where the floats sit relative to
// each other.
//
// Layout (callout lanes, label thinning, zoom) is shared/river-strip.ts; this
// file only draws it. The parent decides whether the strip exists and which
// routes it can place (riverStripPlaceable), and gives cards a number only for
// those, so a card never offers a float the strip cannot show.
//
// Pins and the route line use the planner map's colours
// (components/map/AccessPointMarkers.tsx, line-style.ts) so the strip and the
// map read as one product.

import { useCallback, useMemo, useState, type MouseEvent } from 'react';
import { ArrowRight, Flag, FlagOff } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Segmented from '@/components/ui/Segmented';
import { floatPlanPath, type FloatSearchOption } from '@shared/float-search';
import { riverStripLayout, type RiverStripPoint, type RiverStripView, type RouteState } from '@shared/river-strip';
import { routeAccessLabel, routeCautionsPresent, RouteCautions, RouteConditionBadge, routeTimeLabel } from './route-facts';

// AccessPointMarkers: river-forest put-in, sky-warm take-out, river-gravel stops.
const PUT_IN = '#478559';
const TAKE_OUT = '#f95d9b';
const GRAVEL = '#c7b8a6';
const ROUTE = 'var(--color-accent-500)';
const ROUTE_HOVER = 'var(--color-accent-700)';
const CASING = 'rgba(255, 255, 255, 0.9)';
const COMPACT_BELOW = 560;
/** Before the first measurement: the height of the usual one-lane strip. */
const PLACEHOLDER_HEIGHT = 168;

export interface NumberedRoute {
  option: FloatSearchOption;
  number: number;
}

/** The strip's element id; a card's "Show on river" scrolls here. */
export const RIVER_STRIP_ID = 'river-strip';

export default function RiverStrip({ riverSlug, riverName, points, routes, selectedId, hoveredId, onSelect, onHover, stale, onPlan }: {
  riverSlug: string;
  riverName: string;
  points: RiverStripPoint[];
  /** Placeable routes only, numbered in card order. */
  routes: NumberedRoute[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  /** Results are dimmed and inert; the plan link must not open. */
  stale: boolean;
  onPlan: () => boolean;
}) {
  const [width, setWidth] = useState(0);
  const [view, setView] = useState<RiverStripView>('all');
  // A callback ref follows the element if it is ever replaced; React 19 runs the returned cleanup.
  const measure = useCallback((node: HTMLDivElement) => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const compact = width > 0 && width < COMPACT_BELOW;
  const layout = useMemo(() => riverStripLayout({
    seedKey: riverSlug,
    points,
    routes: routes.map(({ option, number }) => ({ id: option.id, number, putInId: option.putIn.id, takeOutId: option.takeOut.id })),
    selectedId,
    hoveredId,
    view,
    width,
    compact,
  }), [riverSlug, points, routes, selectedId, hoveredId, view, width, compact]);

  const selected = routes.find(route => route.option.id === selectedId)?.option ?? null;
  const optionFor = (id: string) => routes.find(route => route.option.id === id)!.option;

  return (
    <Card id={RIVER_STRIP_ID} variant="framed" as="section" aria-labelledby="river-strip-title" className="mb-6 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 pt-3 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h3 id="river-strip-title" style={{ fontFamily: 'var(--font-display)' }} className="text-xl font-semibold">{riverName}</h3>
          <span className="text-sm text-[var(--color-text-secondary)]">{routes.length} {routes.length === 1 ? 'float' : 'floats'} on the river</span>
        </div>
        <Segmented aria-label="River view" value={layout?.view ?? view} onChange={setView}
          options={[
            { value: 'all', label: 'All floats' },
            { value: 'stretch', label: 'Your stretch', disabled: !selected, title: selected ? undefined : 'Choose a float first' },
          ]} />
      </div>

      <div className="px-3 pt-2 sm:px-5">
        {layout && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-secondary)]">
          <div className="flex min-w-[12rem] flex-1 items-center gap-2 sm:max-w-sm" aria-hidden="true">
            <span className="tabular-nums">mi {formatMile(layout.domain.start)}</span>
            <div className="relative h-1.5 flex-1 rounded-full bg-[var(--color-border)]">
              {layout.overview.routes.map(route => <span key={route.id} className="absolute inset-y-0 rounded-full"
                style={{ left: `${route.start * 100}%`, width: `${(route.end - route.start) * 100}%`, background: route.selected ? ROUTE : 'var(--color-accent-300)' }} />)}
              <span className="absolute -inset-y-1.5 rounded border-2 border-[var(--color-primary-500)]"
                style={{ left: `${layout.overview.window.start * 100}%`, width: `${(layout.overview.window.end - layout.overview.window.start) * 100}%` }} />
            </div>
            <span className="tabular-nums">{formatMile(layout.domain.end)}</span>
          </div>
          <span className="ml-auto inline-flex items-center gap-1">River miles to scale. Bends illustrative.
            <span className="ml-2 inline-flex items-center gap-1 font-semibold">Downstream<ArrowRight size={14} aria-hidden="true" /></span>
          </span>
        </div>}

        <div ref={measure} className="relative" style={{ height: layout?.height ?? PLACEHOLDER_HEIGHT }} aria-busy={!layout || undefined}>
          {layout && <>
            <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} className="absolute inset-0 overflow-hidden" role="img"
              aria-label={`Schematic of the ${riverName} with ${routes.length} floats from your search${selected ? `; selected: ${selected.putIn.name} to ${selected.takeOut.name}` : ''}.`}>
              <path d={layout.river} fill="none" stroke="var(--river-strip-bank)" strokeWidth={compact ? 34 : 40} strokeLinecap="round" strokeLinejoin="round" />
              <path d={layout.river} fill="none" stroke="var(--river-strip-sand)" strokeWidth={compact ? 29 : 34} strokeLinecap="round" strokeLinejoin="round" />
              <path d={layout.river} fill="none" stroke="var(--river-strip-water)" strokeWidth={compact ? 18 : 21} strokeLinecap="round" strokeLinejoin="round" />
              <path d={layout.river} className="river-strip-flow" fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="6 14" strokeLinecap="round" />
              {layout.callouts.map(c => <line key={c.id} x1={c.from.x} y1={c.from.y} x2={c.anchor.x} y2={c.anchor.y}
                stroke={c.state === 'other' ? 'var(--color-neutral-500)' : c.state === 'selected' ? ROUTE : ROUTE_HOVER}
                strokeWidth={c.state === 'other' ? 1.25 : 2} strokeDasharray={c.state === 'other' ? '3 3' : undefined} />)}
              {layout.routes.map(route => route.state === 'other'
                ? <path key={route.id} d={route.path} fill="none" stroke={ROUTE} strokeOpacity={0.55} strokeWidth={compact ? 4 : 5} strokeLinecap="round" strokeLinejoin="round" />
                : <g key={route.id}>
                  <path d={route.path} fill="none" stroke={CASING} strokeWidth={route.state === 'selected' ? 13 : 11} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={route.path} fill="none" stroke={route.state === 'selected' ? ROUTE : ROUTE_HOVER} strokeWidth={route.state === 'selected' ? 7 : 6} strokeLinecap="round" strokeLinejoin="round" />
                </g>)}
            </svg>

            {layout.dots.map(dot => <span key={dot.id} title={`${dot.name} · mile ${formatMile(dot.mile)}`}
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{ left: dot.x, top: dot.y, background: dot.endpoint ? GRAVEL : 'var(--color-surface)', borderColor: dot.endpoint ? '#ffffff' : GRAVEL, boxShadow: '1px 1px 0 var(--color-neutral-700)' }} />)}

            {layout.labels.map(label => <span key={label.id} aria-hidden="true"
              className={`river-strip-label pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap ${compact ? 'text-xs' : 'text-[13px]'} ${label.emphasis === 'selected' ? 'font-bold' : label.emphasis === 'route' ? 'font-semibold' : 'font-medium text-[var(--color-text-secondary)]'}`}
              style={{ left: label.x, top: label.y }}>{label.name}</span>)}

            {layout.flags && <>
              <EndpointPin x={layout.flags.putIn.x} y={layout.flags.putIn.y} color={PUT_IN} kind="put" />
              <EndpointPin x={layout.flags.takeOut.x} y={layout.flags.takeOut.y} color={TAKE_OUT} kind="take" />
            </>}

            {layout.callouts.map(c => {
              const option = optionFor(c.id);
              return <button key={c.id} type="button" aria-pressed={c.state === 'selected'}
                aria-label={`Float ${c.number}: ${option.putIn.name} to ${option.takeOut.name}`}
                onClick={() => onSelect(c.id)} onMouseEnter={() => onHover(c.id)} onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(c.id)} onBlur={() => onHover(null)}
                className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]"
                style={{ left: c.x, top: c.y }}>
                <NumberChip number={c.number} state={c.state} size={c.state === 'other' ? 26 : 30} />
              </button>;
            })}
          </>}
        </div>

        {layout && <div className="relative mb-2 h-4 text-xs tabular-nums text-[var(--color-text-secondary)]" aria-hidden="true">
          {layout.ticks.map(tick => <span key={tick.mile} className="absolute -top-1 -translate-x-1/2 whitespace-nowrap" style={{ left: tick.x }}>mi {formatMile(tick.mile)}</span>)}
        </div>}
      </div>

      <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-3 sm:px-5">
        {selected ? <>
          <div className="min-w-0 space-y-2">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <NumberChip number={routes.find(route => route.option === selected)!.number} state="selected" size={24} />
              <span>{selected.putIn.name}</span>
              <span aria-label="to" className="text-[var(--color-text-muted)]">→</span>
              <span>{selected.takeOut.name}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <RouteConditionBadge option={selected} />
              <span className="rounded-full bg-[var(--color-surface)] px-3 py-1 text-[var(--color-text-secondary)]">{routeAccessLabel(selected)}</span>
              <span className="text-[var(--color-text-secondary)]">
                {selected.distanceMiles.toFixed(1)} mi · {routeTimeLabel(selected)}{selected.estimateBasis === 'typical' ? ' · Typical estimate' : ''}
              </span>
            </div>
            {routeCautionsPresent(selected) && <div className="space-y-1"><RouteCautions option={selected} /></div>}
          </div>
          <Button href={floatPlanPath(selected)} tabIndex={stale ? -1 : undefined}
            aria-label={`Plan this float from ${selected.putIn.name} to ${selected.takeOut.name}`}
            onClick={(event: MouseEvent<HTMLAnchorElement>) => { if (stale || !onPlan()) event.preventDefault(); }}>
            Plan this float<ArrowRight size={18} aria-hidden="true" />
          </Button>
        </> : <p className="text-sm">Choose a number to compare a float.</p>}
      </div>
    </Card>
  );
}

function formatMile(mile: number) {
  return Number.isInteger(mile) ? String(mile) : mile.toFixed(1);
}

function EndpointPin({ x, y, color, kind }: { x: number; y: number; color: string; kind: 'put' | 'take' }) {
  return <span aria-hidden="true" className="pointer-events-none absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white"
    style={{ left: x, top: y, background: color, boxShadow: '2px 2px 0 var(--color-neutral-700)' }}>
    {kind === 'put' ? <Flag size={16} color="#ffffff" strokeWidth={2.5} /> : <FlagOff size={16} color="#ffffff" strokeWidth={2.5} />}
  </span>;
}

/** A route's number, as on the strip and on its card. */
export function NumberChip({ number, state, size = 26 }: { number: number; state: RouteState; size?: number }) {
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
