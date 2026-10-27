'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { RiverListItem, RiversResponse } from '@/types/api';
import type { DamSnapshot, DamsResponse } from '@shared/dam-types';
import { CONDITION_SYSTEM, conditionChip, type ConditionCode } from '@shared/condition-system';
import { useRiverGroups } from '@/hooks/useRiverGroups';
import RiverCard from '@/components/gauge/RiverCard';
import DamListCard from '@/components/dam/DamListCard';
import DestinationPreview from './DestinationPreview';
import ConditionsDirectory from './ConditionsDirectory';
import { stateName } from '@/lib/navigation/states';
import {
  DIFFICULTY_TIER_LABELS, LENGTH_BUCKET_LABELS, RIVER_TYPE_LABELS, SORT_LABELS, type Coordinates,
} from '@/lib/rivers/filters';
import {
  buildConditionsDestinations, changeConditionsKind, conditionsParams, conditionsStates,
  destinationDistance, featuredDestinations, matchConditionsDestination, parseConditionsState,
  selectConditionsDestinations, type ConditionsDestination, type ConditionsKind, type ConditionsSort,
  type ConditionsState,
} from '@/lib/conditions/directory';

export interface ConditionsExplorerProps {
  rivers: RiverListItem[];
  dams: DamSnapshot[];
  renderedAt: number;
  defaultKind?: ConditionsKind;
  damsUnavailable?: boolean;
}

// Only the URL observer suspends during prerendering. The catalogue and cards
// still render into HTML, including the /dams entry's lake/dam default.
function LocationObserver({ onChange }: { onChange: (query: string) => void }) {
  const params = useSearchParams();
  const value = params.toString();
  useEffect(() => { onChange(window.location.search.slice(1)); }, [value, onChange]);
  return null;
}

const KINDS: { value: ConditionsKind; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'rivers', label: 'Rivers' }, { value: 'dams', label: 'Lakes & Dams' },
];
const selectClass = 'min-h-11 min-w-0 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus-visible:outline-2 focus-visible:outline-primary-600';

export default function ConditionsExplorer({ rivers: initialRivers, dams: initialDams, renderedAt, defaultKind = 'all', damsUnavailable = false }: ConditionsExplorerProps) {
  const [queryString, setQueryString] = useState('');
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(renderedAt);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'granted' | 'denied' | 'unsupported'>('idle');
  const input = useRef<HTMLInputElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { riverGroups, error: riverError } = useRiverGroups();
  // Recover a failed server catalogue read without blocking dam discovery.
  // Normal visits use the server catalogue and make no extra river request.
  const riverQuery = useQuery<RiverListItem[]>({
    queryKey: ['conditions-rivers'],
    enabled: initialRivers.length === 0,
    initialData: initialRivers.length ? initialRivers : undefined,
    queryFn: async () => {
      const response = await fetch('/api/rivers');
      if (!response.ok) throw new Error('River directory unavailable');
      const data = await response.json() as RiversResponse;
      if (!Array.isArray(data.rivers)) throw new Error('River directory unavailable');
      return data.rivers;
    },
    staleTime: 60_000, retry: 1,
  });
  const rivers = initialRivers.length ? initialRivers : riverQuery.data ?? initialRivers;
  const damQuery = useQuery<DamSnapshot[]>({
    queryKey: ['conditions-dams'],
    queryFn: async () => {
      const response = await fetch('/api/dams');
      if (!response.ok) throw new Error('Dam readings unavailable');
      const data = await response.json() as DamsResponse;
      if (!Array.isArray(data.dams) || data.dams.length === 0) throw new Error('Dam readings unavailable');
      return data.dams;
    },
    initialData: initialDams, initialDataUpdatedAt: damsUnavailable ? 0 : renderedAt,
    staleTime: 5 * 60_000, refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true, retry: 1,
  });
  // A partial feed must not remove catalogue destinations from discovery.
  const dams = useMemo(() => {
    const current = new Map(damQuery.data.map(dam => [dam.id, dam]));
    return initialDams.map(dam => current.get(dam.id) ?? dam);
  }, [initialDams, damQuery.data]);
  const destinations = useMemo(() => buildConditionsDestinations(rivers, dams, riverGroups), [rivers, dams, riverGroups]);
  const state = useMemo(() => parseConditionsState(new URLSearchParams(queryString), defaultKind), [queryString, defaultKind]);
  const results = useMemo(() => selectConditionsDestinations(destinations, state, location), [destinations, state, location]);
  const states = useMemo(() => conditionsStates(destinations, state.kind), [destinations, state.kind]);
  const hasQuery = state.q.trim().length > 0;
  const browsing = state.kind === 'all' && state.sort === 'featured' && !hasQuery;
  const featured = browsing ? featuredDestinations(results) : [];
  const observeLocation = useCallback((value: string) => { setQueryString(value); setReady(true); }, []);

  useEffect(() => {
    // A quick Back can beat Next's deferred search-param update. Read the
    // restored URL directly even when the observer's value hasn't changed yet.
    const restore = () => { observeLocation(window.location.search.slice(1)); setNotice(''); };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [observeLocation]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    tick();
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, []);
  useEffect(() => {
    const gauge = new URLSearchParams(queryString).get('gauge');
    if (gauge) router.replace(`/gauges/${encodeURIComponent(gauge)}`);
  }, [queryString, router]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { setGeoStatus('unsupported'); return; }
    setGeoStatus('locating');
    navigator.geolocation.getCurrentPosition(position => {
      setLocation({ lat: position.coords.latitude, lng: position.coords.longitude }); setGeoStatus('granted');
    }, () => setGeoStatus('denied'), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }, []);
  useEffect(() => {
    if (ready && state.sort === 'nearest' && !hasQuery && geoStatus === 'idle') requestLocation();
  }, [ready, state.sort, hasQuery, geoStatus, requestLocation]);

  function update(next: ConditionsState, history: 'push' | 'replace' = 'push') {
    const params = conditionsParams(next, new URLSearchParams(window.location.search));
    const value = params.toString();
    setQueryString(value);
    window.history[history === 'push' ? 'pushState' : 'replaceState'](null, '', `${window.location.pathname}?${value}${window.location.hash}`);
  }
  function chooseKind(kind: ConditionsKind, fromPreview = false) {
    const next = changeConditionsKind(state, kind, destinations);
    setNotice(next.state !== state.state ? `${stateName(state.state)} filter cleared.` : '');
    update(next);
    if (fromPreview) {
      controls.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      input.current?.focus({ preventScroll: true });
    }
  }
  function clear() {
    update({ ...parseConditionsState(new URLSearchParams(), state.kind), kind: state.kind, sort: state.sort });
    setNotice(''); input.current?.focus({ preventScroll: true });
  }
  const hasFilters = hasQuery || state.state !== 'all' || state.floatable || [state.condition, state.type, state.diff, state.len].some(value => value !== 'all');
  const preview = (destination: ConditionsDestination) => <DestinationPreview destination={destination} now={now}
    relatedLabel={hasQuery ? matchConditionsDestination(destination, state.q)?.relatedLabel : undefined}
    distance={!hasQuery && state.sort === 'nearest' ? destinationDistance(destination, location) : null} />;

  return <>
    <Suspense fallback={null}><LocationObserver onChange={observeLocation} /></Suspense>
    <div ref={controls} className="mb-6 scroll-mt-20 space-y-3 rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-3.5 text-primary-700" size={20} aria-hidden="true" />
        <input ref={input} type="search" aria-label="Search rivers, lakes, or dams" placeholder="Rivers, lakes, or dams"
          disabled={!ready} value={state.q} autoComplete="off"
          onChange={event => update({ ...state, q: event.target.value }, 'replace')}
          onKeyDown={event => { if (event.key === 'Escape') update({ ...state, q: '' }, 'replace'); }}
          className="h-12 w-full rounded-xl border border-neutral-300 bg-neutral-50 pl-11 pr-12 text-base text-neutral-900 focus-visible:outline-2 focus-visible:outline-primary-600 [&::-webkit-search-cancel-button]:appearance-none" />
        {state.q && <button type="button" aria-label="Clear search" onClick={() => { update({ ...state, q: '' }, 'replace'); input.current?.focus(); }} className="absolute right-1 top-1 flex size-10 items-center justify-center rounded-lg text-neutral-600"><X size={19} /></button>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Destination type" className="flex gap-1 rounded-xl bg-neutral-100 p-1">
          {KINDS.map(kind => <button key={kind.value} type="button" disabled={!ready} aria-pressed={state.kind === kind.value}
            onClick={() => chooseKind(kind.value)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary-600 ${state.kind === kind.value ? 'bg-primary-800 text-white' : 'text-neutral-700 hover:bg-neutral-200'}`}>{kind.label}</button>)}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <select aria-label="Filter by state" disabled={!ready} value={state.state} onChange={event => { setNotice(''); update({ ...state, state: event.target.value }); }} className={selectClass}>
            <option value="all">All states</option>
            {state.state !== 'all' && !states.includes(state.state) && <option value={state.state}>{stateName(state.state)}</option>}
            {states.map(code => <option key={code} value={code}>{stateName(code)}</option>)}
          </select>
          <select aria-label="Sort destinations" disabled={!ready || hasQuery} value={hasQuery ? 'relevance' : state.sort}
            onChange={event => update({ ...state, sort: event.target.value as ConditionsSort })} className={selectClass}>
            {hasQuery && <option value="relevance">Best matches</option>}
            <option value="featured">Featured</option><option value="name">A–Z</option><option value="nearest">Nearest</option>
            {state.kind === 'rivers' && (['best', 'length_asc', 'length_desc'] as const).map(sort => <option key={sort} value={sort}>{SORT_LABELS[sort]}</option>)}
          </select>
          {hasFilters && <button type="button" onClick={clear} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50">Clear filters</button>}
        </div>
      </div>
      {state.kind === 'rivers' && <div className="space-y-3 border-t border-neutral-200 pt-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="River conditions">
          <button type="button" disabled={!ready} aria-pressed={state.floatable} onClick={() => update({ ...state, floatable: !state.floatable, condition: 'all' })}
            className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${state.floatable ? 'border-primary-700 bg-primary-800 text-white' : 'border-neutral-300 text-neutral-700'}`}>Floatable now</button>
          {(['too_low', 'low', 'good', 'flowing', 'high', 'dangerous'] as ConditionCode[]).map(code => <button key={code} type="button" disabled={!ready}
            aria-pressed={state.condition === code} onClick={() => update({ ...state, condition: state.condition === code ? 'all' : code, floatable: false })}
            className="min-h-11 rounded-full border px-3 text-sm font-semibold" style={state.condition === code ? { backgroundColor: conditionChip(code).background, color: conditionChip(code).color, borderColor: conditionChip(code).borderColor } : undefined}>{CONDITION_SYSTEM[code].label}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ['type', 'Filter by river type', 'All river types', RIVER_TYPE_LABELS],
            ['diff', 'Filter by difficulty', 'All difficulties', DIFFICULTY_TIER_LABELS],
            ['len', 'Filter by length', 'Any length', LENGTH_BUCKET_LABELS],
          ] as const).map(([key, label, all, values]) => <select key={key} aria-label={label} disabled={!ready} value={state[key]}
            onChange={event => update({ ...state, [key]: event.target.value })} className={selectClass}>
            <option value="all">{all}</option>{Object.entries(values).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>)}
        </div>
      </div>}
    </div>
    <div role="status" className="mb-4 space-y-1 text-sm text-neutral-600">
      {!browsing && <p>{results.length} {results.length === 1 ? 'destination' : 'destinations'}</p>}
      {notice && <p>{notice}</p>}
      {state.sort === 'nearest' && !hasQuery && geoStatus === 'locating' && <p>Finding your location…</p>}
      {state.sort === 'nearest' && !hasQuery && (geoStatus === 'denied' || geoStatus === 'unsupported') && <p>Location unavailable. Showing featured order. <button type="button" onClick={requestLocation} className="font-semibold text-primary-800 underline">Try again</button></p>}
      {riverError && state.kind !== 'dams' && <p>Live river readings couldn’t refresh. Showing saved reports.</p>}
      {riverQuery.isLoading && state.kind !== 'dams' && <p>Loading river directory…</p>}
      {riverQuery.isError && state.kind !== 'dams' && <p>River directory couldn’t load. <button type="button" onClick={() => { void riverQuery.refetch(); }} className="font-semibold text-primary-800 underline">Try again</button></p>}
      {damQuery.isError && state.kind !== 'rivers' && <p>Dam readings couldn’t refresh. You can still open each dam.</p>}
      {damsUnavailable && !damQuery.isFetchedAfterMount && !damQuery.isError && state.kind !== 'rivers' && <p>Loading latest dam readings…</p>}
    </div>
    {browsing ? <div className="space-y-8">
      {featured.length > 0 && <section aria-label="Featured destinations">
        <h2 className="mb-3 text-xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>Featured</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{featured.map(destination => <div key={destination.key}>{preview(destination)}</div>)}</div>
      </section>}
      {(['rivers', 'dams'] as const).map(kind => {
        const featuredKeys = new Set(featured.map(destination => destination.key));
        const items = results.filter(destination => destination.kind === kind && !featuredKeys.has(destination.key));
        if (!items.length) return null;
        const label = kind === 'rivers' ? 'Rivers' : 'Lakes & Dams';
        return <section key={kind} aria-label={`${label} preview`}>
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{label}</h2>
            <button type="button" disabled={!ready} onClick={() => chooseKind(kind, true)} className="min-h-11 text-sm font-semibold text-primary-800 underline underline-offset-4">Show all {label.toLowerCase()}</button></div>
          <div className="grid gap-3 md:grid-cols-3">{items.slice(0, 6).map((destination, index) => <div key={destination.key} className={index >= 3 ? 'hidden md:block' : undefined}>{preview(destination)}</div>)}</div>
        </section>;
      })}
      <ConditionsDirectory destinations={results} />
    </div> : <div className="grid items-start gap-4 md:grid-cols-2">
      {results.map(destination => <div key={destination.key} data-result={destination.key}>
        {hasQuery || state.kind === 'all' ? preview(destination)
          : destination.kind === 'dams' ? <Link href={destination.href} prefetch={false} className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600"><DamListCard dam={destination.dam} now={now} /></Link>
            : destination.group ? <RiverCard riverGroup={destination.group} meta={destination.meta} distanceMiles={state.sort === 'nearest' ? destinationDistance(destination, location) : null} /> : preview(destination)}
      </div>)}
    </div>}
    {results.length === 0 && <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center"><p className="text-neutral-700">No matching destinations.</p><button type="button" onClick={clear} className="mt-3 min-h-11 rounded-xl px-4 font-semibold text-primary-800 underline">Clear filters</button></div>}
    {state.kind !== 'rivers' && results.some(destination => destination.kind === 'dams') && <p className="mt-6 max-w-2xl text-xs text-neutral-500">Schedules show planned changes at the dam and can change. Water downstream takes time to rise or fall.</p>}
  </>;
}
