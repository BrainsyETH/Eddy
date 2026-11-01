'use client';

import Image from 'next/image';
import { useMemo, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { EddyIcon } from '@/components/ui/EddyIcon';
import InfoTip from '@/components/ui/InfoTip';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import { optimizeBlogImage } from '@/lib/blog-image';
import {
  driveLabel, floatBoatLabel, floatPlanPath, floatSearchEmptyMessage, floatSortsFor, floatTripLabel,
  FLOAT_DISTANCE_INFO, FLOAT_SEARCH_LOADING_DETAIL, FLOAT_SEARCH_LOADING_TITLE, FLOAT_TIME_INFO,
  publicAccessLabel, sortFloatOptions,
  type floatSearchRecoveryOptions, type FloatSearchOption, type FloatSort,
} from '@shared/float-search';
import type { SearchSnapshot } from './FindFloatClient';
import { riverStripPlaceable, type RiverStripPoint, type RouteState } from '@shared/river-strip';
import RiverStrip, { focusStripRoute, NumberChip, RiverStripPlaceholder, type NumberedRoute } from './RiverStrip';
import { INFO_COLORS, routeAccessLabel, RouteCautions, RouteConditionBadge, routeEstimateLabel, routeTimeLabel } from './route-facts';

const NO_POINTS: RiverStripPoint[] = [];


export function FloatSearchLoading({ compact = false }: { compact?: boolean }) {
  return <Card variant="panel" role="status" aria-live="polite"
    style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-300) 8%, var(--color-surface))', borderColor: 'var(--color-primary-300)' }}
    className={`mb-5 flex flex-col items-center justify-center gap-4 px-6 text-center ${compact ? 'py-6' : 'min-h-96 py-12 sm:min-h-[480px]'}`}>
    <EddyIcon name="checkingGauge" size={compact ? 100 : 190} />
    <h2 style={{ fontFamily: 'var(--font-display)' }} className={compact ? 'text-2xl' : 'text-3xl sm:text-4xl'}>{FLOAT_SEARCH_LOADING_TITLE}</h2>
    <p className="text-sm text-[var(--color-text-secondary)]">{FLOAT_SEARCH_LOADING_DETAIL}</p>
    <div className="flex gap-2 py-2 text-[var(--color-text-secondary)]" aria-hidden="true">
      {[0, 1, 2].map(i => <span key={i} className="h-2 w-2 rounded-full bg-current motion-safe:animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />)}
    </div>
  </Card>;
}

function hoursLabel(hours: number) {
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

export function FloatResults({ snapshot, stale, sort, onSort, onPlan, recoveryOptions, onRecover, riverPhoto }: {
  snapshot: SearchSnapshot;
  riverPhoto: (slug: string) => string | null | undefined;
  /** Inputs changed or a search is running: results dim and cannot open a plan. */
  stale: boolean;
  sort: FloatSort;
  onSort: (sort: FloatSort) => void;
  onPlan: () => boolean;
  recoveryOptions: ReturnType<typeof floatSearchRecoveryOptions>;
  onRecover: (option: ReturnType<typeof floatSearchRecoveryOptions>[number]) => void;
}) {
  const { data, input, location } = snapshot;
  const days = input.days ?? 1;
  const routes = [...data.matches, ...data.alternatives];
  const sorts = floatSortsFor(routes);
  const matches = useMemo(() => sortFloatOptions(data.matches, sort), [data.matches, sort]);
  const alternatives = useMemo(() => sortFloatOptions(data.alternatives, sort), [data.alternatives, sort]);

  // One river searched: draw it. The strip exists only once its access points
  // have loaded, and only routes it can place get a number, so a card never
  // offers a float the strip cannot show.
  const ordered = useMemo(() => [...matches, ...alternatives], [matches, alternatives]);
  const stripRiver = input.river && ordered.length > 0 && ordered.every(option => option.riverSlug === input.river) ? input.river : null;
  const { data: accessPoints, isError: pointsFailed } = useAccessPoints(stripRiver);
  // First load only: hold the strip's space. A failure falls back to plain cards.
  const pointsLoading = Boolean(stripRiver) && !accessPoints && !pointsFailed;
  const points = useMemo(() => accessPoints?.map(point => ({
    id: point.id, name: point.name, mile: point.riverMile, endpoint: point.isFloatEndpoint !== false,
  })) ?? NO_POINTS, [accessPoints]);
  const stripRoutes = useMemo<NumberedRoute[]>(() => {
    if (!stripRiver || points.length < 2) return [];
    const placeable = riverStripPlaceable(points, ordered.map(o => ({ id: o.id, number: 0, putInId: o.putIn.id, takeOutId: o.takeOut.id })));
    return ordered.filter(o => placeable.has(o.id)).map((option, i) => ({ option, number: i + 1 }));
  }, [stripRiver, points, ordered]);
  const onStrip = (id: string | null) => (id && stripRoutes.some(route => route.option.id === id) ? id : null);

  // The parent keys these results by search; a new search opens on all floats, none chosen.
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [pointedId, setPointedId] = useState<string | null>(null);
  const selectedId = onStrip(chosenId);
  const hoveredId = onStrip(pointedId);
  const showOnRiver = (id: string) => {
    // Render the selection first so its callout exists to take focus.
    flushSync(() => setChosenId(id));
    focusStripRoute(id);
  };
  const card = (option: FloatSearchOption) => {
    const number = stripRoutes.find(route => route.option.id === option.id)?.number;
    const strip = number ? {
      number,
      state: (option.id === selectedId ? 'selected' : option.id === hoveredId ? 'hovered' : 'other') as RouteState,
      onShow: () => showOnRiver(option.id),
      onHover: (on: boolean) => setPointedId(on ? option.id : null),
    } : undefined;
    return <FloatCard key={option.id} option={option} riverPhoto={riverPhoto(option.riverSlug)} stale={stale} onPlan={onPlan} strip={strip} />;
  };
  return (
    <div className={stale ? 'pointer-events-none opacity-50 transition-opacity' : 'transition-opacity'} inert={stale || undefined}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4" aria-live="polite">
        <div className="min-w-0">
          <p className="mb-1 text-sm font-semibold text-[var(--color-primary-600)]">{location}</p>
          <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl font-medium">Matching Floats</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {days > 1 ? `${floatTripLabel(days)} · ${hoursLabel(input.targetHours)} a day` : `About ${hoursLabel(input.targetHours)}`} · {floatBoatLabel(input.vesselType)} · Checked {new Date(data.estimatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        {routes.length > 1 && <label className="flex items-center gap-2 text-sm font-semibold">Sort
          <select className="input w-auto py-2" value={sort} onChange={e => onSort(e.target.value as FloatSort)}>
            {sorts.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>}
      </div>
      {data.partial && <p role="status" className="mb-4 text-sm font-medium">{data.failed ? 'Some rivers couldn’t be checked.' : 'Showing a selection of routes.'}</p>}
      {data.matches.length === 0 && <Card variant="panel" className="mb-6 space-y-4 p-5">
        <p className="font-medium">{floatSearchEmptyMessage(data)}</p>
        {recoveryOptions.length > 0 && <div className="flex flex-wrap gap-3">{recoveryOptions.map(option => <Button key={option.label} variant="outline" onClick={() => onRecover(option)}>{option.label}<ArrowRight size={16} aria-hidden="true" /></Button>)}</div>}
      </Card>}
      {pointsLoading && <RiverStripPlaceholder riverName={ordered[0].riverName} />}
      {stripRiver && stripRoutes.length > 0 && <RiverStrip riverSlug={stripRiver} riverName={stripRoutes[0].option.riverName}
        points={points} routes={stripRoutes} selectedId={selectedId} hoveredId={hoveredId}
        onSelect={setChosenId} onHover={setPointedId} stale={stale} onPlan={onPlan} />}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Matching routes">
        {matches.map(card)}
      </div>
      {data.alternatives.length > 0 && <section className="mt-10" aria-label="Alternative routes">
        <h3 style={{ fontFamily: 'var(--font-display)' }} className="mb-4 text-2xl font-medium">Shorter or longer</h3>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{alternatives.map(card)}</div>
      </section>}
    </div>
  );
}

/** Mirrors the iOS FloatSearchCard: photo, route, three metrics, badges,
 * cautions, details on demand, then one filled call to action. */
function FloatCard({ option: o, riverPhoto, stale, onPlan, strip }: {
  option: FloatSearchOption;
  riverPhoto?: string | null;
  stale: boolean;
  onPlan: () => boolean;
  /** Present only when the river strip shows this route: its number and the link to it. */
  strip?: { number: number; state: RouteState; onShow: () => void; onHover: (on: boolean) => void };
}) {
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const photo = [o.photo?.url, riverPhoto].find((url): url is string => !!url && !failed.includes(url));
  const metric = 'flex min-w-0 flex-1 flex-col gap-1';
  return (
    <Card variant="framed" as="article" className="flex flex-col overflow-hidden transition-[border-color,box-shadow]"
      onMouseEnter={strip && (() => strip.onHover(true))} onMouseLeave={strip && (() => strip.onHover(false))}
      style={strip?.state === 'selected' ? { borderColor: 'var(--color-accent-700)', boxShadow: '4px 4px 0 var(--color-accent-700)' } : undefined}>
      <div className="relative h-40 shrink-0 bg-[var(--color-surface-hover)]">
        {photo
          ? <Image key={photo} src={photo} alt="" fill unoptimized={!optimizeBlogImage(photo)} sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover" onError={() => setFailed(previous => [...previous, photo])} />
          : <div className="flex h-full items-center justify-center"><EddyIcon name="wave" size={110} /></div>}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-primary-600)]">{o.riverName}</p>
            <h3 style={{ fontFamily: 'var(--font-display)' }} className="mt-1 text-xl font-semibold leading-snug">{o.putIn.name} <span aria-label="to">→</span> {o.takeOut.name}</h3>
          </div>
          {strip && <NumberChip number={strip.number} state={strip.state} />}
        </div>
        <div className="flex flex-wrap gap-y-3 divide-x divide-[var(--color-border)]">
          <div className={`${metric} pr-4`}>
            <span style={{ fontFamily: 'var(--font-display)' }} className="text-xl font-semibold tabular-nums">{routeTimeLabel(o)}</span>
            <span className="flex items-center gap-1 whitespace-nowrap text-xs text-[var(--color-text-secondary)]">{routeEstimateLabel(o)}
              <InfoTip size={16} title="About float times" ariaLabel="About float times" body={FLOAT_TIME_INFO.join(' ')} colors={INFO_COLORS} /></span>
          </div>
          <div className={`${metric} px-4`}>
            <span style={{ fontFamily: 'var(--font-display)' }} className="text-xl font-semibold tabular-nums">{o.distanceMiles.toFixed(1)} mi</span>
            <span className="text-xs text-[var(--color-text-secondary)]">On the river</span>
          </div>
          {o.driveMinutes != null && <div className={`${metric} pl-4`}>
            <span style={{ fontFamily: 'var(--font-display)' }} className="text-xl font-semibold tabular-nums">{driveLabel(o.driveMinutes)}</span>
            <span className="flex items-center gap-1 whitespace-nowrap text-xs text-[var(--color-text-secondary)]">Drive
              <InfoTip size={16} title="About distance" ariaLabel="About distance" body={FLOAT_DISTANCE_INFO.join(' ')} colors={INFO_COLORS} /></span>
          </div>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <RouteConditionBadge option={o} />
          <span className="rounded-full bg-[var(--color-surface-hover)] px-3 py-1 text-[var(--color-text-secondary)]">{routeAccessLabel(o)}</span>
          {o.highlights?.map(highlight => <span key={highlight} className="rounded-full bg-[var(--color-surface-hover)] px-3 py-1 text-[var(--color-text-secondary)]">{highlight}</span>)}
          {o.relation !== 'match' && <span className="text-[var(--color-text-secondary)]">{o.relation === 'shorter' ? 'Shorter option' : 'Longer option'}</span>}
        </div>
        <RouteCautions option={o} />
        <div className="flex flex-wrap items-center gap-x-5">
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--color-primary-600)]">
            Route details<ChevronDown size={16} aria-hidden="true" className={expanded ? 'rotate-180' : ''} />
          </button>
          {strip && <button type="button" aria-pressed={strip.state === 'selected'} onClick={strip.onShow}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-primary-600)]">
            {strip.state === 'selected'
              ? <span><span className="sr-only">Float {strip.number} </span>On the river</span>
              : <span>Show <span className="sr-only">float {strip.number} </span>on river</span>}
          </button>}
        </div>
        {expanded && <div className="-mt-2 space-y-2 text-sm text-[var(--color-text-secondary)]">
          <p>Put-in: {publicAccessLabel(o.putIn.isPublic)}<br />Take-out: {publicAccessLabel(o.takeOut.isPublic)}</p>
          <p>{o.estimateBasis === 'current_conditions' ? 'Estimate uses current conditions.' : 'Estimate uses typical conditions.'}
            {o.observedAt && o.estimateBasis === 'current_conditions' ? ` Reading ${new Date(o.observedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : ''}</p>
          {o.description && <p>{o.description}</p>}
          {o.photo?.caption && photo === o.photo.url && <p className="text-xs">{o.photo.caption}</p>}
        </div>}
        <div className="mt-auto pt-1">
          <Button href={floatPlanPath(o)} className="w-full" tabIndex={stale ? -1 : undefined}
            aria-label={`Plan this float from ${o.putIn.name} to ${o.takeOut.name}`}
            onClick={(event: MouseEvent<HTMLAnchorElement>) => { if (stale || !onPlan()) event.preventDefault(); }}>
            Plan this float<ArrowRight size={18} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
