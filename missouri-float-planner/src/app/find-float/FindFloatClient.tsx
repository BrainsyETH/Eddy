'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Pencil } from 'lucide-react';
import BuildRouteIcon from '@/components/ui/BuildRouteIcon';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import InfoTip from '@/components/ui/InfoTip';
import Segmented from '@/components/ui/Segmented';
import VesselIcon from '@/components/ui/VesselIcon';
import { useRivers } from '@/hooks/useRivers';
import {
  approximateLocation, FLOAT_BOATS, FLOAT_BOAT_STORAGE_KEY, FLOAT_SEARCH_DEFAULT_BOAT,
  FLOAT_RADIUS_MILES, FLOAT_TRIP_DAYS, floatBoatLabel, floatSearchIdentity, floatSearchRequest,
  floatSearchIsFresh, FLOAT_SEARCH_MAX_AGE_MS, FLOAT_SEARCH_EXPIRED_MESSAGE,
  floatFilterSelections, floatSearchRecoveryOptions, floatTripLabel,
  type FloatBoat, type FloatSearchInput, type FloatSearchResponse, type FloatSort,
} from '@shared/float-search';
import DestinationSearch, { type SearchDestination } from './DestinationSearch';
import FloatFilters from './FloatFilters';
import { FloatResults, FloatSearchLoading } from './FloatResults';
import FeaturedFloats from './FeaturedFloats';
import { INFO_COLORS } from './route-facts';
import { floatNavigation } from '@/lib/navigation/site-navigation';

export type SearchSnapshot = { input: FloatSearchInput; location: string; data: FloatSearchResponse };
type Source = SearchDestination['source'];
type Choices = { input: FloatSearchInput; location: string; source?: Source };
type State = Choices & {
  result: SearchSnapshot | null;
  sort: FloatSort;
  /** After a search the form folds to a one-line summary, so results sit near the top. */
  collapsed: boolean;
  /** The choices when Edit search was pressed, which Cancel restores. */
  editing?: Choices;
};
// Browser-memory only: returning from the planner restores the session.
// Coordinates and town results must never be written to disk or the URL.
let previous: { state: State; scroll: number; initialRiver: string } | null = null;
const EMPTY_RIVERS: NonNullable<ReturnType<typeof useRivers>['data']> = [];
const HOURS = Array.from({ length: 24 }, (_, i) => (i + 1) / 2);
const NEAR_ME = 'Near me';
// How approximateLocation() treats a device position: 0.01° is about half a mile.
const LOCATION_DETAIL = 'Eddy rounds your location to about half a mile before searching with it, and never saves it in your browser or in a link.';
const hoursLabel = (h: number) => `${h} ${h === 1 ? 'hour' : 'hours'}`;

function syncRiverParam(river: string | undefined) {
  const params = new URLSearchParams(window.location.search);
  if (river) params.set('river', river);
  else params.delete('river');
  for (const key of ['putIn', 'takeOut']) params.delete(key);
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

export default function FindFloatClient({ initialRiver }: { initialRiver: string }) {
  const searchParams = useSearchParams();
  const [planner] = floatNavigation('/find-float', searchParams.toString());
  const [state, setState] = useState<State>({
    input: { river: initialRiver || undefined, radiusMiles: 100, targetHours: 5, vesselType: FLOAT_SEARCH_DEFAULT_BOAT, publicOnly: true, days: 1 },
    location: '', result: null, sort: 'best', collapsed: false,
  });
  const [busy, setBusy] = useState<'location' | 'search' | null>(null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [destinationVersion, setDestinationVersion] = useState(0);
  const request = useRef<AbortController | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const locationAttempt = useRef(0);
  const { data: rivers = EMPTY_RIVERS, isError: riversFailed } = useRivers();
  const { input, result } = state;
  const riverName = input.river ? rivers.find(r => r.slug === input.river)?.name ?? input.river : '';
  // A river keeps a visible starting point (your location or a named launch) for drive times.
  const destinationName = input.river
    ? state.source === 'access' ? state.location : input.near && state.source === 'current' ? `${riverName} · Near me` : riverName
    : state.location;
  const dirty = Boolean(result && floatSearchIdentity(result.input) !== floatSearchIdentity(input));
  const canSearch = Boolean(input.near || input.river);
  const days = input.days ?? 1;
  const usingLocation = state.source === 'current' && Boolean(input.near);
  const selections = floatFilterSelections(input);
  const summary = state.collapsed && result ? {
    place: destinationName,
    details: [
      ...(input.near && !input.river ? [`Within ${input.radiusMiles} miles`] : []),
      floatTripLabel(days),
      days > 1 ? `${hoursLabel(input.targetHours)} a day` : hoursLabel(input.targetHours),
      floatBoatLabel(input.vesselType),
    ],
  } : null;

  useEffect(() => {
    if (previous?.initialRiver === initialRiver) {
      const stale = previous.state.result && !floatSearchIsFresh(previous.state.result.data);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore ephemeral navigation state.
      setState(stale ? { ...previous.state, result: null } : previous.state);
      setExpired(Boolean(stale));
      const scroll = stale ? 0 : previous.scroll;
      requestAnimationFrame(() => window.scrollTo(0, scroll));
    } else {
      try {
        const boat = localStorage.getItem(FLOAT_BOAT_STORAGE_KEY);
        if (FLOAT_BOATS.includes(boat as FloatBoat)) setState(s => ({ ...s, input: { ...s.input, vesselType: boat as FloatBoat } }));
      } catch { /* Optional preference; private browsing still works. */ }
    }
    const attempts = locationAttempt;
    return () => { request.current?.abort(); attempts.current++; };
  }, [initialRiver]);

  useEffect(() => {
    if (!result) return;
    const expire = () => {
      if (floatSearchIsFresh(result.data)) return;
      setState(s => s.result === result ? { ...s, result: null } : s);
      setExpired(true);
    };
    const timer = window.setTimeout(expire, Math.max(0, Date.parse(result.data.estimatedAt) + FLOAT_SEARCH_MAX_AGE_MS - Date.now()));
    window.addEventListener('focus', expire);
    document.addEventListener('visibilitychange', expire);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', expire);
      document.removeEventListener('visibilitychange', expire);
    };
  }, [result]);

  function update(patch: Partial<FloatSearchInput>, location?: string, source?: Source) {
    if (Object.hasOwn(patch, 'river')) syncRiverParam(patch.river);
    request.current?.abort();
    locationAttempt.current++;
    setBusy(null);
    setError('');
    setState(s => ({ ...s, input: { ...s.input, ...patch }, ...(location !== undefined ? { location, source } : {}) }));
    if (patch.vesselType) {
      try { localStorage.setItem(FLOAT_BOAT_STORAGE_KEY, patch.vesselType); }
      catch { /* Optional preference. */ }
    }
  }

  function chooseDestination(destination: SearchDestination) {
    const near = destination.near ? approximateLocation(destination.near) : undefined;
    if (destination.river && !near) {
      // Choosing a river keeps your own location for drive times, never a town.
      const keep = state.source === 'current' ? input.near : undefined;
      update({ river: destination.river, near: keep }, keep ? NEAR_ME : '', keep ? 'current' : undefined);
    } else {
      update({ river: destination.river, near }, destination.name, destination.source);
    }
  }

  async function search(submitted = { ...input }, location = destinationName) {
    if (!(submitted.near || submitted.river) || busy === 'location') return;
    request.current?.abort();
    locationAttempt.current++;
    const controller = new AbortController();
    request.current = controller;
    setBusy('search');
    setError('');
    setExpired(false);
    // Snapshot the submitted preferences; pending edits must never relabel old results.
    try {
      const response = await fetch('/api/float-search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(floatSearchRequest(submitted)), cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Please try again.');
      if (!controller.signal.aborted) {
        setState(s => ({ ...s, sort: 'best', collapsed: true, editing: undefined, result: { input: submitted, location, data } }));
        // The form (and the button that had focus) folds away; land on its summary.
        requestAnimationFrame(() => summaryRef.current?.focus({ preventScroll: true }));
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error && e.name !== 'TimeoutError' ? e.message : 'Search took too long. Please try again.');
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  function locate() {
    request.current?.abort();
    const attempt = ++locationAttempt.current;
    setBusy('location');
    setError('');
    if (!navigator.geolocation) {
      setError('Location is unavailable. Choose a town or river.');
      setBusy(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(position => {
      if (attempt !== locationAttempt.current) return;
      const near = approximateLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      // Within a chosen river, your location orders launches and adds drive times.
      update({ near }, NEAR_ME, 'current');
    }, () => {
      if (attempt !== locationAttempt.current) return;
      setError('Location was not available. Choose a town or river.');
      setBusy(null);
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  }

  function editSearch() {
    setState(s => ({ ...s, collapsed: false, editing: { input: s.input, location: s.location, source: s.source } }));
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function cancelEdit() {
    const saved = state.editing;
    if (!saved) return;
    request.current?.abort();
    locationAttempt.current++;
    setBusy(null);
    setError('');
    if (saved.input.river !== input.river) syncRiverParam(saved.input.river);
    setState(s => ({ ...s, ...saved, collapsed: true, editing: undefined }));
    requestAnimationFrame(() => summaryRef.current?.focus({ preventScroll: true }));
  }

  function rememberBrowsing() {
    previous = { state, scroll: window.scrollY, initialRiver: input.river ?? '' };
  }

  function remember() {
    // A background tab may return after expiry before its timer has run.
    if (!result || !floatSearchIsFresh(result.data)) {
      setState(s => ({ ...s, result: null }));
      setExpired(true);
      return false;
    }
    rememberBrowsing();
    return true;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-7 text-[var(--color-text-primary)] sm:px-6 lg:py-9">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-4xl font-semibold sm:text-5xl">Floats</h1>
        <Button href={planner.href} variant="outline" onClick={rememberBrowsing}><BuildRouteIcon size={24} />Plan a float</Button>
      </header>
      <div className="space-y-8">
        {summary ? <Card variant="framed" as="section" aria-labelledby="route-finder-heading" className="min-w-0">
          <div ref={summaryRef} tabIndex={-1} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 outline-none sm:px-6">
            <div className="min-w-0 flex-1">
              <h2 id="route-finder-heading" className="sr-only">Your search</h2>
              <p className="font-semibold">{summary.place}<span className="font-normal text-[var(--color-text-secondary)]">{summary.details.map(detail => <span key={detail}> · <span className="whitespace-nowrap">{detail}</span></span>)}</span></p>
              {selections.length > 0 && <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{selections.join(' · ')}</p>}
            </div>
            <Button variant="outline" className="w-full sm:w-auto" onClick={editSearch}><Pencil size={16} aria-hidden="true" />Edit search</Button>
          </div>
        </Card>
        : <Card variant="framed" as="section" aria-labelledby="route-finder-heading" className="min-w-0" style={{ overflow: 'visible' }}>
          <form className="space-y-5 p-4 sm:p-6" onSubmit={e => { e.preventDefault(); void search(); }}>
            <h2 id="route-finder-heading" ref={headingRef} tabIndex={-1} style={{ fontFamily: 'var(--font-display)' }} className="text-2xl font-semibold outline-none">Find a float</h2>
            <div className="min-w-0">
              <DestinationSearch key={destinationVersion} rivers={rivers} selected={destinationName} locating={busy === 'location'} riversFailed={riversFailed}
                usingLocation={usingLocation}
                onChoose={chooseDestination} onClear={() => update({ river: undefined, near: undefined }, '', undefined)} onLocate={locate} />
              {/* Where and how far are one decision, so the radius sits right under the place. */}
              {input.near && !input.river && <div className="mt-2 flex items-center gap-1">
                <label htmlFor="float-radius" className="sr-only">Search radius</label>
                <select id="float-radius" className="input input--compact font-semibold" value={input.radiusMiles} onChange={e => update({ radiusMiles: Number(e.target.value) })}>
                  {FLOAT_RADIUS_MILES.map(mi => <option key={mi} value={mi}>Within {mi} miles</option>)}
                </select>
                {usingLocation && <InfoTip quiet size={16} title="About your location" ariaLabel="About your location" body={LOCATION_DETAIL} colors={INFO_COLORS} />}
              </div>}
            </div>
            <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1.3fr)]">
              <fieldset className="min-w-0">
                <legend className="mb-2 text-sm font-semibold">Trip length</legend>
                <Segmented size="md" stretch className="segmented--field" aria-label="Trip length" value={days}
                  onChange={value => update({ days: value })}
                  options={FLOAT_TRIP_DAYS.map(value => ({ value, label: floatTripLabel(value) }))} />
              </fieldset>
              <div className="min-w-0">
                <label htmlFor="float-duration" className="mb-2 block text-sm font-semibold">Time on the river</label>
                <select id="float-duration" className="input font-normal" value={input.targetHours} onChange={e => update({ targetHours: Number(e.target.value) })}>
                  {HOURS.map(h => <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}{days > 1 ? ' a day' : ''}</option>)}
                </select>
              </div>
              <fieldset className="min-w-0 md:col-span-2 lg:col-span-1">
                <legend className="mb-2 text-sm font-semibold">Vessel</legend>
                <Segmented size="md" stretch className="segmented--field" aria-label="Vessel"
                  value={input.vesselType} onChange={vesselType => update({ vesselType })}
                  options={FLOAT_BOATS.map(boat => ({ value: boat, label: <span className="flex items-center justify-center gap-2"><VesselIcon vessel={boat} size={20} />{floatBoatLabel(boat)}</span> }))} />
              </fieldset>
            </div>
            <div className="border-t border-[var(--color-border)] pt-5">
              <FloatFilters input={input} onChange={update}>
                {error && <p role="alert" className="text-sm text-[var(--color-error)]">{error}</p>}
                {!canSearch && !error && <p className="text-sm text-[var(--color-text-secondary)]">Choose a river, town, or your location.</p>}
                {state.editing && result && <Button variant="ghost" className="w-full sm:w-auto" onClick={cancelEdit}>Cancel</Button>}
                <Button type="submit" className="w-full sm:w-auto sm:min-w-44" disabled={!canSearch || busy !== null}>
                  {busy === 'search' ? 'Finding floats…' : result ? 'Search again' : 'Find floats'}<ArrowRight size={18} aria-hidden="true" />
                </Button>
              </FloatFilters>
            </div>
          </form>
        </Card>}
        {(expired || result || busy === 'search') && <section className="min-w-0" aria-label="Matching Floats">
          {expired && <p role="status" className="mb-5 text-sm font-medium">{FLOAT_SEARCH_EXPIRED_MESSAGE}</p>}
          {busy === 'search' && <FloatSearchLoading compact={Boolean(result)} />}
          {result && <FloatResults key={`${result.data.estimatedAt} ${floatSearchIdentity(result.input)}`} snapshot={result} riverPhoto={slug => rivers.find(r => r.slug === slug)?.photoUrl} stale={dirty || busy !== null} sort={state.sort} onSort={sort => setState(s => ({ ...s, sort }))} onPlan={remember}
            recoveryOptions={floatSearchRecoveryOptions(result.input, result.data, rivers.find(r => r.slug === result.input.river))}
            onRecover={option => {
              const location = option.location ?? result.location;
              const source = option.location ? 'town' : state.source;
              update(option.input, location, source);
              setDestinationVersion(v => v + 1);
              void search(option.input, location);
            }} />}
        </section>}
        <FeaturedFloats rivers={rivers} onPlan={rememberBrowsing} />
      </div>
    </div>
  );
}
