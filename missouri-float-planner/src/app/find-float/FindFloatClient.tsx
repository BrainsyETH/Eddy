'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Clock, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Segmented from '@/components/ui/Segmented';
import VesselIcon from '@/components/ui/VesselIcon';
import Skeleton from '@/components/ui/Skeleton';
import { useRivers } from '@/hooks/useRivers';
import {
  approximateLocation, FLOAT_BOATS, FLOAT_BOAT_STORAGE_KEY,
  floatSearchIsFresh, FLOAT_SEARCH_MAX_AGE_MS, FLOAT_SEARCH_EXPIRED_MESSAGE,
  type FloatBoat, type FloatSearchInput, type FloatSearchResponse,
} from '@shared/float-search';
import DestinationSearch, { type SearchDestination } from './DestinationSearch';
import { FloatResults, RiverInspiration } from './FloatResults';

export type SearchSnapshot = { input: FloatSearchInput; location: string; data: FloatSearchResponse };
type State = { input: FloatSearchInput; location: string; result: SearchSnapshot | null };
// Browser-memory only: returning from the planner restores the session.
// Coordinates and town results must never be written to disk or the URL.
let previous: { state: State; scroll: number; initialRiver: string } | null = null;
const EMPTY_RIVERS: NonNullable<ReturnType<typeof useRivers>['data']> = [];
const PRESET_HOURS = [2, 4, 6];

function searchIdentity(input: FloatSearchInput) {
  return JSON.stringify([input.river, input.near?.lat, input.near?.lng, input.radiusMiles, input.targetHours, input.vesselType, input.publicOnly]);
}

export default function FindFloatClient({ initialRiver }: { initialRiver: string }) {
  const [state, setState] = useState<State>({
    input: { river: initialRiver || undefined, radiusMiles: 100, targetHours: 5, vesselType: 'canoe', publicOnly: true },
    location: '', result: null,
  });
  const [busy, setBusy] = useState<'location' | 'search' | null>(null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [customHours, setCustomHours] = useState(false);
  const [destinationVersion, setDestinationVersion] = useState(0);
  const request = useRef<AbortController | null>(null);
  const locationAttempt = useRef(0);
  const { data: rivers = EMPTY_RIVERS, isError: riversFailed, isPending: riversLoading } = useRivers();
  const { input, result } = state;
  const destinationName = input.river
    ? rivers.find(r => r.slug === input.river)?.name ?? input.river
    : state.location;
  const dirty = Boolean(result && searchIdentity(result.input) !== searchIdentity(input));
  const canSearch = Boolean(input.near || input.river);

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

  function update(patch: Partial<FloatSearchInput>, location?: string) {
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
    setState(s => ({ ...s, input: { ...s.input, ...patch }, ...(location !== undefined ? { location } : {}) }));
    if (patch.vesselType) {
      try { localStorage.setItem(FLOAT_BOAT_STORAGE_KEY, patch.vesselType); }
      catch { /* Optional preference. */ }
    }
  }

  function chooseDestination(destination: SearchDestination) {
    update({ river: destination.river, near: destination.near ? approximateLocation(destination.near) : undefined }, destination.name);
  }

  async function search() {
    if (!canSearch || busy === 'location') return;
    request.current?.abort();
    locationAttempt.current++;
    const controller = new AbortController();
    request.current = controller;
    setBusy('search');
    setError('');
    setExpired(false);
    // Snapshot the submitted preferences; pending edits must never relabel old results.
    const submitted = { ...input };
    const location = destinationName;
    try {
      const response = await fetch('/api/float-search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitted), cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Please try again.');
      if (!controller.signal.aborted) setState(s => ({ ...s, result: { input: submitted, location, data } }));
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
      chooseDestination({ name: 'Your approximate location', near: { lat: position.coords.latitude, lng: position.coords.longitude } });
    }, () => {
      if (attempt !== locationAttempt.current) return;
      setError('Location was not available. Choose a town or river above.');
      setBusy(null);
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  }

  function remember() {
    // A background tab may return after expiry before its timer has run.
    if (!result || !floatSearchIsFresh(result.data)) {
      setState(s => ({ ...s, result: null }));
      setExpired(true);
      return false;
    }
    previous = { state, scroll: window.scrollY, initialRiver: input.river ?? '' };
    return true;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-7 text-[var(--color-text-primary)] sm:px-6 lg:py-9">
      <header className="mb-7 flex items-center gap-4">
        <span className="hidden rounded-full bg-primary-100 p-3 text-primary-700 sm:inline-flex"><Search size={26} aria-hidden="true" /></span>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-4xl font-semibold sm:text-5xl">Find a Route</h1>
          <p className="mt-2 text-lg text-[var(--color-text-secondary)]">Find a float that fits your day.</p>
        </div>
      </header>
      <div className="grid items-start gap-7 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-8">
        <Card variant="framed" as="aside" aria-label="Route preferences" className="min-w-0">
          <form className="space-y-6 p-5" onSubmit={e => { e.preventDefault(); void search(); }}>
            <DestinationSearch key={destinationVersion} rivers={rivers} selected={destinationName} locating={busy === 'location'} riversFailed={riversFailed}
              onChoose={chooseDestination} onClear={() => update({ river: undefined, near: undefined }, '')} onLocate={locate} />
            <fieldset className="min-w-0">
              <legend className="mb-3 flex items-center gap-2 text-sm font-semibold"><Clock size={17} aria-hidden="true" />Time on the river</legend>
              <Segmented size="md" stretch aria-label="Time on the river"
                value={customHours || !PRESET_HOURS.includes(input.targetHours) ? 'custom' : String(input.targetHours)}
                options={[...PRESET_HOURS.map(h => ({ value: String(h), label: `${h} hr` })), { value: 'custom', label: 'Custom' }]}
                onChange={value => { setCustomHours(value === 'custom'); if (value !== 'custom') update({ targetHours: Number(value) }); }} />
              {(customHours || !PRESET_HOURS.includes(input.targetHours)) && <label className="mt-3 block text-sm font-medium">About how long?
                <select className="input mt-2" value={input.targetHours} onChange={e => update({ targetHours: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, i) => (i + 1) / 2).map(h => <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}</option>)}
                </select>
              </label>}
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Includes ordinary stops along the way.</p>
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="mb-3 text-sm font-semibold">Vessel</legend>
              <Segmented size="md" stretch aria-label="Vessel"
                value={input.vesselType} onChange={vesselType => update({ vesselType })}
                options={FLOAT_BOATS.map(boat => ({ value: boat, label: <span className="flex flex-col items-center gap-2 capitalize"><VesselIcon vessel={boat} />{boat}</span> }))} />
            </fieldset>
            {input.near && <label className="block text-sm font-semibold">Search radius
              <select className="input mt-2" value={input.radiusMiles} onChange={e => update({ radiusMiles: Number(e.target.value) })}>
                {[25, 50, 100, 150, 200, 300].map(mi => <option key={mi} value={mi}>{mi} miles</option>)}
              </select>
              <span className="mt-2 block text-xs font-normal text-[var(--color-text-secondary)]">Straight-line distance to the put-in, not driving distance. Eddy uses an approximate location.</span>
            </label>}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 border-t border-[var(--color-border)] pt-3 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={input.publicOnly} onChange={e => update({ publicOnly: e.target.checked })} />Public accesses only
            </label>
            <div>
              <Button type="submit" className="w-full" disabled={!canSearch || busy !== null}>
                {busy === 'search' ? 'Checking routes…' : result ? 'Update routes' : 'Find routes'}<ArrowRight size={18} aria-hidden="true" />
              </Button>
              {!canSearch && <p className="mt-3 text-center text-sm text-[var(--color-text-secondary)]">Choose a town or river to get started.</p>}
              {error && <p role="alert" className="mt-3 text-sm text-[var(--color-error)]">{error}</p>}
            </div>
          </form>
        </Card>
        <section className="min-w-0" aria-label="Route discovery" aria-busy={busy === 'search'}>
          {expired && <Card variant="panel" className="mb-5 p-4"><p role="status" className="text-sm">{FLOAT_SEARCH_EXPIRED_MESSAGE}</p></Card>}
          {result ? <FloatResults snapshot={result} dirty={dirty} busy={busy !== null} onPlan={remember} />
            : busy === 'search' ? <div role="status" className="space-y-5"><h2 className="text-2xl font-bold">Finding your next float…</h2><p className="text-[var(--color-text-secondary)]">Checking routes and available river conditions.</p><Skeleton className="h-64 w-full" rounded="xl" /></div>
            : <RiverInspiration rivers={rivers} selectedRiver={input.river} loading={riversLoading} onChoose={river => {
              chooseDestination({ name: river.name, river: river.slug });
              setDestinationVersion(v => v + 1);
            }} />}
        </section>
      </div>
    </div>
  );
}
