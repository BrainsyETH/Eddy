'use client';

// src/components/gauge/RiverReportsGrid.tsx
// Status-first river index: condition + facet filters, search, and sort over
// live river cards. This is the body of the River Reports dashboard, rendered on
// /rivers. Gauge data is fetched client-side; per-river metadata (state, type,
// difficulty, length) arrives as a prop from the server page and drives the
// facet filters. All filter/sort state is mirrored in the URL.

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, X, ChevronDown, MapPin } from 'lucide-react';

import type { ConditionCode } from '@/types/api';
import { useGaugeHistoryPrefetch } from '@/hooks/useGaugeHistory';
import { useRiverGroups } from '@/hooks/useRiverGroups';
import type { RiverGroup } from '@/lib/river-groups';
import RiverCard from '@/components/gauge/RiverCard';
import { conditionColor, CONDITION_SYSTEM, summarizeConditionCounts } from '@shared/condition-system';
import {
  type RiverFilterMeta,
  type DifficultyTier,
  type LengthBucket,
  type RiverSortKey,
  DIFFICULTY_TIER_LABELS,
  DIFFICULTY_TIER_ORDER,
  LENGTH_BUCKET_LABELS,
  LENGTH_BUCKET_ORDER,
  SORT_LABELS,
  SORT_ORDER,
  DEFAULT_SORT,
  isRiverSortKey,
  riverTypeLabel,
  lengthBucket,
  conditionSortRank,
  isFloatableNow,
  haversineMiles,
  isValidCoords,
} from '@/lib/rivers/filters';

type GeoStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unsupported';

// Full names for the states we serve (falls back to the raw code).
const STATE_NAMES: Record<string, string> = {
  MO: 'Missouri',
  AR: 'Arkansas',
  KS: 'Kansas',
  OK: 'Oklahoma',
  IL: 'Illinois',
  TN: 'Tennessee',
  KY: 'Kentucky',
  IA: 'Iowa',
};

interface RiverReportsGridProps {
  /** id → metadata map for facet filtering. Absent keys just skip meta filters. */
  riverMeta?: Record<string, RiverFilterMeta>;
}

interface FacetOption {
  value: string;
  label: string;
}

/** Native <select> styled as a filter chip; highlights when a value is set. */
function FacetSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: FacetOption[];
  onChange: (value: string) => void;
}) {
  const active = value !== 'all';
  return (
    <div className="relative w-full sm:w-auto">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none w-full sm:w-auto sm:min-w-[8rem] rounded-lg border pl-3 pr-8 py-2 text-sm font-medium cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
          active
            ? 'border-primary-400 bg-primary-50 text-primary-800'
            : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
        }`}
      >
        <option value="all">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
    </div>
  );
}

export default function RiverReportsGrid({ riverMeta = {} }: RiverReportsGridProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { riverGroups, isLoading } = useRiverGroups();
  const prefetchHistory = useGaugeHistoryPrefetch();

  const initialFloatable = searchParams.get('floatable') === '1';
  const [floatableNow, setFloatableNow] = useState(initialFloatable);
  // Floatable-now and a specific condition are mutually exclusive; floatable wins.
  const [selectedCondition, setSelectedCondition] = useState<ConditionCode | 'all'>(
    initialFloatable ? 'all' : ((searchParams.get('condition') as ConditionCode) || 'all')
  );
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [selectedState, setSelectedState] = useState(searchParams.get('state') || 'all');
  const [selectedType, setSelectedType] = useState(searchParams.get('type') || 'all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyTier | 'all'>(
    (searchParams.get('diff') as DifficultyTier) || 'all'
  );
  const [selectedLength, setSelectedLength] = useState<LengthBucket | 'all'>(
    (searchParams.get('len') as LengthBucket) || 'all'
  );
  const [sortBy, setSortBy] = useState<RiverSortKey>(() => {
    const s = searchParams.get('sort');
    return isRiverSortKey(s) ? s : DEFAULT_SORT;
  });

  // Geolocation for the "Nearest me" sort. Location lives in component state
  // only (never the URL) — a shared ?sort=nearest link re-asks each visitor
  // rather than leaking a position.
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('unsupported');
      return;
    }
    setGeoStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus('granted');
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  // Ask for location the first time "Nearest me" is chosen (including from a
  // ?sort=nearest deep link). Denials aren't auto-retried — the status line
  // offers a manual retry instead.
  useEffect(() => {
    if (sortBy === 'nearest' && !userLocation && geoStatus === 'idle') {
      requestLocation();
    }
  }, [sortBy, userLocation, geoStatus, requestLocation]);

  // Deep-link: ?gauge= redirects to the river hub (via the legacy gauge route)
  useEffect(() => {
    const gaugeParam = searchParams.get('gauge');
    if (gaugeParam) {
      router.replace(`/gauges/${gaugeParam}`);
    }
  }, [searchParams, router]);

  // Persist filter state in URL (only non-default values, for clean links)
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const setOrDelete = (key: string, value: string, isDefault: boolean) => {
      if (isDefault) params.delete(key);
      else params.set(key, value);
    };
    setOrDelete('condition', selectedCondition, floatableNow || selectedCondition === 'all');
    setOrDelete('floatable', '1', !floatableNow);
    setOrDelete('q', searchQuery, searchQuery === '');
    setOrDelete('state', selectedState, selectedState === 'all');
    setOrDelete('type', selectedType, selectedType === 'all');
    setOrDelete('diff', selectedDifficulty, selectedDifficulty === 'all');
    setOrDelete('len', selectedLength, selectedLength === 'all');
    setOrDelete('sort', sortBy, sortBy === DEFAULT_SORT);
    // Remove legacy params
    params.delete('riverFilter');
    params.delete('group');
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [selectedCondition, floatableNow, searchQuery, selectedState, selectedType, selectedDifficulty, selectedLength, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefetch history for primary gauges
  useEffect(() => {
    if (riverGroups.length === 0) return;
    const timeout = setTimeout(() => {
      const siteIds = riverGroups.slice(0, 9).map(g => g.primaryGauge.usgsSiteId);
      // Match the 14-day window the cards render so the prefetch warms the same
      // React Query cache key (and coalesces into one request per gauge).
      prefetchHistory(siteIds, 14);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [riverGroups, prefetchHistory]);

  // Available facet options, derived from the rivers actually present so a facet
  // only appears once there's something to choose between (>= 2 values).
  const facets = useMemo(() => {
    const states = new Set<string>();
    const types = new Set<string>();
    const diffs = new Set<DifficultyTier>();
    const lens = new Set<LengthBucket>();
    for (const river of riverGroups) {
      const m = riverMeta[river.riverId];
      if (!m) continue;
      if (m.state) states.add(m.state);
      if (m.riverType) types.add(m.riverType);
      if (m.difficultyTier) diffs.add(m.difficultyTier);
      const bucket = lengthBucket(m.lengthMiles);
      if (bucket) lens.add(bucket);
    }
    return {
      states: Array.from(states).sort().map((s) => ({ value: s, label: STATE_NAMES[s] ?? s })),
      types: Array.from(types).map((t) => ({ value: t, label: riverTypeLabel(t) ?? t })),
      diffs: DIFFICULTY_TIER_ORDER.filter((d) => diffs.has(d)).map((d) => ({ value: d, label: DIFFICULTY_TIER_LABELS[d] })),
      lens: LENGTH_BUCKET_ORDER.filter((l) => lens.has(l)).map((l) => ({ value: l, label: LENGTH_BUCKET_LABELS[l] })),
    };
  }, [riverGroups, riverMeta]);

  // Distance (miles) from the visitor to each river's primary gauge, once we
  // have a location. Drives the "Nearest me" sort and the per-card "X mi away".
  const distanceByRiverId = useMemo(() => {
    const map: Record<string, number> = {};
    if (!userLocation) return map;
    for (const river of riverGroups) {
      const coords = river.primaryGauge?.coordinates;
      if (isValidCoords(coords)) map[river.riverId] = haversineMiles(userLocation, coords);
    }
    return map;
  }, [userLocation, riverGroups]);

  // Filter + sort
  const filteredRivers = useMemo(() => {
    const filtered = riverGroups.filter(river => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = river.riverName.toLowerCase().includes(q);
        const gaugeMatch = river.allGauges.some(g => g.name.toLowerCase().includes(q));
        if (!nameMatch && !gaugeMatch) return false;
      }
      // Condition: "floatable now" (canonical floatable set) or a single pill
      if (floatableNow) {
        if (!isFloatableNow(river.condition.code)) return false;
      } else if (selectedCondition !== 'all') {
        if (river.condition.code !== selectedCondition) return false;
      }
      // Metadata facets
      const m = riverMeta[river.riverId];
      if (selectedState !== 'all' && m?.state !== selectedState) return false;
      if (selectedType !== 'all' && m?.riverType !== selectedType) return false;
      if (selectedDifficulty !== 'all' && m?.difficultyTier !== selectedDifficulty) return false;
      if (selectedLength !== 'all' && lengthBucket(m?.lengthMiles) !== selectedLength) return false;
      return true;
    });

    const lenOf = (id: string) => riverMeta[id]?.lengthMiles ?? null;
    const byName = (a: RiverGroup, b: RiverGroup) => a.riverName.localeCompare(b.riverName);
    // "Nearest me" needs a location; until one arrives (locating, denied, or
    // unsupported) fall back to best-first so the list still reads sensibly.
    const effectiveSort: RiverSortKey = sortBy === 'nearest' && !userLocation ? 'best' : sortBy;

    return [...filtered].sort((a, b) => {
      switch (effectiveSort) {
        case 'nearest':
          // Rivers with an unknown distance sink to the bottom.
          return (distanceByRiverId[a.riverId] ?? Infinity) - (distanceByRiverId[b.riverId] ?? Infinity) || byName(a, b);
        case 'name':
          return byName(a, b);
        case 'length_desc':
          // Nulls sink to the bottom regardless of direction.
          return (lenOf(b.riverId) ?? -Infinity) - (lenOf(a.riverId) ?? -Infinity) || byName(a, b);
        case 'length_asc':
          return (lenOf(a.riverId) ?? Infinity) - (lenOf(b.riverId) ?? Infinity) || byName(a, b);
        case 'best':
        default:
          return conditionSortRank(a.condition.code) - conditionSortRank(b.condition.code) || byName(a, b);
      }
    });
  }, [riverGroups, riverMeta, searchQuery, floatableNow, selectedCondition, selectedState, selectedType, selectedDifficulty, selectedLength, sortBy, userLocation, distanceByRiverId]);

  // Stats for condition pills (count rivers, not gauges). Uses the canonical
  // shared calculation so these counts always agree with the hero summary —
  // "Floatable now" is flowing/good only; high stays in caution language.
  const stats = useMemo(
    () => summarizeConditionCounts(riverGroups.map(river => river.condition.code)),
    [riverGroups],
  );

  const floatableCount = stats.floatableNow;

  // Choosing a specific condition and "floatable now" are mutually exclusive.
  const pickCondition = (code: ConditionCode) => {
    setFloatableNow(false);
    setSelectedCondition(prev => (prev === code ? 'all' : code));
  };
  const toggleFloatable = () => {
    setSelectedCondition('all');
    setFloatableNow(prev => !prev);
  };

  const clearFilters = () => {
    setSelectedCondition('all');
    setFloatableNow(false);
    setSearchQuery('');
    setSelectedState('all');
    setSelectedType('all');
    setSelectedDifficulty('all');
    setSelectedLength('all');
    // Sort is a view preference, not a filter — leave it as chosen.
  };

  const hasActiveFilters =
    selectedCondition !== 'all' ||
    floatableNow ||
    searchQuery !== '' ||
    selectedState !== 'all' ||
    selectedType !== 'all' ||
    selectedDifficulty !== 'all' ||
    selectedLength !== 'all';

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
          <div className="flex gap-3">
            <div className="skeleton h-10 flex-1 max-w-xs rounded-lg" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-7 w-20 rounded-full" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-neutral-200 p-5 h-48" />
          ))}
        </div>
      </div>
    );
  }

  const hasFacets =
    facets.states.length >= 2 ||
    facets.types.length >= 2 ||
    facets.diffs.length >= 2 ||
    facets.lens.length >= 2;

  return (
    <>
      {/* Filter Bar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 space-y-3">
        {/* Row 1: Search + Sort + Clear */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-3">
          <div className="relative flex-1 min-w-0 md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rivers..."
              aria-label="Search rivers"
              className="w-full pl-9 pr-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto md:ml-auto">
            <label htmlFor="river-sort" className="text-xs font-medium text-neutral-500 whitespace-nowrap shrink-0">
              Sort by
            </label>
            <div className="relative flex-1 md:flex-none">
              <select
                id="river-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as RiverSortKey)}
                className="appearance-none w-full md:w-auto rounded-lg border border-neutral-300 bg-white text-neutral-700 pl-3 pr-8 py-2 text-sm font-medium cursor-pointer transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {SORT_ORDER.map((key) => (
                  <option key={key} value={key}>{SORT_LABELS[key]}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Clear</span>
                <span className="sr-only sm:hidden">Clear filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Floatable-now shortcut + condition pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Keep the chip and its divider together so the rule can't detach
              onto its own line when the pills wrap; hide it on mobile. */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleFloatable}
              aria-pressed={floatableNow}
              title="Rivers at Flowing or Good — positive float conditions today. High water is counted separately under High."
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                floatableNow ? 'shadow-sm' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
              style={floatableNow ? { backgroundColor: conditionColor('flowing'), color: '#1A1814' } : undefined}
            >
              {!floatableNow && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
              Floatable now
              <span className={`tabular-nums ${floatableNow ? 'text-black/60' : 'text-neutral-500'}`}>{floatableCount}</span>
            </button>
            <span className="hidden sm:block h-5 w-px bg-neutral-200" aria-hidden="true" />
          </div>

          {([
            { key: 'too_low' as ConditionCode, count: stats.byCode.too_low, label: 'Too Low', dot: 'bg-neutral-500' },
            { key: 'low' as ConditionCode, count: stats.byCode.low, label: 'Low', dot: 'bg-yellow-500' },
            { key: 'good' as ConditionCode, count: stats.byCode.good, label: 'Good', dot: 'bg-lime-500' },
            { key: 'flowing' as ConditionCode, count: stats.byCode.flowing, label: 'Flowing', dot: 'bg-emerald-500' },
            { key: 'high' as ConditionCode, count: stats.byCode.high, label: 'High', dot: 'bg-orange-500' },
            { key: 'dangerous' as ConditionCode, count: stats.byCode.dangerous, label: 'Flood', dot: 'bg-red-500' },
          ]).map(stat => {
            const isActive = !floatableNow && selectedCondition === stat.key;
            return (
              <button
                key={stat.key}
                onClick={() => pickCondition(stat.key)}
                aria-pressed={isActive}
                title={CONDITION_SYSTEM[stat.key].description}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  isActive
                    ? 'shadow-sm'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
                // Near-black ink on the solid condition fill — white text is
                // illegible on the light conditions (low/good/flowing).
                style={isActive ? { backgroundColor: conditionColor(stat.key), color: '#1A1814' } : undefined}
              >
                {!isActive && <span className={`w-2 h-2 rounded-full ${stat.dot}`} />}
                {stat.label}
                <span className={`tabular-nums ${isActive ? 'text-black/60' : 'text-neutral-500'}`}>{stat.count}</span>
              </button>
            );
          })}
        </div>

        {/* Row 3: Metadata facets (only shown once there's something to choose) */}
        {hasFacets && (
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-neutral-100 sm:flex sm:flex-wrap sm:items-center">
            {facets.states.length >= 2 && (
              <FacetSelect label="Filter by state" allLabel="All states" value={selectedState} options={facets.states} onChange={setSelectedState} />
            )}
            {facets.types.length >= 2 && (
              <FacetSelect label="Filter by river type" allLabel="All river types" value={selectedType} options={facets.types} onChange={setSelectedType} />
            )}
            {facets.diffs.length >= 2 && (
              <FacetSelect label="Filter by difficulty" allLabel="All difficulties" value={selectedDifficulty} options={facets.diffs} onChange={(v) => setSelectedDifficulty(v as DifficultyTier | 'all')} />
            )}
            {facets.lens.length >= 2 && (
              <FacetSelect label="Filter by length" allLabel="Any length" value={selectedLength} options={facets.lens} onChange={(v) => setSelectedLength(v as LengthBucket | 'all')} />
            )}
          </div>
        )}
      </div>

      {/* Result count + "nearest me" status */}
      {riverGroups.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-4 text-sm text-neutral-500">
          <p>
            Showing <span className="font-semibold text-neutral-700">{filteredRivers.length}</span> of {riverGroups.length} rivers
          </p>
          {sortBy === 'nearest' && geoStatus === 'locating' && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" /> Finding rivers near you…
            </span>
          )}
          {sortBy === 'nearest' && geoStatus === 'granted' && (
            <span className="inline-flex items-center gap-1 text-primary-600">
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> Sorted by distance from you
            </span>
          )}
          {sortBy === 'nearest' && geoStatus === 'denied' && (
            <span className="inline-flex items-center gap-1">
              Location off — showing best conditions.
              <button onClick={requestLocation} className="font-semibold text-primary-600 hover:text-primary-700 underline">
                Try again
              </button>
            </span>
          )}
          {sortBy === 'nearest' && geoStatus === 'unsupported' && (
            <span>Location isn&rsquo;t available on this device — showing best conditions.</span>
          )}
        </div>
      )}

      {/* River Cards */}
      {filteredRivers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredRivers.map((river) => (
            <RiverCard
              key={river.riverId}
              riverGroup={river}
              meta={riverMeta[river.riverId]}
              distanceMiles={distanceByRiverId[river.riverId] ?? null}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <p className="text-neutral-600">No rivers match your current filters.</p>
          <button
            onClick={clearFilters}
            className="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      )}
    </>
  );
}
