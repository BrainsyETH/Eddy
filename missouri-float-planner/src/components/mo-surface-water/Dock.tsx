'use client';

// Data dock for /river-map — the "rich data" half of the
// map experience. Everything in the dock is wired to the map: hovering a
// river row lights its reach up, clicking pins it, and when the timeline
// is scrubbed the rows repaint to that day. Desktop: a fixed left panel.
// Mobile: a slide-in drawer behind a floating live chip.

import { useMemo, useRef, useState } from 'react';
import {
  STAGE_VERDICTS,
  classifyPercentile,
  type MORiver,
  type StageVerdict,
} from '@/lib/usgs/mo-statewide-data';
import { CONDITION_ORDER } from '@shared/condition-system';
import type { MoHistoryBundleEntry } from '@/app/api/usgs/mo-history-bundle/route';
import { FLOATABLE } from './derive';
import { useCountUp, useInView, usePrefersReducedMotion } from './fx';

type SortKey = 'verdict' | 'name' | 'flow' | 'trend';
const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'verdict', label: 'Best' },
  { key: 'name', label: 'A–Z' },
  { key: 'flow', label: 'Flow' },
  { key: 'trend', label: 'Rising' },
];

const MONO = 'var(--font-mono), ui-monospace, monospace';
const DISPLAY = 'var(--font-display), system-ui, sans-serif';
const SANS = 'var(--font-body), system-ui, sans-serif';
const PARCH = '#F2EAD8';
const PARCH_DIM = 'rgba(242,234,216,0.6)';
const PARCH_FAINT = 'rgba(242,234,216,0.38)';

export interface DockRiverReading {
  /** Stage/discharge value for the scrubbed day (or live when today). */
  value: number | null;
  unit: 'ft' | 'cfs';
  dischargeCfs: number | null;
  /** USGS flow-statistics percentile (0–100) — the "how unusual" axis. */
  percentile: number | null;
}

/** 24h direction at a river's primary gauge (see trendByRiver in the app). */
export interface DockRiverTrend {
  dir: 'rising' | 'falling' | 'steady';
  delta: number;
  unit: 'ft' | 'cfs';
}

// Shared trend hues — the aggregate TrendCell and the per-row arrows tell
// the same story in the same colors.
const TREND_UP = '#72B5C4';
const TREND_DOWN = '#B89D72';

export default function DataDock({
  rivers,
  verdictByRiver,
  readingByRiver,
  trendByRiver,
  history,
  hoveredRiverId,
  focusedRiverId,
  conditionFilter,
  onToggleCondition,
  onClearConditionFilter,
  onSetConditions,
  dayOffset,
  readingsAsOf,
  cadenceSeconds,
  sharedGaugeByRiver,
  gaugeCount,
  telemetry,
  showGauges,
  setShowGauges,
  showTerrain,
  setShowTerrain,
  showSites,
  setShowSites,
  showFlow,
  setShowFlow,
  showRiverLabels,
  setShowRiverLabels,
  siteCount,
  sitesCapped,
  onHoverRiver,
  onFocusRiver,
  open,
  onClose,
}: {
  rivers: MORiver[];
  verdictByRiver: Record<string, StageVerdict>;
  readingByRiver: Record<string, DockRiverReading>;
  trendByRiver: Record<string, DockRiverTrend | null>;
  history: MoHistoryBundleEntry[];
  hoveredRiverId: string | null;
  focusedRiverId: string | null;
  /** Verdicts the user has toggled on to filter by. Empty = show all. */
  conditionFilter: Set<StageVerdict>;
  onToggleCondition: (code: StageVerdict) => void;
  onClearConditionFilter: () => void;
  /** Replace the whole filter at once (the "floatable only" shortcut). */
  onSetConditions: (codes: StageVerdict[]) => void;
  dayOffset: number;
  /** Newest actual USGS reading timestamp — NOT server response time. */
  readingsAsOf: string | null;
  /** Refresh cadence of the live feed in seconds (default 15 min). */
  cadenceSeconds: number | null;
  /** Rivers whose primary gauge also rates other rivers, keyed by slug. */
  sharedGaugeByRiver: Record<string, { siteId: string; others: string[] }>;
  gaugeCount: number;
  /** Statewide observatory aggregates (see MOSurfaceWaterApp). */
  telemetry: { reporting: number; rising: number; falling: number; risk72h: number };
  showGauges: boolean;
  setShowGauges: (v: boolean) => void;
  showTerrain: boolean;
  setShowTerrain: (v: boolean) => void;
  showSites: boolean;
  setShowSites: (v: boolean) => void;
  showFlow: boolean;
  setShowFlow: (v: boolean) => void;
  showRiverLabels: boolean;
  setShowRiverLabels: (v: boolean) => void;
  /** Context-site count + cap disclosure for the layers row. */
  siteCount: number;
  sitesCapped: boolean;
  onHoverRiver: (id: string | null) => void;
  onFocusRiver: (id: string | null) => void;
  /** Mobile drawer state; ignored on md+ where the dock is always shown. */
  open: boolean;
  onClose: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const mounted = useInView(rootRef, 0);

  const counts = useMemo(() => {
    const c: Record<StageVerdict, number> = {
      too_low: 0, low: 0, good: 0, flowing: 0, high: 0, dangerous: 0, unknown: 0,
    };
    for (const r of rivers) c[verdictByRiver[r.slug] ?? 'unknown']++;
    return c;
  }, [rivers, verdictByRiver]);
  const floatable = counts.good + counts.flowing;

  const historyBySite = useMemo(() => {
    const m = new Map<string, MoHistoryBundleEntry>();
    for (const e of history) if (e.is_primary) m.set(e.site_no, e);
    return m;
  }, [history]);

  const [sortKey, setSortKey] = useState<SortKey>('verdict');
  const [query, setQuery] = useState('');

  const sorted = useMemo(() => {
    // Best water first, matching the verdict strip's reading order.
    const verdictOrder: StageVerdict[] = ['flowing', 'good', 'high', 'low', 'too_low', 'dangerous', 'unknown'];
    // Flow in comparable units: cfs when we have it, else the raw reading.
    const flowOf = (r: MORiver) => {
      const rd = readingByRiver[r.slug];
      return rd?.dischargeCfs ?? rd?.value ?? -Infinity;
    };
    // Rising first, then steady, then falling, then unknown.
    const trendRank = (r: MORiver) => {
      const t = trendByRiver[r.slug];
      if (!t) return 3;
      return t.dir === 'rising' ? 0 : t.dir === 'steady' ? 1 : 2;
    };
    const arr = [...rivers];
    switch (sortKey) {
      case 'name':
        arr.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'flow':
        arr.sort((a, b) => flowOf(b) - flowOf(a));
        break;
      case 'trend':
        arr.sort((a, b) => trendRank(a) - trendRank(b) || a.name.localeCompare(b.name));
        break;
      default:
        arr.sort(
          (a, b) =>
            verdictOrder.indexOf(verdictByRiver[a.slug] ?? 'unknown') -
            verdictOrder.indexOf(verdictByRiver[b.slug] ?? 'unknown'),
        );
    }
    return arr;
  }, [rivers, verdictByRiver, readingByRiver, trendByRiver, sortKey]);

  // When conditions are toggled on, the list becomes a hard filter (the map
  // dims the rest) — you asked "which rivers are flowing?", the list answers
  // with only those. A name search narrows further. The verdict tiles keep
  // showing full counts so you never lose sight of what you're filtering from.
  const filterActive = conditionFilter.size > 0;
  const isFloatableFilter =
    conditionFilter.size === FLOATABLE.size &&
    [...FLOATABLE].every((c) => conditionFilter.has(c));
  const q = query.trim().toLowerCase();
  const visibleRivers = useMemo(
    () =>
      sorted.filter(
        (r) =>
          (!filterActive || conditionFilter.has(verdictByRiver[r.slug] ?? 'unknown')) &&
          (!q || r.name.toLowerCase().includes(q)),
      ),
    [sorted, filterActive, conditionFilter, verdictByRiver, q],
  );

  // "As of" = the newest actual gauge reading. Same-day shows time only;
  // an older stamp (offline snapshot, USGS outage) keeps its date so the
  // age is unmissable.
  const stampDate = readingsAsOf ? new Date(readingsAsOf) : null;
  const stamp = stampDate
    ? stampDate.toLocaleString(
        undefined,
        stampDate.toDateString() === new Date().toDateString()
          ? { hour: '2-digit', minute: '2-digit' }
          : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
      )
    : '—';
  const cadenceMin = Math.max(1, Math.round((cadenceSeconds ?? 900) / 60));

  const scrubbed = dayOffset !== 0;

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <button
          type="button"
          aria-label="Close river panel"
          onClick={onClose}
          className="absolute inset-0 z-30 md:hidden"
          style={{ background: 'rgba(4,20,26,0.55)' }}
        />
      )}

      <aside
        ref={rootRef}
        aria-label="Live river conditions panel"
        className={`absolute inset-y-0 left-0 z-40 flex w-[min(320px,88vw)] flex-col transition-transform duration-300 md:static md:z-auto md:w-[320px] md:translate-x-0 md:transition-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          background: 'linear-gradient(180deg, #0C2831 0%, #081E25 100%)',
          borderRight: '1px solid rgba(242,234,216,0.12)',
          fontFamily: SANS,
          boxShadow: '8px 0 32px -18px rgba(4,20,26,0.9)',
        }}
      >
        {/* ── Masthead ── */}
        <div className="px-4 pb-3 pt-4" style={{ borderBottom: '1px solid rgba(242,234,216,0.1)' }}>
          <div
            className="flex items-center gap-2 uppercase"
            style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.24em', color: 'var(--color-accent-400)' }}
          >
            <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
              {!reduced && (
                <span
                  className="absolute inline-flex h-full w-full rounded-full"
                  style={{ background: '#F07052', animation: 'mosw-ping 2.4s cubic-bezier(0,0,0.2,1) infinite' }}
                />
              )}
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: '#F07052' }} />
            </span>
            {/* "readings" drops on phones: the drawer close button eats ~40px
                of this row, and the wrapped "PM" orphan looked broken. */}
            <span className="whitespace-nowrap">
              USGS · <span className="hidden md:inline">readings </span>as of {stamp}
            </span>
            <button
              type="button"
              aria-label="Close panel"
              onClick={onClose}
              className="ml-auto grid h-7 w-7 place-items-center rounded-md border md:hidden"
              style={{ borderColor: 'rgba(242,234,216,0.25)', color: PARCH, fontSize: 14 }}
            >
              ×
            </button>
          </div>
          <h1
            className="mt-2 font-bold leading-none"
            style={{ fontFamily: DISPLAY, fontSize: 26, letterSpacing: '-0.01em', color: PARCH }}
          >
            Live{' '}
            <span
              style={{
                background: 'linear-gradient(115deg, #A3D1DB 5%, #10b981 60%, #4A9AAD 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              River Map
            </span>
          </h1>
          {/* Coral underline — the same SectionTitle accent used across the
              River Report + Blog, adapted for the dark panel. */}
          <div style={{ width: 32, height: 3, borderRadius: 1, marginTop: 10, background: 'var(--color-accent-500)' }} />
          <div
            className="mt-1.5"
            style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', color: PARCH_FAINT }}
          >
            Missouri · {rivers.length} float rivers · {gaugeCount} gauges · refreshes every {cadenceMin} min
          </div>
        </div>

        {/* ── Verdict strip ── */}
        <div className="px-4 pt-3">
          <div className="flex items-baseline justify-between">
            <span
              className="uppercase font-bold"
              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', color: 'var(--color-accent-400)' }}
            >
              {scrubbed ? `Verdict · ${Math.abs(dayOffset)}d ago` : 'Verdict · right now'}
            </span>
            {/* The single number the page exists to answer — and a one-tap
                shortcut to "just show me what I can float" (good + flowing).
                Toggles off when it's already the active filter. */}
            <button
              type="button"
              aria-pressed={isFloatableFilter}
              title={isFloatableFilter ? 'Clear the floatable filter' : 'Show only floatable rivers'}
              onClick={() =>
                isFloatableFilter ? onClearConditionFilter() : onSetConditions([...FLOATABLE])
              }
              className="rounded-sm px-1.5 py-0.5 transition-colors duration-150"
              style={{
                fontFamily: MONO, fontSize: 13, color: '#10b981', fontWeight: 700,
                border: `1px solid ${isFloatableFilter ? '#10b981' : 'transparent'}`,
                background: isFloatableFilter ? 'rgba(16,185,129,0.14)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              {floatable}/{rivers.length} go
            </button>
          </div>
          {/* 3×2, not 6-across: six tiles in a 320px rail left ~40px per
              label, truncating "TOO LOW"/"FLOWING" mid-word at any legible
              size. The share bar below still reads the distribution in one
              glance. Each tile is a filter toggle — tap to show only that
              condition on the map + list; tap again to clear it. */}
          <div className="mt-2 grid grid-cols-3 gap-1">
            {CONDITION_ORDER.map((code) => (
              <VerdictMini
                key={code}
                code={code}
                n={counts[code]}
                mounted={mounted}
                selected={conditionFilter.has(code)}
                filterActive={filterActive}
                onToggle={onToggleCondition}
              />
            ))}
          </div>

          {/* Filter status / discoverability line. When filtering: the match
              count + a clear button. Otherwise: a faint prompt so the tiles
              read as interactive, not just a readout. */}
          {filterActive ? (
            <button
              type="button"
              onClick={onClearConditionFilter}
              className="mt-2 flex w-full items-center justify-between rounded-sm border px-2 py-1 transition-colors duration-150"
              style={{
                borderColor: 'var(--color-accent-500)',
                background: 'rgba(240,112,82,0.12)',
                fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em',
                color: '#F4A38E',
              }}
            >
              <span className="uppercase font-bold">
                Filtering · {visibleRivers.length} {visibleRivers.length === 1 ? 'river' : 'rivers'}
              </span>
              <span className="uppercase font-bold">Clear ×</span>
            </button>
          ) : (
            <div
              className="mt-2 uppercase"
              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', color: PARCH_FAINT }}
            >
              Tap a condition to filter
            </div>
          )}

          {/* Condition share — same story as the tiles, read as proportion */}
          <div
            className="mt-2 flex h-2 w-full overflow-hidden rounded-sm"
            role="img"
            aria-label={CONDITION_ORDER.filter((c) => counts[c] > 0)
              .map((c) => `${counts[c]} ${STAGE_VERDICTS[c].label}`)
              .join(', ') || 'No condition data yet'}
            style={{ background: 'rgba(242,234,216,0.06)' }}
          >
            {CONDITION_ORDER.map((code) =>
              counts[code] > 0 ? (
                <div
                  key={code}
                  style={{
                    width: `${(counts[code] / Math.max(1, rivers.length)) * 100}%`,
                    background: STAGE_VERDICTS[code].color,
                    transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)',
                  }}
                />
              ) : null,
            )}
          </div>

          {/* ── Telemetry ── */}
          <div
            className="mt-3 grid grid-cols-3 gap-1.5 border-t-2 pt-2.5"
            style={{ borderColor: 'rgba(242,234,216,0.14)' }}
          >
            <TelemetryCell label="Gauges live" value={telemetry.reporting} active={mounted} />
            <TrendCell rising={telemetry.rising} falling={telemetry.falling} active={mounted} />
            <TelemetryCell
              label="72h flood risk"
              value={telemetry.risk72h}
              active={mounted}
              urgent={telemetry.risk72h > 0}
              unit={telemetry.risk72h === 1 ? 'river' : 'rivers'}
            />
          </div>
          {scrubbed && (
            <div
              className="mt-2 rounded-sm border px-2 py-1"
              style={{
                borderColor: 'rgba(240,112,82,0.5)', background: 'rgba(240,112,82,0.12)',
                fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', color: '#F4A38E',
              }}
            >
              Replaying the past — drag the timeline to “today” for live water.
            </div>
          )}
        </div>

        {/* ── List controls: search + sort ── */}
        <div className="mt-3 px-4">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rivers…"
              aria-label="Search rivers by name"
              className="w-full rounded-md border py-1.5 pl-2.5 pr-7"
              style={{
                fontFamily: MONO, fontSize: 11, letterSpacing: '0.04em',
                color: PARCH, background: 'rgba(242,234,216,0.05)',
                borderColor: 'rgba(242,234,216,0.16)',
              }}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-sm"
                style={{ color: PARCH_DIM, fontSize: 13 }}
              >
                ×
              </button>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-1">
            <span
              className="uppercase"
              style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.14em', color: PARCH_FAINT }}
            >
              Sort
            </span>
            <div className="ml-auto flex gap-1">
              {SORT_OPTIONS.map((o) => {
                const on = sortKey === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSortKey(o.key)}
                    className="rounded-sm border px-1.5 py-0.5 font-bold uppercase transition-colors duration-150"
                    style={{
                      fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.08em',
                      borderColor: on ? 'rgba(114,181,196,0.5)' : 'rgba(242,234,216,0.16)',
                      background: on ? 'rgba(45,120,137,0.28)' : 'transparent',
                      color: on ? '#A3D1DB' : PARCH_DIM,
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── River rows ── */}
        {/* The bottom mask fades the last visible row into the legend edge —
            a scroll affordance, so the list reads as "more below" instead of
            a card chopped in half at the panel boundary. */}
        <div
          className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-3"
          style={{
            WebkitMaskImage: 'linear-gradient(180deg, #000 calc(100% - 28px), transparent)',
            maskImage: 'linear-gradient(180deg, #000 calc(100% - 28px), transparent)',
          }}
        >
          {visibleRivers.length === 0 && (filterActive || q) && (
            // The condition filter (a scrubbed day can empty a selected one)
            // or the search can zero out the list — say so, don't just blank.
            <div
              className="rounded-md border px-3 py-4 text-center"
              style={{
                borderColor: 'rgba(242,234,216,0.12)', background: 'rgba(242,234,216,0.03)',
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', color: PARCH_DIM, lineHeight: 1.6,
              }}
            >
              {q
                ? `No rivers match “${query.trim()}”.`
                : `No rivers match this filter${scrubbed ? ' on the scrubbed day' : ' right now'}.`}
              <button
                type="button"
                onClick={() => { onClearConditionFilter(); setQuery(''); }}
                className="mt-2 block w-full uppercase font-bold"
                style={{ color: 'var(--color-accent-400)', letterSpacing: '0.1em' }}
              >
                {q && !filterActive ? 'Clear search' : 'Clear filter'}
              </button>
            </div>
          )}
          {visibleRivers.map((r, i) => (
            <RiverRow
              key={r.id}
              river={r}
              verdict={verdictByRiver[r.slug] ?? 'unknown'}
              reading={readingByRiver[r.slug] ?? null}
              trend={scrubbed ? null : trendByRiver[r.slug] ?? null}
              sharedGauge={sharedGaugeByRiver[r.slug] ?? null}
              history={
                historyBySite.get((r.gauges ?? []).find((g) => g.is_primary)?.site_id ?? '') ?? null
              }
              hovered={hoveredRiverId === r.id}
              focused={focusedRiverId === r.id}
              delay={reduced ? 0 : i * 55}
              mounted={mounted}
              onHover={(on) => onHoverRiver(on ? r.id : null)}
              onClick={() => {
                onFocusRiver(focusedRiverId === r.id ? null : r.id);
                onClose();
              }}
            />
          ))}
        </div>

        {/* ── Legend + layer toggle ── */}
        <div
          className="px-4 py-3"
          style={{
            borderTop: '1px solid rgba(242,234,216,0.1)',
            // Keep the toggles clear of the iOS home indicator when the
            // drawer is open on mobile (adds to py-3, not instead of it).
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/* The verdict tiles up top now carry the color key (and are the
              filter), so the legend drops its swatch grid — just the one thing
              the tiles don't say: what the color on the map actually means. */}
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.04em', color: PARCH_FAINT, lineHeight: 1.5 }}>
            Reaches fade between gauges — color is the float verdict at the nearest gauge.
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <LayerToggle
              label="Gauges"
              glyph="◎"
              on={showGauges}
              onToggle={() => setShowGauges(!showGauges)}
            />
            <LayerToggle
              label="Terrain"
              glyph="▲"
              on={showTerrain}
              onToggle={() => setShowTerrain(!showTerrain)}
            />
            <LayerToggle
              label="Sites"
              glyph="◦"
              on={showSites}
              onToggle={() => setShowSites(!showSites)}
            />
            <LayerToggle
              label="Flow"
              glyph="≈"
              on={showFlow}
              onToggle={() => setShowFlow(!showFlow)}
            />
            <LayerToggle
              label="Labels"
              glyph="A"
              on={showRiverLabels}
              onToggle={() => setShowRiverLabels(!showRiverLabels)}
            />
          </div>
          {showSites && siteCount > 0 && (
            <div className="mt-1.5" style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.05em', color: PARCH_FAINT }}>
              {siteCount} statewide USGS sites{sitesCapped ? ' (top by flow — capped)' : ''} · neutral, no float rating
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function TelemetryCell({
  label,
  value,
  active,
  format,
  unit,
  urgent,
}: {
  label: string;
  value: number;
  active: boolean;
  format?: (n: number) => string;
  unit?: string;
  urgent?: boolean;
}) {
  const n = useCountUp(value, active, 900);
  return (
    <div
      className="rounded-md border px-1.5 py-1.5"
      style={{
        borderColor: urgent ? 'rgba(239,68,68,0.55)' : 'rgba(242,234,216,0.1)',
        background: urgent ? 'rgba(239,68,68,0.1)' : 'rgba(242,234,216,0.03)',
      }}
    >
      <div className="font-bold" style={{ fontFamily: MONO, fontSize: 15, lineHeight: 1, color: urgent ? '#ef4444' : PARCH }}>
        {format ? format(n) : n.toLocaleString()}
        {unit && (
          <span style={{ fontSize: 9.5, marginLeft: 3, color: PARCH_DIM, fontWeight: 500 }}>{unit}</span>
        )}
      </div>
      <div
        className="mt-1 uppercase"
        style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.12em', color: PARCH_DIM }}
      >
        {label}
      </div>
    </div>
  );
}

// 24h direction across the curated rivers — the planning signal
// (is the water coming up or dropping?), not a vanity aggregate.
function TrendCell({
  rising,
  falling,
  active,
}: {
  rising: number;
  falling: number;
  active: boolean;
}) {
  const up = useCountUp(rising, active, 900);
  const down = useCountUp(falling, active, 900);
  return (
    <div
      className="rounded-md border px-1.5 py-1.5"
      style={{ borderColor: 'rgba(242,234,216,0.1)', background: 'rgba(242,234,216,0.03)' }}
    >
      <div className="font-bold" style={{ fontFamily: MONO, fontSize: 15, lineHeight: 1 }}>
        <span style={{ color: TREND_UP }}>▲{up}</span>
        <span style={{ color: PARCH_DIM, margin: '0 3px' }}>·</span>
        <span style={{ color: TREND_DOWN }}>▼{down}</span>
      </div>
      <div
        className="mt-1 uppercase"
        style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.12em', color: PARCH_DIM }}
      >
        Rising / falling · 24h
      </div>
    </div>
  );
}

function LayerToggle({
  label,
  glyph,
  on,
  onToggle,
}: {
  label: string;
  glyph: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="rounded-md border px-2 py-1.5 text-left font-bold uppercase transition-colors duration-150"
      style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em',
        borderColor: on ? 'rgba(114,181,196,0.5)' : 'rgba(242,234,216,0.18)',
        background: on ? 'rgba(45,120,137,0.28)' : 'transparent',
        color: on ? '#A3D1DB' : PARCH_DIM,
      }}
    >
      {glyph} {label} · {on ? 'on' : 'off'}
    </button>
  );
}

function VerdictMini({
  code,
  n,
  mounted,
  selected,
  filterActive,
  onToggle,
}: {
  code: StageVerdict;
  n: number;
  mounted: boolean;
  /** True when this condition is one of the active filters. */
  selected: boolean;
  /** True when any filter is active (dims the non-selected tiles). */
  filterActive: boolean;
  onToggle: (code: StageVerdict) => void;
}) {
  const v = STAGE_VERDICTS[code];
  const value = useCountUp(n, mounted, 900);
  const lit = n > 0;
  // A condition with no rivers right now can't be filtered to (it'd empty
  // the list), so its tile is inert — visibly dim, not a button.
  const interactive = lit;
  // While filtering, tiles that aren't selected recede so the chosen ones pop.
  const recede = filterActive && !selected;
  return (
    <button
      type="button"
      disabled={!interactive}
      aria-pressed={selected}
      onClick={interactive ? () => onToggle(code) : undefined}
      className="rounded-md border px-1 pb-1 pt-1.5 text-center transition-all duration-200"
      title={
        interactive
          ? `${selected ? 'Clear' : 'Show only'} ${v.label}${v.desc ? ` — ${v.desc}` : ''}`
          : `${v.label} — none right now`
      }
      style={{
        borderColor: selected ? v.color : lit ? `${v.color}66` : 'rgba(242,234,216,0.08)',
        background: selected ? `${v.color}2e` : lit ? `${v.color}1a` : 'rgba(242,234,216,0.03)',
        boxShadow: selected
          ? `inset 0 0 0 1px ${v.color}, 0 0 14px ${v.color}55`
          : lit && code === 'dangerous'
            ? `0 0 14px ${v.color}55`
            : undefined,
        opacity: lit ? (recede ? 0.5 : 1) : 0.4,
        cursor: interactive ? 'pointer' : 'default',
      }}
    >
      <div className="font-bold" style={{ fontFamily: MONO, fontSize: 17, lineHeight: 1, color: lit ? v.color : PARCH_DIM }}>
        {value}
      </div>
      <div
        className="mt-0.5 truncate uppercase"
        style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', color: PARCH_DIM }}
      >
        {v.label}
      </div>
    </button>
  );
}

function RiverRow({
  river,
  verdict,
  reading,
  trend,
  sharedGauge,
  history,
  hovered,
  focused,
  delay,
  mounted,
  onHover,
  onClick,
}: {
  river: MORiver;
  verdict: StageVerdict;
  reading: DockRiverReading | null;
  /** 24h direction; null when unknown or replaying a scrubbed day. */
  trend: DockRiverTrend | null;
  /** Set when this river's primary gauge also rates other rivers. */
  sharedGauge: { siteId: string; others: string[] } | null;
  history: MoHistoryBundleEntry | null;
  hovered: boolean;
  focused: boolean;
  delay: number;
  mounted: boolean;
  onHover: (on: boolean) => void;
  onClick: () => void;
}) {
  const v = STAGE_VERDICTS[verdict];
  const lit = hovered || focused;
  const trendGlyph = trend ? { rising: '▲', falling: '▼', steady: '→' }[trend.dir] : null;
  const trendColor = trend
    ? { rising: TREND_UP, falling: TREND_DOWN, steady: PARCH_DIM }[trend.dir]
    : PARCH_DIM;

  const spark = useMemo(() => {
    const daily = history?.daily ?? [];
    const vals = daily.map((d) => d.gaugeHeightFt ?? d.dischargeCfs);
    const valid = vals.filter((x): x is number => x != null);
    if (valid.length < 2) return null;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const span = max - min || 1;
    const SW = 64, SH = 20;
    const pts = vals
      .map((x, i) =>
        x == null
          ? null
          : `${((i / (vals.length - 1)) * SW).toFixed(1)},${(SH - 2 - ((x - min) / span) * (SH - 4)).toFixed(1)}`,
      )
      .filter(Boolean) as string[];
    return { line: pts.join(' '), SW, SH };
  }, [history]);

  // Distinguish "gauge exists but no reading" (—) from "river has no live
  // gauge at all" — the latter deserves words, not a silent dash.
  const hasPrimaryGauge = (river.gauges ?? []).some((g) => g.is_primary);
  const valueLabel = reading?.value != null
    ? reading.unit === 'ft'
      ? `${reading.value.toFixed(2)} ft`
      : `${Math.round(reading.value)} cfs`
    : hasPrimaryGauge
      ? '—'
      : 'no live gauge';

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      aria-pressed={focused}
      aria-label={`${river.name} — ${v.label}, ${valueLabel}${trend ? `, ${trend.dir} over 24 hours` : ''}. ${focused ? 'Unpin' : 'Show on map'}`}
      className="group mb-1.5 block w-full rounded-md border p-2.5 text-left transition-all duration-200"
      style={{
        borderColor: lit ? `${v.color}88` : 'rgba(242,234,216,0.09)',
        background: lit
          ? `linear-gradient(120deg, ${v.color}22 0%, rgba(12,40,49,0.4) 65%)`
          : 'rgba(242,234,216,0.03)',
        transform: lit ? 'translateX(3px)' : undefined,
        // Inset bar stands in for border-left — mixing the borderLeft
        // shorthand with borderColor trips React's style-conflict warning.
        boxShadow: lit
          ? `inset 3px 0 0 ${v.color}, 0 6px 18px -10px ${v.color}88`
          : `inset 3px 0 0 ${v.color}`,
        cursor: 'pointer',
        opacity: mounted ? 1 : 0,
        translate: mounted ? '0 0' : '0 10px',
        transition: `opacity 500ms ${delay}ms, translate 500ms ${delay}ms, transform 200ms, border-color 200ms, background 200ms, box-shadow 200ms`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-bold" style={{ fontFamily: DISPLAY, fontSize: 14.5, color: PARCH }}>
          {river.name}
        </span>
        <span
          className="flex-shrink-0 rounded-sm px-1.5 py-0.5 font-bold uppercase"
          style={{
            fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.1em',
            background: `${v.color}26`, color: v.color, border: `1px solid ${v.color}55`,
          }}
        >
          {v.label}
        </span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div>
          <span className="font-bold" style={{ fontFamily: MONO, fontSize: 15, color: v.color, lineHeight: 1 }}>
            {valueLabel}
          </span>
          {trendGlyph && (
            <span
              className="ml-2 font-bold"
              title={`${trend!.dir} over the last 24h`}
              style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', color: trendColor }}
            >
              {trendGlyph} 24h
            </span>
          )}
          <span className="ml-2" style={{ fontFamily: MONO, fontSize: 9.5, color: PARCH_FAINT }}>
            {reading?.dischargeCfs != null && reading.unit === 'ft'
              ? `${Math.round(reading.dischargeCfs)} cfs`
              : river.region ?? ''}
          </span>
        </div>
        {spark && (
          <svg
            viewBox={`0 0 ${spark.SW} ${spark.SH}`}
            width={spark.SW}
            height={spark.SH}
            className="flex-shrink-0"
            aria-hidden
          >
            <polyline
              points={spark.line}
              fill="none"
              stroke={v.color}
              strokeWidth="1.4"
              strokeLinejoin="round"
              opacity={lit ? 1 : 0.65}
            />
          </svg>
        )}
      </div>
      {reading?.percentile != null && (
        // "How unusual is this flow" in plain language — the same axis
        // that modulates the particle speed on the map.
        <div
          className="mt-1"
          style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', color: PARCH_FAINT }}
        >
          P{Math.round(reading.percentile)} · {classifyPercentile(reading.percentile).label.toLowerCase()} flow
        </div>
      )}
      {sharedGauge && (
        <div
          className="mt-1"
          style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', color: PARCH_FAINT }}
        >
          shared gauge · also rates {sharedGauge.others.join(', ')}
        </div>
      )}
    </button>
  );
}
