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

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Flag, FlagOff } from 'lucide-react';
import Card from '@/components/ui/Card';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';
import type { AccessPoint, AccessPointType } from '@/types/api';
import InfoTip from '@/components/ui/InfoTip';
import Segmented from '@/components/ui/Segmented';
import type { FloatSearchOption } from '@shared/float-search';
import { CALLOUT_SIZE, RIVER_STRIP_INFO, riverStripLayout, type RiverStripPoint, type RiverStripView, type RouteState } from '@shared/river-strip';
import { INFO_COLORS, routeCautionsPresent, RouteConditionBadge, routeTimeLabel } from './route-facts';

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

export default function RiverStrip({ riverSlug, riverName, points, pointInfo, routes, selectedId, hoveredId, onSelect, onHover, onView }: {
  riverSlug: string;
  riverName: string;
  points: RiverStripPoint[];
  /** Full records behind the dots, for the hover card. A dot without one still shows its name and mile. */
  pointInfo?: Map<string, AccessPoint>;
  /** Placeable routes only, numbered in card order. */
  routes: NumberedRoute[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  /** Reveal the selected card without changing result order. */
  onView: (id: string) => void;
}) {
  const [width, measure] = useStripMeasure();
  const [view, setView] = useState<RiverStripView>('all');

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
  const hasCautions = selected ? routeCautionsPresent(selected) : false;
  const optionFor = (id: string) => routes.find(route => route.option.id === id)!.option;
  const [activeDot, showDot, hideDot] = useDotCard();
  const dot = layout?.dots.find(d => d.id === activeDot) ?? null;

  return (
    <Card id={RIVER_STRIP_ID} variant="framed" as="section" aria-labelledby="river-strip-title" className="mb-6 scroll-mt-24"
      // A point's hover card may extend past the strip's edge rather than be cut off.
      style={{ overflow: 'visible' }}>
      <StripHeader riverName={riverName} view={layout?.view ?? view} onView={setView} hasSelection={Boolean(selected)} />

      <div className="px-3 pt-2 sm:px-5">
        {layout?.view === 'stretch' && <div data-river-overview className="mb-2 flex items-center text-xs text-[var(--color-text-secondary)]">
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
                ? <path key={route.id} data-route-state="other" d={route.path} fill="none" stroke={ROUTE} strokeOpacity={selected ? 0.18 : 0.35} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                : <g key={route.id} data-route-state={route.state}>
                  <path d={route.path} fill="none" stroke={CASING} strokeWidth={route.state === 'selected' ? 13 : 11} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={route.path} fill="none" stroke={route.state === 'selected' ? ROUTE : ROUTE_HOVER} strokeWidth={route.state === 'selected' ? 7 : 6} strokeLinecap="round" strokeLinejoin="round" />
                </g>)}
              {/* A short float's flags are drawn apart; each stays tied to its true point. */}
              {layout.flags?.offset && ([[layout.flags.putIn, PUT_IN], [layout.flags.takeOut, TAKE_OUT]] as const).map(([flag, color]) => <g key={color}>
                <line x1={flag.x} y1={flag.y} x2={flag.at.x} y2={flag.at.y} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
                <circle cx={flag.at.x} cy={flag.at.y} r={4.5} fill={color} stroke="#ffffff" strokeWidth={2} />
              </g>)}
            </svg>

            {layout.dots.map(d => {
              const active = d.id === activeDot;
              return <button key={d.id} type="button" data-strip-point={d.id}
                aria-label={`${d.name}, mile ${formatMile(d.mile)}`} aria-expanded={active}
                aria-describedby={active ? STRIP_POINT_CARD_ID : undefined}
                onPointerEnter={e => { if (e.pointerType === 'mouse') showDot(d.id); }} onPointerLeave={e => { if (e.pointerType === 'mouse') hideDot(); }}
                onFocus={() => showDot(d.id)} onClick={() => showDot(d.id)}
                // Focus moving into the card (its link) keeps it open.
                onBlur={e => { if (!document.getElementById(STRIP_POINT_CARD_ID)?.contains(e.relatedTarget)) hideDot(); }}
                onKeyDown={e => { if (e.key === 'Escape') hideDot(true); }}
                className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text-link)]"
                style={{ left: d.x, top: d.y }}>
                <span aria-hidden="true" className="h-3 w-3 rounded-full border-2 transition-transform motion-reduce:transition-none"
                  style={{ background: d.endpoint ? GRAVEL : 'var(--color-surface)', borderColor: d.endpoint ? '#ffffff' : GRAVEL, boxShadow: '1px 1px 0 var(--color-neutral-700)', transform: active ? 'scale(1.5)' : undefined }} />
              </button>;
            })}

            {layout.labels.map(label => <span key={label.id} aria-hidden="true"
              className={`river-strip-label pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap ${compact ? 'text-xs' : 'text-[13px]'} ${label.emphasis === 'selected' ? 'font-bold' : label.emphasis === 'route' ? 'font-semibold' : 'font-medium text-[var(--color-text-secondary)]'}`}
              style={{ left: label.x, top: label.y }}>{label.name}</span>)}

            {layout.flags && <>
              <EndpointPin x={layout.flags.putIn.x} y={layout.flags.putIn.y} color={PUT_IN} kind="put" />
              <EndpointPin x={layout.flags.takeOut.x} y={layout.flags.takeOut.y} color={TAKE_OUT} kind="take" />
            </>}

            {layout.callouts.map(c => {
              const option = optionFor(c.id);
              return <button key={c.id} type="button" data-route-id={c.id} aria-pressed={c.state === 'selected'}
                aria-label={`Float ${c.number}: ${option.putIn.name} to ${option.takeOut.name}`}
                onClick={() => onSelect(c.id)} onMouseEnter={() => onHover(c.id)} onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(c.id)} onBlur={() => onHover(null)}
                className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text-link)]"
                style={{ left: c.x, top: c.y }}>
                <NumberChip number={c.number} state={c.state} size={c.state === 'other' ? 26 : 30} />
              </button>;
            })}

            {dot && <StripPointCard dot={dot} info={pointInfo?.get(dot.id)} riverSlug={riverSlug} layout={layout}
              selected={selected && routes.find(route => route.option === selected)} points={points}
              onEnter={() => showDot(dot.id)} onLeave={() => hideDot()} />}
          </>}
        </div>

        <div className="pb-2 text-xs text-[var(--color-text-secondary)]">
          <div className="relative h-4 tabular-nums" aria-hidden="true">
            {layout?.ticks.map(tick => <span key={tick.mile} className="absolute -top-1 -translate-x-1/2 whitespace-nowrap" style={{ left: tick.x }}>mi {formatMile(tick.mile)}</span>)}
          </div>
          <Downstream />
        </div>
      </div>

      {/* The chosen float's facts; nothing until one is chosen. */}
      <div aria-live="polite" className={selected ? 'flex flex-col items-start gap-1 rounded-b-md border-t border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5' : undefined}>
        {selected && <>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex items-start gap-2 font-semibold">
              <NumberChip number={routes.find(route => route.option === selected)!.number} state="selected" size={24} />
              <span>{selected.putIn.name} <span aria-label="to" className="text-[var(--color-text-muted)]">→</span> {selected.takeOut.name}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-[var(--color-text-secondary)]">
                {selected.distanceMiles.toFixed(1)} mi · {routeTimeLabel(selected)}{selected.estimateBasis === 'typical' ? ' · Typical estimate' : ''}
              </span>
              <RouteConditionBadge option={selected} />
            </div>
          </div>
          <button type="button" onClick={() => onView(selected.id)}
            aria-label={`${hasCautions ? 'View cautions for' : 'View float from'} ${selected.putIn.name} to ${selected.takeOut.name}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded text-sm font-semibold text-[var(--color-text-link)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-link)]">
            {hasCautions ? 'View cautions' : 'View float'}<ArrowDown size={16} aria-hidden="true" />
          </button>
        </>}
      </div>
    </Card>
  );
}

/**
 * Reserves the strip's expected height while access points load. The placeable
 * count is not known yet: if six results become five drawable routes, a narrow
 * phone can lose a 44px lane on load. An access-point failure removes the strip.
 */
export function RiverStripPlaceholder({ riverName, routeCount }: { riverName: string; routeCount: number }) {
  const [width, measure] = useStripMeasure();
  // Match the layout's 44px lanes, including a second lane for six floats on a narrow phone.
  const perLane = width > 0 ? Math.max(1, Math.floor((width - CALLOUT_SIZE) / (CALLOUT_SIZE + 4)) + 1) : routeCount;
  const height = PLACEHOLDER_HEIGHT + (Math.max(1, Math.ceil(routeCount / perLane)) - 1) * CALLOUT_SIZE;
  return (
    <Card variant="framed" as="section" aria-busy="true" aria-label={`${riverName}: loading the river`}
      className="mb-6">
      <StripHeader riverName={riverName} view="all" onView={() => {}} hasSelection={false} loading />
      <div className="px-3 pt-2 sm:px-5" aria-hidden="true">
        <div ref={measure} style={{ height }} className="flex items-center">
          <div className="h-8 w-full rounded-full bg-[var(--color-secondary-100)] motion-safe:animate-pulse" />
        </div>
        <div className="pb-2 text-xs text-[var(--color-text-secondary)]"><div className="h-4" /><Downstream /></div>
      </div>
    </Card>
  );
}

function useStripMeasure() {
  const [width, setWidth] = useState(0);
  // React 19 runs the cleanup when the measured element is replaced or unmounted.
  const measure = useCallback((node: HTMLDivElement) => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [width, measure] as const;
}

function StripHeader({ riverName, view, onView, hasSelection, loading = false }: {
  riverName: string;
  view: RiverStripView;
  onView: (view: RiverStripView) => void;
  hasSelection: boolean;
  loading?: boolean;
}) {
  return <div inert={loading || undefined} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-3 sm:px-5">
    <div className="flex min-w-0 items-center">
      <h3 id={loading ? undefined : 'river-strip-title'} style={{ fontFamily: 'var(--font-display)' }} className="text-xl font-semibold">{riverName}</h3>
      <InfoTip quiet size={16} title="About this view" ariaLabel="About this view" body={RIVER_STRIP_INFO.join(' ')} colors={INFO_COLORS} />
    </div>
    <Segmented aria-label="River view" value={view} onChange={onView}
      options={[
        { value: 'all', label: 'All floats' },
        { value: 'stretch', label: 'Selected float', disabled: !hasSelection, title: hasSelection ? undefined : 'Choose a float first' },
      ]} />
  </div>;
}

function Downstream() {
  return <span className="flex items-center justify-end gap-1 font-semibold">Downstream<ArrowRight size={14} aria-hidden="true" /></span>;
}

const STRIP_POINT_CARD_ID = 'river-strip-point';
const CARD_WIDTH = 248;

/** Which dot's card is open. Leaving waits a moment so the pointer can cross into the card. */
function useDotCard() {
  const [active, setActive] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => cancel, []);
  const show = useCallback((id: string) => { cancel(); setActive(id); }, []);
  const hide = useCallback((now = false) => {
    cancel();
    if (now) setActive(null);
    else timer.current = setTimeout(() => setActive(null), 150);
  }, []);
  return [active, show, hide] as const;
}

const TYPE_LABELS: Record<AccessPointType, string> = {
  boat_ramp: 'Boat ramp', gravel_bar: 'Gravel bar', campground: 'Campground', bridge: 'Bridge', access: 'Access', park: 'Park',
};

/** The amenity marks a floater stops for, from the access point's own record. */
function pointFacilities(info: AccessPoint) {
  const has = (key: string) => (info.amenities ?? []).includes(key);
  const marks: { icon: EddyIconName; label: string }[] = [];
  if (has('camping') || (info.types ?? []).includes('campground')) marks.push({ icon: 'campground', label: 'Camping' });
  if (has('restrooms') || has('toilets')) marks.push({ icon: 'facilities', label: 'Restrooms' });
  if (has('parking')) marks.push({ icon: 'parking', label: 'Parking' });
  return marks;
}

/**
 * The hover card for an in-between access: what it is, who may use it, what is
 * there, and where it sits in the chosen float. Drawn inside the strip so it
 * scrolls with it; placed on the side of the river with more room.
 */
function StripPointCard({ dot, info, riverSlug, layout, selected, points, onEnter, onLeave }: {
  dot: { id: string; name: string; mile: number; x: number; y: number; endpoint: boolean };
  info: AccessPoint | undefined;
  riverSlug: string;
  layout: { width: number; height: number };
  selected: NumberedRoute | null | undefined;
  points: RiverStripPoint[];
  onEnter: () => void;
  onLeave: () => void;
}) {
  const below = dot.y < layout.height / 2;
  const left = Math.max(0, Math.min(dot.x - CARD_WIDTH / 2, layout.width - CARD_WIDTH));
  const kind = info ? TYPE_LABELS[info.types?.[0] ?? info.type] ?? 'Access' : null;
  const access = info ? (info.isPublic ? 'Public' : 'Private') : null;
  const marks = info ? pointFacilities(info) : [];
  const fee = info?.feeRequired === false ? 'No fee' : info?.feeRequired === true ? 'Fee' : null;
  // Where this point sits in the chosen float, when it is inside one.
  let inFloat: string | null = null;
  if (selected) {
    const start = points.find(p => p.id === selected.option.putIn.id)?.mile;
    const end = points.find(p => p.id === selected.option.takeOut.id)?.mile;
    if (start != null && end != null && dot.mile > start && dot.mile < end) {
      inFloat = `${formatMile(Math.round((dot.mile - start) * 10) / 10)} mi below ${selected.option.putIn.name} · float ${selected.number}`;
    }
  }
  return <div id={STRIP_POINT_CARD_ID} role="group" aria-label={dot.name} onPointerEnter={onEnter}
    onPointerLeave={e => { if (e.pointerType === 'mouse') onLeave(); }}
    onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) onLeave(); }}
    className="absolute z-30 rounded-lg border-2 border-[var(--color-primary-700)] bg-[var(--color-surface)] p-3 text-left text-sm"
    style={{ left, width: CARD_WIDTH, boxShadow: '3px 3px 0 var(--color-neutral-700)', ...(below ? { top: dot.y + 14 } : { bottom: layout.height - dot.y + 14 }) }}>
    <p className="font-semibold leading-snug">{dot.name}</p>
    <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
      {[`mi ${formatMile(dot.mile)}`, kind, access].filter(Boolean).join(' · ')}
      {!dot.endpoint && <><br />On the water, not a launch</>}
    </p>
    {inFloat && <p className="mt-1 text-xs font-semibold text-[var(--color-accent-700)]">{inFloat}</p>}
    {(marks.length > 0 || fee) && <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-label="Facilities">
      {marks.map(mark => <li key={mark.icon} className="inline-flex items-center gap-1"><EddyIcon name={mark.icon} size={18} />{mark.label}</li>)}
      {fee && <li className="font-semibold text-[var(--color-text-secondary)]">{fee}</li>}
    </ul>}
    {info?.slug && <Link href={`/rivers/${riverSlug}/access/${info.slug}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-text-link)] hover:underline">
      Access details<ArrowRight size={12} aria-hidden="true" />
    </Link>}
  </div>;
}

/** Focus the strip's callout for a route: after "Show on river", the next Tab continues in the strip. */
export function focusStripRoute(id: string) {
  const strip = document.getElementById(RIVER_STRIP_ID);
  if (!strip) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  strip.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'nearest' });
  strip.querySelector<HTMLButtonElement>(`button[data-route-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
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
