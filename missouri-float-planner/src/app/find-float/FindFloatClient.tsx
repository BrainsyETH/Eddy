'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Clock, MapPin, Navigation, Waves } from 'lucide-react';
import { useRivers } from '@/hooks/useRivers';
import {
  approximateLocation,
  FLOAT_BOATS,
  FLOAT_BOAT_STORAGE_KEY,
  floatRangeLabel,
  publicAccessLabel,
  floatPlanPath,
  floatSearchIsFresh,
  floatSearchEmptyMessage,
  FLOAT_SEARCH_MAX_AGE_MS,
  FLOAT_SEARCH_EXPIRED_MESSAGE,
  FLOAT_SEARCH_PROXIMITY_NOTE,
  floatSearchUsedProximity,
  type FloatBoat,
  type FloatSearchInput,
  type FloatSearchOption,
  type FloatSearchPlace,
  type FloatSearchResponse,
} from '@shared/float-search';

type State = {
  input: FloatSearchInput;
  location: string;
  town: string;
  result: FloatSearchResponse | null;
};
// Return from the planner restores the session. Location and town results never go to disk.
let previous: { state: State; scroll: number; initialRiver: string } | null =
  null;
const control =
  'w-full rounded-xl border border-neutral-300 bg-[var(--color-surface)] px-3 py-3 text-[var(--color-text-primary)]';
const quiet =
  'rounded-xl border border-neutral-300 px-4 py-3 font-semibold hover:bg-[var(--color-hover)] disabled:opacity-50';
const primary =
  'rounded-xl bg-primary-700 px-5 py-3 font-semibold text-white hover:bg-primary-800 disabled:opacity-50';

async function post<T>(
  path: string,
  input: unknown,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Please try again.');
  return data;
}

export default function FindFloatClient({
  initialRiver,
}: {
  initialRiver: string;
}) {
  const [state, setState] = useState<State>({
    input: {
      river: initialRiver || undefined,
      radiusMiles: 100,
      targetHours: 5,
      vesselType: 'canoe',
      publicOnly: true,
    },
    location: '',
    town: '',
    result: null,
  });
  const [places, setPlaces] = useState<FloatSearchPlace[] | null>(null);
  const [busy, setBusy] = useState<'town' | 'location' | 'search' | null>(null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const request = useRef<AbortController | null>(null);
  const locationAttempt = useRef(0);
  const { data: rivers, isError: riversFailed } = useRivers();
  useEffect(() => {
    if (previous?.initialRiver === initialRiver) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore ephemeral navigation state.
      const stale = previous.state.result && !floatSearchIsFresh(previous.state.result);
      setState(stale ? { ...previous.state, result: null } : previous.state);
      setExpired(Boolean(stale));
      const scroll = stale ? 0 : previous.scroll;
      requestAnimationFrame(() => window.scrollTo(0, scroll));
    } else {
      try {
        const boat = localStorage.getItem(FLOAT_BOAT_STORAGE_KEY);
        if (FLOAT_BOATS.includes(boat as FloatBoat))
          setState((s) => ({
            ...s,
            input: { ...s.input, vesselType: boat as FloatBoat },
          }));
      } catch {
        /* Private browsing still works. */
      }
    }
    const attempts = locationAttempt;
    return () => {
      request.current?.abort();
      attempts.current++;
    };
  }, [initialRiver]);
  useEffect(() => {
    const result = state.result;
    if (!result) return;
    const expire = () => {
      if (floatSearchIsFresh(result)) return;
      setState(s => s.result === result ? { ...s, result: null } : s);
      setExpired(true);
    };
    const timer = window.setTimeout(expire, Math.max(0, Date.parse(result.estimatedAt) + FLOAT_SEARCH_MAX_AGE_MS - Date.now()));
    window.addEventListener('focus', expire);
    document.addEventListener('visibilitychange', expire);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', expire);
      document.removeEventListener('visibilitychange', expire);
    };
  }, [state.result]);
  const update = (patch: Partial<FloatSearchInput>) => {
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
    setExpired(false);
    setState((s) => ({ ...s, input: { ...s.input, ...patch }, result: null }));
    if (patch.vesselType)
      try {
        localStorage.setItem(FLOAT_BOAT_STORAGE_KEY, patch.vesselType);
      } catch {
        /* Optional preference. */
      }
  };
  const begin = (kind: 'town' | 'search') => {
    request.current?.abort();
    locationAttempt.current++;
    const controller = new AbortController();
    request.current = controller;
    setBusy(kind);
    setError('');
    return {
      controller,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
    };
  };
  async function towns() {
    const { controller, signal } = begin('town');
    setPlaces(null);
    try {
      const data = await post<{ places: FloatSearchPlace[] }>(
        '/api/float-search/places',
        { query: state.town },
        signal,
      );
      if (!controller.signal.aborted) setPlaces(data.places);
    } catch {
      if (!controller.signal.aborted)
        setError(
          'Town search is unavailable. Try again, use your location, or choose a river.',
        );
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  }
  async function search() {
    setExpired(false);
    const { controller, signal } = begin('search');
    setState((s) => ({ ...s, result: null }));
    try {
      const data = await post<FloatSearchResponse>(
        '/api/float-search',
        {
          ...state.input,
          near: state.input.near
            ? approximateLocation(state.input.near)
            : undefined,
        },
        signal,
      );
      if (!controller.signal.aborted) setState((s) => ({ ...s, result: data }));
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error && e.name !== 'TimeoutError'
            ? e.message
            : 'Search took too long. Please try again.',
        );
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
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (attempt !== locationAttempt.current) return;
        setState((s) => ({
          ...s,
          input: {
            ...s.input,
            near: approximateLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          },
          location: 'Your approximate location',
          result: null,
        }));
        setPlaces(null);
        setBusy(null);
      },
      () => {
        if (attempt !== locationAttempt.current) return;
        setError('Location was not available. Choose a town or river below.');
        setBusy(null);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }
  function remember() {
    previous = { state, scroll: window.scrollY, initialRiver };
  }
  const { input, result } = state;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12 text-[var(--color-text-primary)]">
      <div className="mb-8 flex items-start gap-4">
        <Waves
          className="mt-1 h-10 w-10 shrink-0 text-primary-600"
          aria-hidden
        />
        <div>
          <h1 className="text-4xl font-bold">Find a Route</h1>
          <p className="mt-3 max-w-xl text-lg text-[var(--color-text-secondary)]">
            Get suggestions for your time and location.
          </p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        className="rounded-2xl border border-neutral-300 bg-[var(--color-surface)] p-5 md:p-7 space-y-6"
      >
        <fieldset>
          <legend className="mb-3 text-lg font-bold">
            Where would you like to go?
          </legend>
          <button
            type="button"
            className={`${quiet} inline-flex items-center gap-2`}
            onClick={locate}
            disabled={busy !== null}
          >
            <Navigation size={18} />
            {busy === 'location' ? 'Finding your location…' : 'Use my location'}
          </button>
          <div className="mt-4 flex items-end gap-2">
            <label className="flex-1 text-sm font-semibold" htmlFor="town">
              Or choose a town
              <input
                id="town"
                className={`${control} mt-1`}
                value={state.town}
                placeholder="Town and state"
                maxLength={120}
                onChange={(e) => {
                  request.current?.abort();
                  setBusy(null);
                  setPlaces(null);
                  setState((s) => ({ ...s, town: e.target.value }));
                }}
              />
            </label>
            <button
              type="button"
              className={quiet}
              disabled={state.town.trim().length < 2 || busy !== null}
              onClick={() => void towns()}
            >
              {busy === 'town' ? 'Searching…' : 'Find town'}
            </button>
          </div>
          {places && (
            <div className="mt-2 space-y-1">
              {places.length === 0 && (
                <p>No towns found. Add a state and try again.</p>
              )}
              {places.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  className="block w-full rounded-lg border border-neutral-200 p-3 text-left hover:bg-[var(--color-hover)]"
                  onClick={() => {
                    update({ near: place.near });
                    setState((s) => ({
                      ...s,
                      location: place.name,
                      town: place.name,
                    }));
                    setPlaces(null);
                  }}
                >
                  {place.name}
                </button>
              ))}
              <p className="text-xs text-[var(--color-text-secondary)]">
                Town search ©{' '}
                <a
                  href="https://www.mapbox.com/about/maps/"
                  className="underline"
                >
                  Mapbox
                </a>
              </p>
            </div>
          )}
          {input.near && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <MapPin size={16} />
              {state.location}
              <button
                type="button"
                className="underline"
                onClick={() => update({ near: undefined })}
              >
                Clear location
              </button>
            </p>
          )}
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
            Eddy uses an approximate location. Distance is measured to the
            put-in, not by road.
          </p>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-semibold">
            About how long?
            <select
              className={`${control} mt-1`}
              value={input.targetHours}
              onChange={(e) => update({ targetHours: Number(e.target.value) })}
            >
              {Array.from({ length: 24 }, (_, i) => (i + 1) / 2).map((h) => (
                <option key={h} value={h}>
                  {h} {h === 1 ? 'hour' : 'hours'}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Within
            <select
              className={`${control} mt-1`}
              disabled={!input.near || Boolean(input.river)}
              value={input.radiusMiles}
              onChange={(e) => update({ radiusMiles: Number(e.target.value) })}
            >
              {[25, 50, 100, 150, 200, 300].map((mi) => (
                <option key={mi} value={mi}>
                  {mi} miles
                </option>
              ))}
            </select>
            {input.river && <span className="mt-1 block font-normal text-[var(--color-text-secondary)]">Searching the selected river at any distance.</span>}
          </label>
          <label className="text-sm font-semibold">
            River (optional)
            <select
              className={`${control} mt-1`}
              value={input.river ?? ''}
              onChange={(e) => update({ river: e.target.value || undefined })}
            >
              <option value="">All nearby rivers</option>
              {input.river && !rivers?.some((r) => r.slug === input.river) && (
                <option value={input.river}>{input.river}</option>
              )}
              {rivers?.map((r) => (
                <option key={r.id} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {riversFailed && (
          <p role="status" className="text-sm">
            The river list could not load. Location search is still available.
          </p>
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Vessel</legend>
          <div className="flex flex-wrap gap-2">
            {FLOAT_BOATS.map((boat) => (
              <button
                key={boat}
                type="button"
                aria-pressed={input.vesselType === boat}
                className={`${input.vesselType === boat ? primary : quiet} capitalize`}
                onClick={() => update({ vesselType: boat })}
              >
                {boat}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={input.publicOnly}
            onChange={(e) => update({ publicOnly: e.target.checked })}
          />
          Public put-ins and take-outs only
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <button
            className={primary}
            disabled={busy !== null || (!input.near && !input.river)}
          >
            {busy === 'search' ? 'Checking nearby floats…' : 'Find routes'}
          </button>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Time includes ordinary stops.
            <br />A 4–7 hour float can match a 5 hour request.
          </p>
        </div>
      </form>
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-neutral-300 p-4"
        >
          {error}
        </p>
      )}
      {expired && <p role="status" className="mt-6 rounded-xl border border-neutral-300 p-4">{FLOAT_SEARCH_EXPIRED_MESSAGE}</p>}
      {result && (
        <section
          className="mt-8 space-y-5"
          aria-label="Float results"
          aria-live="polite"
        >
          <h2 className="text-2xl font-bold">
            Floats for about {input.targetHours} hours
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Checked{' '}
            {new Date(result.estimatedAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
            . Estimates use current conditions where available; conditions can
            change.
          </p>
          {floatSearchUsedProximity(result) && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              {FLOAT_SEARCH_PROXIMITY_NOTE}
            </p>
          )}
          {result.partial && (
            <p className="rounded-xl border border-neutral-300 p-4">
              {result.failed ? 'Some river data was unavailable. ' : ''}This is
              a partial search. Try again or choose a river for a closer look.
            </p>
          )}
          {result.matches.length === 0 && (
            <p className="rounded-xl bg-[var(--color-surface)] p-5">
              {floatSearchEmptyMessage(result)}
            </p>
          )}
          {result.matches.map((option) => (
            <FloatCard key={option.id} option={option} onPlan={remember} />
          ))}
          {result.alternatives.length > 0 && (
            <>
              <h2 className="pt-3 text-xl font-bold">
                Shorter or longer alternatives
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                These ranges do not include {input.targetHours} hours.
              </p>
              {result.alternatives.map((option) => (
                <FloatCard key={option.id} option={option} onPlan={remember} />
              ))}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function FloatCard({
  option: o,
  onPlan,
}: {
  option: FloatSearchOption;
  onPlan: () => void;
}) {
  return (
    <article className="rounded-2xl border border-neutral-300 bg-[var(--color-surface)] p-5 md:p-6">
      {o.photo && (
        <figure className="mb-4">
          <Image
            src={o.photo.url}
            alt={o.photo.caption}
            width={900}
            height={360}
            unoptimized
            className="h-44 w-full rounded-xl object-cover"
          />
          <figcaption className="mt-1 text-xs text-[var(--color-text-secondary)]">
            {o.photo.caption}
          </figcaption>
        </figure>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-primary-600">{o.riverName}</p>
        <span className="rounded-full border border-neutral-300 px-3 py-1 text-sm">
          {o.conditionLabel}
          {o.conditional ? ' · Check cautions' : ''}
        </span>
      </div>
      <h3 className="mt-3 text-xl font-bold">
        {o.putIn.name} → {o.takeOut.name}
      </h3>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold">
        <span className="inline-flex items-center gap-2">
          <Clock size={17} />
          {floatRangeLabel(o.timeRange)}
          {o.relation !== 'match' ? ` · ${o.relation} option` : ''}
        </span>
        <span>{o.distanceMiles.toFixed(1)} river miles</span>
      </p>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        About {Math.round(o.minutes / 6) / 10} hours with stops ·{' '}
        {o.estimateBasis === 'current_conditions'
          ? 'Current conditions'
          : 'Typical conditions'}
        {o.observedAt && o.estimateBasis === 'current_conditions'
          ? ` · Reading ${new Date(o.observedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
          : ''}
      </p>
      <p className="mt-2 text-sm">
        Put-in: {publicAccessLabel(o.putIn.isPublic)} · Take-out:{' '}
        {publicAccessLabel(o.takeOut.isPublic)}
      </p>
      {o.description && (
        <p className="mt-3 line-clamp-2 text-sm text-[var(--color-text-secondary)]">
          {o.description}
        </p>
      )}
      {o.cautions.map((caution, i) => (
        <p className="mt-2 text-sm font-medium" key={i}>
          {caution}
        </p>
      ))}
      <Link
        href={floatPlanPath(o)}
        onClick={onPlan}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary-700 px-4 py-3 font-semibold text-white hover:bg-primary-800"
      >
        Build this route <ArrowRight size={17} />
      </Link>
    </article>
  );
}
