'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { EddyIcon } from '@/components/ui/EddyIcon';
import type {
  CampingOverview,
  CampingPlace,
} from '@/lib/camping/overview-types';
import { nextCampingDate } from '../../../shared/camping-stay';
import {
  filteredStay,
  groupCampgrounds,
  parseWebStay,
  stayLabel,
  webPlanningWindow,
  WEB_FILTERS,
  type RegionalStay,
  type WebSiteFilter,
} from '@/lib/camping/web-search';
import styles from './CampingHub.module.css';
import CampgroundDetails from './CampgroundDetails';
import detailStyles from './CampgroundDetails.module.css';
import { loadCampgroundSites } from '@/lib/camping/web-detail-cache';
import { MAX_AGE_MS } from '@/lib/camping/freshness';
import { trackEvent } from '@/lib/analytics';

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
const unknown = { state: 'unknown', count: 0, partial: true } as const;
function placeLink(place: CampingPlace) {
  if (place.accessDestination)
    return `/plan?river=${encodeURIComponent(place.accessDestination.riverSlug)}&access=${encodeURIComponent(place.accessDestination.accessId)}`;
  return place.reservationUrl ?? place.website;
}
export default function CampingHub({
  overview,
}: {
  overview: CampingOverview;
}) {
  const urlParams = useSearchParams();
  // Inputs update in the same event as the user's edit. Router URL updates
  // can arrive later; they must not revert a checkbox or interrupt typing.
  const [query, setQuery] = useState(() => urlParams.toString());
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const [clock, setClock] = useState(() => Date.parse(overview.generatedAt));
  const { horizon } = useMemo(() => webPlanningWindow(clock), [clock]);
  const [arrival, setArrival] = useState(params.get('arrival') ?? '');
  const [departure, setDeparture] = useState(params.get('departure') ?? '');
  const [error, setError] = useState('');
  const [response, setResponse] = useState<RegionalStay | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [offset, setOffset] = useState(0);
  const [mobile, setMobile] = useState(false);
  const detail = useRef<HTMLDialogElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const detailPushed = useRef(false);
  const groups = useMemo(() => groupCampgrounds(overview.tracked), [overview]);
  const search = params.get('q') ?? '',
    river = params.get('river') ?? '';
  const filters = (params.get('types') ?? '')
    .split(',')
    .filter((v): v is WebSiteFilter =>
      WEB_FILTERS.includes(v as WebSiteFilter),
    );
  const availableOnly = params.get('available') === '1';
  const appliedArrival = params.get('arrival') ?? '',
    appliedDeparture = params.get('departure') ?? '';
  const stay = parseWebStay(
    new URLSearchParams({
      arrival: appliedArrival,
      departure: appliedDeparture,
    }),
    horizon,
  );
  const hasDates = Boolean(appliedArrival || appliedDeparture);
  const calendar =
    params.get('view') === 'calendar' ||
    (!params.get('view') && !hasDates && !mobile);
  const selected =
    hasDates && !stay
      ? undefined
      : groups.find(
          (g) =>
            g.key === params.get('campground') ||
            g.facilities.some((f) => f.facilityId === params.get('facility')),
        );
  const selectedKey = selected?.key;
  const detailArrival =
    stay?.arrival ??
    (horizon.nights.includes(params.get('night') ?? '')
      ? params.get('night')!
      : horizon.startDate);
  const detailDeparture = stay?.departure ?? nextCampingDate(detailArrival);
  const current =
    response?.arrival === appliedArrival &&
    response.departure === appliedDeparture
      ? response
      : null;
  const summaries = new Map(current?.facilities.map((f) => [f.facilityId, f]));
  const rivers = [
    ...new Map(
      overview.tracked.flatMap((c) =>
        c.riverSlugs.map((slug) => [slug, c.displayGroup.label] as const),
      ),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  function update(values: Record<string, string | null>, push = false) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setQuery(next.toString());
    const url = `/camping${next.size ? `?${next}` : ''}`;
    if (push) window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  }
  function applyDates(a: string, d: string) {
    const now = Date.now();
    const currentHorizon = webPlanningWindow(now).horizon;
    setClock(now);
    if (
      !parseWebStay(
        new URLSearchParams({ arrival: a, departure: d }),
        currentHorizon,
      )
    ) {
      setError('Choose 1–14 nights within the next 90 nights.');
      return;
    }
    setError('');
    setArrival(a);
    setDeparture(d);
    trackEvent('camping_search', {
      nights: parseWebStay(
        new URLSearchParams({ arrival: a, departure: d }),
        currentHorizon,
      )?.nights.length,
    });
    update({
      arrival: a,
      departure: d,
      night: null,
      available: null,
      view: params.get('view') || 'list',
    });
  }
  function prefetchCamp(key: string) {
    const group = groups.find(group => group.key === key);
    for (const facility of group?.facilities ?? []) {
      void loadCampgroundSites(facility.facilityId, detailArrival, detailDeparture).catch(() => {});
    }
  }
  function openCamp(key: string, night?: string) {
    lastFocus.current = document.activeElement as HTMLElement;
    detailPushed.current = true;
    trackEvent('camping_detail_open');
    update({ campground: key, facility: null, night: night ?? null }, true);
  }
  function closeCamp() {
    if (detailPushed.current) {
      detailPushed.current = false;
      window.history.back();
    } else update({ campground: null, facility: null, night: null });
  }
  useEffect(() => {
    const syncHistory = () => setQuery(new URLSearchParams(window.location.search).toString());
    window.addEventListener('popstate', syncHistory);
    return () => window.removeEventListener('popstate', syncHistory);
  }, []);
  useEffect(() => {
    const currentQuery = new URLSearchParams(window.location.search).toString();
    // Ignore an older router notification if another edit has already changed
    // the URL. External links/history changes still update every control.
    if (urlParams.toString() === currentQuery) setQuery(currentQuery);
  }, [urlParams]);
  useEffect(() => {
    const refreshClock = () => setClock(Date.now());
    refreshClock();
    const timer = setInterval(refreshClock, 30_000);
    window.addEventListener('focus', refreshClock);
    document.addEventListener('visibilitychange', refreshClock);
    const media = window.matchMedia('(max-width: 767px)');
    const change = () => setMobile(media.matches);
    change();
    media.addEventListener('change', change);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshClock);
      document.removeEventListener('visibilitychange', refreshClock);
      media.removeEventListener('change', change);
    };
  }, []);
  useEffect(() => {
    setArrival(appliedArrival);
    setDeparture(appliedDeparture);
  }, [appliedArrival, appliedDeparture]);
  useEffect(() => {
    if (!appliedArrival || !appliedDeparture) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(
      `/api/camping/stay?${new URLSearchParams({ arrival: appliedArrival, departure: appliedDeparture })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 400
              ? 'Choose 1–14 nights within the next 90 nights.'
              : 'Availability could not be checked. Try again.',
          );
        return r.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setResponse(data);
          setClock(Date.now());
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setResponse(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appliedArrival, appliedDeparture, retry]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    if (selectedKey) {
      detail.current?.showModal();
      document.body.style.overflow = 'hidden';
    } else {
      detail.current?.close();
      lastFocus.current?.focus();
    }
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selectedKey]);
  const matches = (c: CampingPlace) =>
    (!river || c.riverSlugs.includes(river)) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()));
  const rows = groups
    .filter((g) => g.facilities.some(matches))
    .map((g) => ({
      ...g,
      answer: current
        ? filteredStay(
            g.facilities.map(
              (f) =>
                summaries.get(f.facilityId) ?? {
                  facilityId: f.facilityId,
                  fetchedAt: null,
                  catalogSites: 0,
                  buckets: [],
                },
            ),
            filters,
            clock,
          )
        : unknown,
    }))
    .filter((g) => !availableOnly || g.answer.state === 'available')
    .sort(
      (a, b) =>
        Number(b.answer.state === 'available') -
          Number(a.answer.state === 'available') ||
        a.camp.name.localeCompare(b.camp.name),
    );
  const untracked = overview.untracked.filter(matches);
  const visibleNights = horizon.nights.slice(offset, offset + 14);
  return (
    <div className={styles.hub}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Stay by the river</p>
          <h1>Find your next campsite.</h1>
          <p>Pick your nights. Find a spot. Settle in.</p>
        </div>
        <EddyIcon name="campfire" size={110} decorative />
      </header>
      <form
        className={styles.search}
        onSubmit={(e) => {
          e.preventDefault();
          applyDates(arrival, departure);
        }}
      >
        <label>
          Arrive
          <input
            type="date"
            onFocus={() => setClock(Date.now())}
            min={horizon.startDate}
            max={horizon.nights.at(-1)}
            value={arrival}
            onChange={(e) => setArrival(e.target.value)}
            required
          />
        </label>
        <label>
          Leave
          <input
            type="date"
            onFocus={() => setClock(Date.now())}
            min={
              arrival ? nextCampingDate(arrival) : horizon.startDate
            }
            max={horizon.endDateExclusive}
            value={departure}
            onChange={(e) => setDeparture(e.target.value)}
            required
          />
        </label>
        <button className={styles.primary}>Find a campsite</button>
        <div className={styles.shortcuts}>
          <span>1–14 nights</span>
          <button
            type="button"
            onClick={() => {
              const tonight = webPlanningWindow(Date.now()).horizon.startDate;
              applyDates(tonight, nextCampingDate(tonight));
            }}
          >
            Tonight
          </button>
          <button
            type="button"
            onClick={() => {
              const nextWeekend = webPlanningWindow(Date.now()).weekend;
              applyDates(nextWeekend.startDate, nextWeekend.endDate);
            }}
          >
            This weekend
          </button>
          {hasDates && (
            <button
              type="button"
              onClick={() => {
                setArrival('');
                setDeparture('');
                setError('');
                update({
                  arrival: null,
                  departure: null,
                  types: null,
                  available: null,
                });
              }}
            >
              Clear dates
            </button>
          )}
        </div>
      </form>
      <div className={styles.toolbar}>
        <label>
          <span className="sr-only">Find a campground</span>
          <input
            placeholder="Find a campground"
            value={search}
            onChange={(e) => update({ q: e.target.value })}
          />
        </label>
        <label>
          <span className="sr-only">River</span>
          <select
            value={river}
            onChange={(e) => update({ river: e.target.value })}
          >
            <option value="">All rivers</option>
            {rivers.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.views} aria-label="Result view">
          <button
            aria-pressed={!calendar}
            onClick={() => update({ view: 'list' })}
          >
            List
          </button>
          <button
            aria-pressed={calendar}
            onClick={() => update({ view: 'calendar' })}
          >
            Calendar
          </button>
        </div>
      </div>
      {hasDates && (
        <div className={styles.chips}>
          {[...new Set([...(current?.filters ?? []), ...filters])].map(
            (filter) => (
              <button
                key={filter}
                aria-pressed={filters.includes(filter)}
                onClick={() =>
                  update({
                    types: (filters.includes(filter)
                      ? filters.filter((f) => f !== filter)
                      : [...filters, filter]
                    ).join(','),
                  })
                }
              >
                {filter}
              </button>
            ),
          )}
          <label>
            <input
              type="checkbox"
              checked={availableOnly}
              disabled={!current || loading}
              onChange={(e) =>
                update({ available: e.target.checked ? '1' : null })
              }
            />{' '}
            Sites available for the whole stay
          </label>
        </div>
      )}
      {error && (
        <p className={styles.notice} role="alert">
          {error} <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </p>
      )}
      <div className={styles.resultHeading} aria-live="polite">
        <h2>
          {loading
            ? 'Checking your dates…'
            : hasDates && stay
              ? `${dateLabel(stay.arrival)} – ${dateLabel(stay.departure)}`
              : 'Campgrounds along the river'}
        </h2>
        <span>{rows.length} campgrounds</span>
      </div>
      {calendar ? (
        <>
          <div className={styles.calendarControls}>
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 14))}
            >
              ← Earlier
            </button>
            <span>
              {dateLabel(visibleNights[0])} – {dateLabel(visibleNights.at(-1)!)}
            </span>
            <button
              disabled={offset + 14 >= horizon.nights.length}
              onClick={() => setOffset(offset + 14)}
            >
              Later →
            </button>
          </div>
          <p className={styles.legend}>
            Green: recorded openings · —: no recorded openings · C: closed · N:
            not released · ?: unknown. Counts are per night; search dates for a
            whole stay.
          </p>
          <div
            className={styles.calendarScroll}
            tabIndex={0}
            aria-label="Nightly campground calendar"
          >
            <table className={styles.calendar}>
              <thead>
                <tr>
                  <th scope="col">Campground</th>
                  {visibleNights.map((d) => (
                    <th scope="col" key={d}>
                      {dateLabel(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.key}>
                    <th scope="row">
                      <button onClick={() => openCamp(g.key)}>
                        {g.camp.name}
                      </button>
                    </th>
                    {visibleNights.map((date) => {
                      const cells = g.facilities.map((f) =>
                        f.nights.find((n) => n.date === date),
                      );
                      const fresh = cells.every(
                        (n) =>
                          n &&
                          clock >= Date.parse(n.checkedAt) &&
                          clock - Date.parse(n.checkedAt) < MAX_AGE_MS,
                      );
                      const count = fresh
                        ? cells.reduce((sum, n) => sum + (n?.sitesOpen ?? 0), 0)
                        : 0;
                      const label = !fresh
                        ? '?'
                        : count
                          ? String(count)
                          : cells.every((n) => n?.status === 'closed')
                            ? 'C'
                            : cells.every(
                                  (n) => n?.status === 'not_yet_released',
                                )
                              ? 'N'
                              : '—';
                      return (
                        <td key={date}>
                          <button
                            className={count ? styles.openNight : ''}
                            aria-label={`${g.camp.name}, ${dateLabel(date)}: ${label === '?' ? 'availability unknown' : `${label} recorded openings`}`}
                            onClick={() => {
                              applyDates(date, nextCampingDate(date));
                              openCamp(g.key, date);
                            }}
                          >
                            {label}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className={styles.results}>
          {rows.map((g) => (
            <article key={g.key} className={styles.card}>
              <div className={styles.cardIcon}>
                <EddyIcon name="campground" size={48} decorative />
              </div>
              <div className={styles.cardBody}>
                <p className={styles.eyebrow}>{g.camp.displayGroup.label}</p>
                <h3>
                  <button onPointerEnter={() => prefetchCamp(g.key)} onFocus={() => prefetchCamp(g.key)} onClick={() => openCamp(g.key)}>{g.camp.name}</button>
                </h3>
                <p
                  className={
                    g.answer.state === 'available'
                      ? styles.available
                      : styles.status
                  }
                >
                  {hasDates
                    ? loading
                      ? 'Checking availability…'
                      : stayLabel(g.answer)
                    : 'Choose dates to check your stay'}
                </p>
                <p className={styles.small}>
                  {g.facilities.length > 1
                    ? `${g.facilities.length} campground sections · `
                    : ''}
                  {g.camp.source === 'mo_state_parks'
                    ? 'Missouri State Parks'
                    : 'Recreation.gov'}
                </p>
              </div>
              <button
                className={styles.outline}
                onPointerEnter={() => prefetchCamp(g.key)}
                onFocus={() => prefetchCamp(g.key)}
                onClick={() => openCamp(g.key)}
              >
                View campground <span aria-hidden>→</span>
              </button>
            </article>
          ))}
        </div>
      )}
      {!loading && !rows.length && (
        <p className={styles.notice}>
          {availableOnly
            ? 'No confirmed openings with these filters. Other campgrounds may have incomplete data.'
            : 'No campgrounds match this search.'}{' '}
          <button
            onClick={() =>
              update({ q: null, river: null, types: null, available: null })
            }
          >
            Clear filters
          </button>
        </p>
      )}
      {!availableOnly && untracked.length > 0 && (
        <section className={styles.untracked}>
          <h2>More places to camp</h2>
          <p>
            Check directly with these campgrounds for dates and reservations.
          </p>
          <div>
            {untracked.map((c) => (
              <article key={`${c.place?.type}:${c.id}`}>
                <h3>{c.name}</h3>
                <p>{c.displayGroup.label}</p>
                {placeLink(c) && (
                  <Link href={placeLink(c)!}>View campground →</Link>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      <p className={styles.footnote}>
        Availability can change. Confirm dates, site rules and price with the
        booking provider. First-come sites cannot be reserved.
      </p>
      <dialog
        ref={detail}
        className={detailStyles.dialog}
        aria-labelledby="campground-title"
        onCancel={(e) => {
          e.preventDefault();
          closeCamp();
        }}
      >
        {selected && <CampgroundDetails key={`${selected.key}:${detailArrival}:${detailDeparture}`}
          camp={selected.camp} facilities={selected.facilities} arrival={detailArrival} departure={detailDeparture}
          filters={filters} clock={clock} close={closeCamp} />}
      </dialog>
    </div>
  );
}
