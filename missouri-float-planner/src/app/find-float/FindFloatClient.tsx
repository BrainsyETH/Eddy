'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import BuildRouteIcon from '@/components/ui/BuildRouteIcon';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Segmented from '@/components/ui/Segmented';
import VesselIcon from '@/components/ui/VesselIcon';
import { useRivers } from '@/hooks/useRivers';
import {
  approximateLocation, FLOAT_BOATS, FLOAT_BOAT_STORAGE_KEY, FLOAT_SEARCH_DEFAULT_BOAT,
  FLOAT_RADIUS_MILES, FLOAT_TRIP_DAYS, floatBoatLabel, floatSearchIdentity, floatSearchRequest,
  floatSearchIsFresh, FLOAT_SEARCH_MAX_AGE_MS, FLOAT_SEARCH_EXPIRED_MESSAGE,
  floatSearchRecoveryOptions, floatTripLabel,
  type FloatBoat, type FloatSearchInput, type FloatSearchResponse, type FloatSort,
} from '@shared/float-search';
import DestinationSearch, { type SearchDestination } from './DestinationSearch';
import FloatFilters from './FloatFilters';
import { FloatResults, FloatSearchLoading } from './FloatResults';
import FeaturedFloats from './FeaturedFloats';
import { floatNavigation } from '@/lib/navigation/site-navigation';

export type SearchSnapshot = { input: FloatSearchInput; location: string; data: FloatSearchResponse };
type Source = SearchDestination['source'];
type State = { input: FloatSearchInput; location: string; source?: Source; result: SearchSnapshot | null; sort: FloatSort };
// Browser-memory only: returning from the planner restores the session.
// Coordinates and town results must never be written to disk or the URL.
let previous: { state: State; scroll: number; initialRiver: string } | null = null;
const EMPTY_RIVERS: NonNullable<ReturnType<typeof useRivers>['data']> = [];
const HOURS = Array.from({ length: 24 }, (_, i) => (i + 1) / 2);

export default function FindFloatClient({ initialRiver }: { initialRiver: string }) {
  const searchParams = useSearchParams();
  const [planner] = floatNavigation('/find-float', searchParams.toString());
  const [state, setState] = useState<State>({
    input: { river: initialRiver || undefined, radiusMiles: 100, targetHours: 5, vesselType: FLOAT_SEARCH_DEFAULT_BOAT, publicOnly: true, days: 1 },
    location: '', result: null, sort: 'best',
  });
  const [busy, setBusy] = useState<'location' | 'search' | null>(null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [destinationVersion, setDestinationVersion] = useState(0);
  const request = useRef<AbortController | null>(null);
  const locationAttempt = useRef(0);
  const { data: rivers = EMPTY_RIVERS, isError: riversFailed } = useRivers();
  const { input, result } = state;
  const riverName = input.river ? rivers.find(r => r.slug === input.river)?.name ?? input.river : '';
  // A river keeps a visible starting point (your location or a named launch) for drive times.
  const destinationName = input.river
    ? state.source === 'access' ? state.location : input.near && state.source === 'current' ? `${riverName} · Near you` : riverName
    : state.location;
  const dirty = Boolean(result && floatSearchIdentity(result.input) !== floatSearchIdentity(input));
  const canSearch = Boolean(input.near || input.river);
  const days = input.days ?? 1;

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
    if (Object.hasOwn(patch, 'river')) {
      const params = new URLSearchParams(window.location.search);
      if (patch.river) params.set('river', patch.river);
      else params.delete('river');
      for (const key of ['putIn', 'takeOut']) params.delete(key);
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
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
      update({ river: destination.river, near: keep }, keep ? 'Your approximate location' : '', keep ? 'current' : undefined);
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
      if (!controller.signal.aborted) setState(s => ({ ...s, sort: 'best', result: { input: submitted, location, data } }));
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
      update({ near }, 'Your approximate location', 'current');
    }, () => {
      if (attempt !== locationAttempt.current) return;
      setError('Location was not available. Choose a town or river.');
      setBusy(null);
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
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
        <Button href={planner.href} variant="outline" onClick={rememberBrowsing}><BuildRouteIcon size={24} />Build a Route</Button>
      </header>
      <div className="space-y-8">
        <Card variant="framed" as="section" aria-labelledby="route-finder-heading" className="min-w-0" style={{ overflow: 'visible' }}>
          <form className="space-y-5 p-4 sm:p-6" onSubmit={e => { e.preventDefault(); void search(); }}>
            <h2 id="route-finder-heading" style={{ fontFamily: 'var(--font-display)' }} className="text-2xl font-semibold">Find a Route</h2>
            <div className={`grid items-end gap-4 ${input.near && !input.river ? 'sm:grid-cols-[minmax(0,1fr)_180px]' : ''}`}>
              <DestinationSearch key={destinationVersion} rivers={rivers} selected={destinationName} locating={busy === 'location'} riversFailed={riversFailed}
                usingLocation={state.source === 'current' && Boolean(input.near)}
                onChoose={chooseDestination} onClear={() => update({ river: undefined, near: undefined }, '', undefined)} onLocate={locate} />
              {input.near && !input.river && <label className="block min-w-0 text-sm font-semibold">Search radius
                <select className="input mt-2" value={input.radiusMiles} onChange={e => update({ radiusMiles: Number(e.target.value) })}>
                  {FLOAT_RADIUS_MILES.map(mi => <option key={mi} value={mi}>Within {mi} miles</option>)}
                </select>
              </label>}
            </div>
            <div className="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1.3fr)]">
              <fieldset className="min-w-0">
                <legend className="mb-2 text-sm font-semibold">Trip length</legend>
                <Segmented size="md" stretch aria-label="Trip length" value={days}
                  onChange={value => update({ days: value })}
                  options={FLOAT_TRIP_DAYS.map(value => ({ value, label: floatTripLabel(value) }))} />
              </fieldset>
              <div className="min-w-0">
                <label htmlFor="float-duration" className="mb-2 block text-sm font-semibold">Time on the river</label>
                <select id="float-duration" className="input" value={input.targetHours} onChange={e => update({ targetHours: Number(e.target.value) })}>
                  {HOURS.map(h => <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}{days > 1 ? ' a day' : ''}</option>)}
                </select>
              </div>
              <fieldset className="min-w-0 md:col-span-2 lg:col-span-1">
                <legend className="mb-2 text-sm font-semibold">Vessel</legend>
                <Segmented size="md" stretch aria-label="Vessel"
                  value={input.vesselType} onChange={vesselType => update({ vesselType })}
                  options={FLOAT_BOATS.map(boat => ({ value: boat, label: <span className="flex items-center justify-center gap-2"><VesselIcon vessel={boat} size={20} />{floatBoatLabel(boat)}</span> }))} />
              </fieldset>
            </div>
            <div className="border-t border-[var(--color-border)] pt-4">
              <FloatFilters input={input} onChange={update}>
                {error && <p role="alert" className="text-sm text-[var(--color-error)]">{error}</p>}
                <Button type="submit" className="w-full sm:w-auto" disabled={!canSearch || busy !== null}>
                  {busy === 'search' ? 'Finding routes…' : result ? 'Update routes' : 'Find routes'}<ArrowRight size={18} aria-hidden="true" />
                </Button>
              </FloatFilters>
            </div>
          </form>
        </Card>
        {(expired || result || busy === 'search') && <section className="min-w-0" aria-label="Matching Floats">
          {expired && <p role="status" className="mb-5 text-sm font-medium">{FLOAT_SEARCH_EXPIRED_MESSAGE}</p>}
          {busy === 'search' && <FloatSearchLoading compact={Boolean(result)} />}
          {result && <FloatResults snapshot={result} riverPhoto={slug => rivers.find(r => r.slug === slug)?.photoUrl} stale={dirty || busy !== null} sort={state.sort} onSort={sort => setState(s => ({ ...s, sort }))} onPlan={remember}
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
