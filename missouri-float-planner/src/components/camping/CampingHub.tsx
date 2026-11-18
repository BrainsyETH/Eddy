"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ConditionBadge from "@/components/ui/ConditionBadge";
import { EddyIcon } from "@/components/ui/EddyIcon";
import { useQuery } from "@tanstack/react-query";
import type {
  CampingOverview,
  CampingPlace,
} from '@/lib/camping/overview-types';
import { nextCampingDate } from '../../../shared/camping-stay';
import {
  campingMileLabel,
  campingRiverMile,
  campingRiverNow,
  campingRiverOrdered,
  orderCampingAlongRiver,
} from '../../../shared/camping-rivers';
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
import CampgroundPhoto from './CampgroundPhoto';
import detailStyles from './CampgroundDetails.module.css';
import { loadCampgroundSites } from '@/lib/camping/web-detail-cache';
import { loadCampingRivers } from '@/lib/camping/web-rivers';
import { MAX_AGE_MS } from '@/lib/camping/freshness';
import { trackEvent } from '@/lib/analytics';

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const unknown = { state: "unknown", count: 0, partial: true } as const;
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
  const { horizon, weekend } = useMemo(() => webPlanningWindow(clock), [clock]);
  const [arrival, setArrival] = useState(params.get("arrival") ?? "");
  const [departure, setDeparture] = useState(params.get("departure") ?? "");
  const [error, setError] = useState("");
  const [response, setResponse] = useState<RegionalStay | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [offset, setOffset] = useState(0);
  const detail = useRef<HTMLDialogElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const detailPushed = useRef(false);
  // A select keeps focus after a mouse or touch pick, so its focus ring stayed
  // on screen like a lasting state. Release it then; a keyboard pick keeps focus.
  const pointerPick = useRef(false);
  const releaseAfterPointer = {
    onPointerDown: () => {
      pointerPick.current = true;
    },
    onKeyDown: () => {
      pointerPick.current = false;
    },
    onBlur: () => {
      pointerPick.current = false;
    },
  };
  const released = (select: HTMLSelectElement) => {
    if (pointerPick.current) select.blur();
  };
  const groups = useMemo(() => groupCampgrounds(overview.tracked), [overview]);
  const requestedRiver = params.get("river") ?? "";
  // Conditions arrive after the campgrounds; the hub is complete without them.
  // Only a selected river shows them, so nothing is requested across all rivers.
  const { data: riverSnapshot, isPending: riversPending, dataUpdatedAt } = useQuery({
    queryKey: ["camping", "rivers"],
    queryFn: ({ signal }) => loadCampingRivers(signal),
    enabled: Boolean(requestedRiver),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  const riverList = riverSnapshot?.rivers;
  const riverDirectory = new Map([
    ...(riverList ?? []).map((r) => [r.slug, r] as const),
    ...(overview.rivers ?? []).map((r) => [r.slug, r] as const),
  ]);
  const campgroundRivers = new Set(
    [...overview.tracked, ...overview.untracked].flatMap((c) => c.riverSlugs),
  );
  // A slug that names no river is not a filter: it would otherwise put an
  // invented river, with links to pages that do not exist, in the control.
  const river =
    campgroundRivers.has(requestedRiver) || riverDirectory.has(requestedRiver)
      ? requestedRiver
      : "";
  const search = params.get("q") ?? "";
  const filters = (params.get("types") ?? "")
    .split(",")
    .filter((v): v is WebSiteFilter =>
      WEB_FILTERS.includes(v as WebSiteFilter),
    );
  const availableOnly = params.get("available") === "1";
  const appliedArrival = params.get("arrival") ?? "",
    appliedDeparture = params.get("departure") ?? "";
  const stay = parseWebStay(
    new URLSearchParams({
      arrival: appliedArrival,
      departure: appliedDeparture,
    }),
    horizon,
  );
  const hasDates = Boolean(appliedArrival || appliedDeparture);
  const tonightSelected =
    appliedArrival === horizon.startDate &&
    appliedDeparture === nextCampingDate(horizon.startDate);
  const weekendSelected =
    appliedArrival === weekend.startDate && appliedDeparture === weekend.endDate;
  const calendar = params.get("view") === "calendar";
  // An explicit choice survives date/filter changes and shared URLs. With no
  // choice, dates prioritise openings; browsing one river follows its course.
  const requestedSort = params.get("sort");
  const explicitSort = requestedSort === "river" || requestedSort === "available" ? requestedSort : null;
  // River order needs positions to order by. A river whose campgrounds have no
  // river mile keeps openings-then-name order and offers no sort.
  const riverOrderable =
    !!river &&
    campingRiverOrdered(
      groups
        .filter((g) => g.facilities.some((c) => c.riverSlugs.includes(river)))
        .map((g) => g.camp),
      river,
    );
  const sort = riverOrderable && (explicitSort === "river" || (!explicitSort && !stay))
    ? "river" : "available";
  const hasFilters = Boolean(
    search || river || filters.length || availableOnly,
  );
  const selected =
    hasDates && !stay
      ? undefined
      : groups.find(
          (g) =>
            g.key === params.get("campground") ||
            g.facilities.some((f) => f.facilityId === params.get("facility")),
        );
  const selectedKey = selected?.key;
  const detailArrival =
    stay?.arrival ??
    (horizon.nights.includes(params.get("night") ?? "")
      ? params.get("night")!
      : horizon.startDate);
  const detailDeparture = stay?.departure ?? nextCampingDate(detailArrival);
  const current =
    response?.arrival === appliedArrival &&
    response.departure === appliedDeparture
      ? response
      : null;
  const summaries = new Map(current?.facilities.map((f) => [f.facilityId, f]));
  // A campground may span rivers; its primary label must not rename the others.
  const riverNames = new Map(
    [...overview.tracked, ...overview.untracked]
      .filter((c) => c.displayGroup.key !== "other")
      .map((c) => [c.displayGroup.key, c.displayGroup.label]),
  );
  const riverNow = river ? campingRiverNow(riverList, river, Math.max(clock, dataUpdatedAt), riverSnapshot?.receivedAt) : null;
  const rivers = [
    ...new Set([
      ...campgroundRivers,
      // A link from a river with no campgrounds listed keeps its name in the
      // control instead of reading "All rivers" over an empty list.
      ...(river ? [river] : []),
    ]),
  ]
    .map(
      (slug) =>
        [
          slug,
          riverDirectory.get(slug)?.name ?? riverNames.get(slug) ??
            slug.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
        ] as const,
    )
    .sort((a, b) => a[1].localeCompare(b[1]));
  const riverName = rivers.find(([slug]) => slug === river)?.[1];
  const riverPage = riverDirectory.get(river)?.path ?? `/rivers/${encodeURIComponent(river)}`;
  function update(values: Record<string, string | null>, push = false) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setQuery(next.toString());
    const url = `/camping${next.size ? `?${next}` : ""}`;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
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
      setError("Choose 1–14 nights within the next 90 nights.");
      return;
    }
    setError("");
    setArrival(a);
    setDeparture(d);
    trackEvent("camping_search", {
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
      view: params.get("view") || "list",
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
    const syncHistory = () =>
      setQuery(new URLSearchParams(window.location.search).toString());
    window.addEventListener("popstate", syncHistory);
    return () => window.removeEventListener("popstate", syncHistory);
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
    window.addEventListener("focus", refreshClock);
    document.addEventListener("visibilitychange", refreshClock);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshClock);
      document.removeEventListener("visibilitychange", refreshClock);
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
    setError("");
    fetch(
      `/api/camping/stay?${new URLSearchParams({ arrival: appliedArrival, departure: appliedDeparture })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 400
              ? "Choose 1–14 nights within the next 90 nights."
              : "Availability could not be checked. Try again.",
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
      document.body.style.overflow = "hidden";
    } else {
      detail.current?.close();
      lastFocus.current?.focus();
    }
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selectedKey]);
  useEffect(() => {
    const day = Math.floor(
      (Date.parse(appliedArrival) - Date.parse(horizon.startDate)) / 86_400_000,
    );
    if (Number.isFinite(day) && day >= 0 && day < 90)
      setOffset(Math.floor(day / 14) * 14);
  }, [appliedArrival, horizon.startDate]);
  const clearFilters = () =>
    update({ q: null, river: null, types: null, available: null });
  const matches = (c: CampingPlace) =>
    (!river || c.riverSlugs.includes(river)) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()));
  const found = groups
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
    .filter((g) => g.answer.state !== "no_match")
    .filter((g) => !availableOnly || g.answer.state === "available");
  const rows = sort === "river"
    ? orderCampingAlongRiver(found, river, (g) => g.camp)
    : [...found].sort(
        (a, b) =>
          Number(b.answer.state === "available") -
            Number(a.answer.state === "available") ||
          a.camp.name.localeCompare(b.camp.name),
      );
  const alongRiver =
    sort === "river" &&
    campingRiverOrdered(
      rows.map((g) => g.camp),
      river,
    );
  // Unknown positions are a separate group, never presented as farther downriver.
  const firstUnmeasured = sort === "river" && rows.some((g) => campingRiverMile(g.camp, river) !== null)
    ? rows.find((g) => campingRiverMile(g.camp, river) === null)?.key
    : undefined;
  const untracked = river
    ? orderCampingAlongRiver(overview.untracked.filter(matches), river, (c) => c)
    : overview.untracked.filter(matches);
  const visibleNights = horizon.nights.slice(offset, offset + 14);
  return (
    <div className={styles.hub}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Stay by the river</p>
          <h1>Find your next campsite.</h1>
          <p>Find a campground along your river.</p>
        </div>
        <EddyIcon name="campfire" size={110} decorative />
      </header>
      <section className={styles.searchPanel} aria-label="Find a campground">
        <form
          className={styles.search}
          onSubmit={(e) => {
            e.preventDefault();
            applyDates(arrival, departure);
          }}
        >
          <label className={styles.riverField}>
            <span>
              <EddyIcon name="river" size={18} decorative /> River
            </span>
            <select
              value={river}
              {...releaseAfterPointer}
              onChange={(e) => {
                update({ river: e.target.value });
                released(e.currentTarget);
              }}
            >
              <option value="">All rivers</option>
              {rivers.map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </select>
          </label>
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
              min={arrival ? nextCampingDate(arrival) : horizon.startDate}
              max={horizon.endDateExclusive}
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
              required
            />
          </label>
          <button className={styles.primary}>
            Find campsites <span aria-hidden>→</span>
          </button>
        </form>
        <div className={styles.shortcuts}>
          <button
            type="button"
            aria-pressed={tonightSelected}
            onClick={() => {
              const tonight = webPlanningWindow(Date.now()).horizon.startDate;
              applyDates(tonight, nextCampingDate(tonight));
            }}
          >
            Tonight
          </button>
          <button
            type="button"
            aria-pressed={weekendSelected}
            onClick={() => {
              const weekend = webPlanningWindow(Date.now()).weekend;
              applyDates(weekend.startDate, weekend.endDate);
            }}
          >
            This weekend
          </button>
          {hasDates && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => {
                setArrival("");
                setDeparture("");
                setError("");
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
          <span>Up to 14 nights</span>
        </div>
        <div className={styles.filterBar}>
          <label className={styles.nameSearch}>
            <span className="sr-only">Search campgrounds</span>
            <input
              type="search"
              placeholder="Search campgrounds"
              value={search}
              onChange={(e) => update({ q: e.target.value })}
            />
          </label>
          <div className={styles.chips}>
            {hasDates && (
              <>
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
                          ).join(","),
                        })
                      }
                    >
                      {filters.includes(filter) && <span aria-hidden>✓ </span>}
                      {filter}
                    </button>
                  ),
                )}
                <label
                  className={styles.availabilityFilter}
                  data-active={availableOnly}
                >
                  <input
                    type="checkbox"
                    checked={availableOnly}
                    disabled={!current || loading}
                    onChange={(e) =>
                      update({ available: e.target.checked ? "1" : null })
                    }
                  />
                  Available for my stay
                </label>
              </>
            )}
            {hasFilters && (
              <button className={styles.clear} onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      </section>
      {river && riverName && (
        <section className={styles.riverNow} aria-label={`${riverName} now`}>
          <div className={styles.riverReading}>
            <Link href={riverPage} className={styles.riverName}>
              <EddyIcon name="river" size={20} decorative />
              {riverName}
              <span className="sr-only"> conditions</span>
            </Link>
            <p className={styles.riverStatus}>
              <span>Now</span>
              {riverNow?.condition ? (
                <>
                  <ConditionBadge code={riverNow.condition.code} />
                  {riverNow.condition.trend && (
                    <span>{riverNow.condition.trend}</span>
                  )}
                </>
              ) : (
                <span>
                  {riversPending ? "Checking…" : "Conditions unavailable"}
                </span>
              )}
            </p>
          </div>
          <Link className={styles.riverPlan} href={`/plan?river=${encodeURIComponent(river)}`}>
            Plan a float <span aria-hidden>→</span>
          </Link>
        </section>
      )}
      {error && (
        <p className={styles.notice} role="alert">
          {error} <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </p>
      )}
      <div className={styles.resultHeading}>
        <div aria-live="polite" aria-atomic="true">
          <h2>
            {loading
              ? "Checking your dates…"
              : `${rows.length} ${rows.length === 1 ? "campground" : "campgrounds"}`}
          </h2>
          <p>
            {stay
              ? `${dateLabel(stay.arrival)} – ${dateLabel(stay.departure)} · ${stay.nights.length} ${stay.nights.length === 1 ? "night" : "nights"}`
              : alongRiver
                ? "Choose dates to check availability"
                : "Choose dates to check availability."}
            {alongRiver && " · Upstream to downstream"}
          </p>
        </div>
        <div className={styles.resultControls}>
          {riverOrderable && (
            <label className={styles.sort}>
              <span className="sr-only">Sort campgrounds</span>
              <select
                value={sort}
                {...releaseAfterPointer}
                onChange={(e) => {
                  update({ sort: e.target.value });
                  released(e.currentTarget);
                }}
              >
                <option value="available">Available first</option>
                <option value="river">Along the river</option>
              </select>
            </label>
          )}
          <div className={styles.views} role="group" aria-label="Result view">
            <button
              aria-pressed={!calendar}
              onClick={() => update({ view: "list" })}
            >
              Cards
            </button>
            <button
              aria-pressed={calendar}
              onClick={() => update({ view: "calendar" })}
            >
              Calendar
            </button>
          </div>
        </div>
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
          <div className={styles.calendarKey}>
            <ul className={styles.legend} aria-label="Calendar key">
              <li>
                <span className={styles.openSwatch} aria-hidden>
                  3
                </span>{" "}
                Open sites
              </li>
              <li>
                <span aria-hidden>—</span> None recorded
              </li>
              <li>
                <span aria-hidden>C</span> Closed
              </li>
              <li>
                <span aria-hidden>N</span> Not released
              </li>
              <li>
                <span aria-hidden>?</span> Unknown
              </li>
            </ul>
            <details className={styles.calendarHelp}>
              <summary>About these counts</summary>
              <p>
                Counts are per night, across all site types. Missing information
                can look like no recorded openings. Search your dates to find
                one site for every night.
              </p>
            </details>
          </div>
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
                    <th
                      scope="col"
                      key={d}
                      data-selected={Boolean(
                        stay && d >= stay.arrival && d < stay.departure,
                      )}
                    >
                      <span>
                        {new Date(`${d}T12:00:00Z`).toLocaleDateString(
                          "en-US",
                          { weekday: "short", timeZone: "UTC" },
                        )}
                      </span>
                      <strong>{Number(d.slice(-2))}</strong>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                    <Fragment key={g.key}>
                      {g.key === firstUnmeasured && (
                        <tr className={styles.calendarGroup}>
                          <td colSpan={visibleNights.length + 1}>More campgrounds</td>
                        </tr>
                      )}
                      <tr>
                        <th scope="row">
                          <button
                            className={styles.calendarCamp}
                            onClick={() => openCamp(g.key)}
                          >
                            <CampgroundPhoto
                              src={g.facilities.find((f) => f.imageUrl)?.imageUrl}
                              name={g.camp.name}
                              compact
                            />
                            <span>{g.camp.name}
                              {river && campingRiverMile(g.camp, river) !== null && (
                                <small className={styles.calendarMile}>{campingMileLabel(campingRiverMile(g.camp, river)!)}</small>
                              )}
                            </span>
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
                          ? "?"
                          : count
                            ? String(count)
                            : cells.every((n) => n?.status === "closed")
                              ? "C"
                              : cells.every(
                                    (n) => n?.status === "not_yet_released",
                                  )
                                ? "N"
                                : "—";
                        return (
                          <td
                            key={date}
                            data-selected={Boolean(
                              stay &&
                                date >= stay.arrival &&
                                date < stay.departure,
                            )}
                          >
                            <button
                              className={count ? styles.openNight : ""}
                              aria-label={`${g.camp.name}, ${dateLabel(date)}: ${label === "?" ? "availability unknown" : label === "C" ? "closed" : label === "N" ? "dates not released" : label === "—" ? "no recorded openings" : `${label} recorded openings`}`}
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
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className={styles.results}>
          {rows.map((g) => {
            const mile = river ? campingRiverMile(g.camp, river) : null;
            return (
            <Fragment key={g.key}>
            {g.key === firstUnmeasured && <h3 className={styles.moreHeading}>More campgrounds</h3>}
            <article className={styles.card}>
              <CampgroundPhoto
                src={g.facilities.find((f) => f.imageUrl)?.imageUrl}
                name={g.camp.name}
              />
              <div className={styles.cardBody}>
                <div className={styles.cardRiver}>
                  <p className={styles.eyebrow}>{mile !== null ? riverName : g.camp.displayGroup.label}</p>
                  {mile !== null && <span className={styles.small}>{campingMileLabel(mile)}</span>}
                </div>
                <h3>
                  <button onPointerEnter={() => prefetchCamp(g.key)} onFocus={() => prefetchCamp(g.key)} onClick={() => openCamp(g.key)}>{g.camp.name}</button>
                </h3>
                <p
                  className={
                    g.answer.state === "available"
                      ? styles.available
                      : styles.status
                  }
                >
                  {hasDates
                    ? loading
                      ? "Checking availability…"
                      : g.answer.state === "available"
                        ? `${g.answer.partial ? "At least " : ""}${g.answer.count} ${g.answer.count === 1 ? "site" : "sites"} available`
                        : stayLabel(g.answer)
                    : "Choose dates for availability"}
                </p>
                <p className={styles.small}>
                  {g.facilities.length > 1
                    ? `${g.facilities.length} campground sections · `
                    : ""}
                  {g.camp.source === "mo_state_parks"
                    ? "Missouri State Parks"
                    : "Recreation.gov"}
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
            </Fragment>
            );
          })}
        </div>
      )}
      {!loading && !rows.length && (
        <p className={styles.notice}>
          {availableOnly
            ? "No confirmed openings with these filters. Other campgrounds may have incomplete data."
            : "No campgrounds match this search."}{" "}
          Adjust your filters above to see more campgrounds.
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
                <CampgroundPhoto src={c.imageUrl} name={c.name} compact />
                <div>
                  <h3>{c.name}</h3>
                  <p>{c.displayGroup.label}</p>
                  {placeLink(c) && (
                    <Link href={placeLink(c)!}>View campground →</Link>
                  )}
                </div>
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
