'use client';

// The national map's interface pieces. All of them are absent in Map only;
// the fullscreen tray is the only thing that can appear there, and only after
// a deliberate tap, click or key.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Map as MapIcon, Maximize, Minus, Pause, Play, Plus, Search, Settings, SlidersHorizontal, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Segmented from '@/components/ui/Segmented';
import InfoTip, { type InfoTipColors } from '@/components/ui/InfoTip';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { FLOOD_STATUS_TEXT } from '@/lib/national-map/flood-status';
import { floodStyle, flowStyle, classifyFlood, classifyFlow, type FloodSummary, type FlowSummary, type MapView, type Site } from '@/lib/national-map/marks';
import type { Appearance, FlowColors } from '@/lib/national-map/prefs';
import { search, type SearchIndex, type SearchResult } from '@/lib/national-map/search';
import type { MapPalette } from '@/lib/national-map/theme';
import { FloodLegend, FlowLegend, formatAge, formatTime, MarkSymbol } from './Legend';
import styles from './national-map.module.css';

const nf = new Intl.NumberFormat('en-US');

export const VIEW_OPTIONS = [
  { value: 'flow' as const, label: 'Flow' },
  { value: 'flooding' as const, label: 'Flooding' },
];

export const VIEW_QUESTION: Record<MapView, string> = {
  flow: 'Where are rivers running higher or lower than usual for this time of year?',
  flooding: 'Where have observations reached official NWS flood stages?',
};

// ── Freshness line ──────────────────────────────────────────────────────────

export function FreshnessLine({
  capturedAt,
  lastSuccessAt,
  lastError,
  catalogError,
  now,
}: {
  capturedAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  catalogError: string | null;
  now: number;
}) {
  const old = capturedAt !== null && now - capturedAt > 2 * 3_600_000;
  // One always-present status region, so assistive tech hears problems as
  // they appear — but not the age ticking every minute.
  const alert = catalogError
    ? 'The station list could not load; retrying. Only NWS forecast points are shown.'
    : capturedAt === null && lastError
      ? 'Live readings could not load yet. Retrying.'
      : old
        ? 'The snapshot is older than expected.'
        : lastError && lastSuccessAt !== null
          ? 'Refresh failed; retrying.'
          : '';
  return (
    <>
      <p className="sr-only" role="status">
        {alert}
      </p>
      {capturedAt === null ? (
        <p className={`text-xs ${styles.muted}`}>{lastError ? 'Live readings could not load yet. Retrying…' : 'Loading live readings…'}</p>
      ) : (
        <p className={`text-xs ${styles.muted}`}>
          Snapshot {formatTime(capturedAt)} ({formatAge(capturedAt, now)})
          {old && ' — older than expected; marks age as their readings do.'}
          {lastError && lastSuccessAt !== null && ' Refresh failed; retrying.'}
        </p>
      )}
      {catalogError && (
        <p className="text-xs font-semibold">Station list unavailable — retrying. Showing NWS forecast points only.</p>
      )}
    </>
  );
}

// ── Explore panel ───────────────────────────────────────────────────────────

export function ExplorePanel({
  view,
  onView,
  palette,
  flow,
  flood,
  noaaOk,
  freshness,
  searchBox,
  compact,
  short,
  measureRef,
  panelRef,
  notable,
  clock,
  onPickSite,
  infoColors,
}: {
  view: MapView;
  onView: (v: MapView) => void;
  palette: MapPalette;
  flow: FlowSummary | null;
  flood: FloodSummary | null;
  noaaOk: boolean;
  freshness: ReactNode;
  searchBox: ReactNode;
  compact: boolean;
  /** A short viewport (landscape phone): start with the legend closed. */
  short: boolean;
  /** Wraps the always-visible rows, so the map can fit below them on phones. */
  measureRef?: React.Ref<HTMLDivElement>;
  panelRef?: React.Ref<HTMLDivElement>;
  notable: Array<{ index: number; site: Site }>;
  clock: number;
  onPickSite: (index: number) => void;
  infoColors: InfoTipColors;
}) {
  const [legendOpen, setLegendOpen] = useState(!compact && !short);
  useEffect(() => setLegendOpen(!compact && !short), [compact, short]);
  const legendId = useId();
  return (
    <div
      ref={panelRef}
      className={`${styles.panel} pointer-events-auto relative w-full overflow-y-auto p-3 md:w-[20rem] md:p-4 ${
        compact ? 'max-h-[calc(100dvh-7rem)]' : 'max-h-full'
      }`}
    >
      <div ref={measureRef} className="space-y-3">
        {compact ? (
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-lg font-semibold leading-tight">Live River Map</h1>
            <Segmented options={VIEW_OPTIONS} value={view} onChange={onView} aria-label="Map view" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <EddyIcon name="river" size={26} className="shrink-0" />
              <h1 className="font-display text-xl font-semibold leading-tight">Live River Map</h1>
            </div>
            <Segmented options={VIEW_OPTIONS} value={view} onChange={onView} size="md" stretch aria-label="Map view" />
            <p className="text-sm leading-snug">{VIEW_QUESTION[view]}</p>
          </>
        )}
        {searchBox}
        {compact && freshness}
      </div>
      <div className={compact ? '' : 'mt-3'}>
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between text-left text-sm font-semibold"
          aria-expanded={legendOpen}
          aria-controls={legendId}
          onClick={() => setLegendOpen((v) => !v)}
        >
          What the marks mean
          {legendOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </button>
        <div id={legendId} hidden={!legendOpen} className="space-y-2">
          {compact && <p className="text-sm leading-snug">{VIEW_QUESTION[view]}</p>}
          {view === 'flow' ? (
            <>
              <FlowLegend palette={palette} summary={flow} />
              {flow && (
                <p className={`flex items-start gap-1 text-xs ${styles.muted}`}>
                  <span>
                    {flow.live === 0
                      ? 'No gauges are reporting current readings.'
                      : `${nf.format(flow.compared)} of ${nf.format(flow.live)} current gauges have a seasonal comparison.`}{' '}
                    Streamflow only — not whether a river is safe or good to float.
                  </span>
                  <InfoTip
                    title="About these comparisons"
                    body={`Each gauge is compared with its own record for this time of year. Gauges without enough history have no comparison. ${nf.format(flow.dormant)} stations silent for 30+ days are kept in search and appear when you zoom in.`}
                    ariaLabel="About flow comparisons"
                    colors={infoColors}
                    quiet
                  />
                </p>
              )}
            </>
          ) : (
            <>
              <FloodLegend palette={palette} summary={flood} noaaOk={noaaOk} />
              {flood && noaaOk && (
                <p className={`flex items-start gap-1 text-xs ${styles.muted}`}>
                  <span>
                    {nf.format(flood.major + flood.moderate + flood.minor)} of {nf.format(flood.assessed)} NWS forecast points with a current
                    reading and a defined flood stage are flooding.
                  </span>
                  <InfoTip
                    title="About flood marks"
                    body="Categories are the National Weather Service's own. Action stage is not flooding, and a gauge with no defined threshold is not reported as dry. Marks locate gauges; they do not show the area flooded."
                    ariaLabel="About flood marks"
                    colors={infoColors}
                    quiet
                  />
                </p>
              )}
            </>
          )}
          {notable.length > 0 && (
            <div className="pt-1">
              <p className="text-xs font-semibold">{view === 'flooding' ? 'Flooding now' : 'Most unusual now'}</p>
              <ul className="mt-1 space-y-0.5">
                {notable.map(({ index, site }) => {
                  const style = view === 'flooding' ? floodStyle(classifyFlood(site, clock, noaaOk)) : flowStyle(classifyFlow(site, clock));
                  return (
                    <li key={site.key}>
                      <button
                        type="button"
                        className={`flex min-h-11 w-full items-center gap-2 text-left text-sm underline-offset-2 hover:underline ${styles.breakAnywhere}`}
                        onClick={() => onPickSite(index)}
                      >
                        {style && <MarkSymbol style={style} palette={palette} />}
                        <span className="min-w-0 flex-1">{site.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className={`${styles.hairline} mt-2 space-y-1 pt-2`} hidden={compact && !legendOpen}>
        {!compact && freshness}
        <p className={`text-xs ${styles.muted}`}>
          Data: USGS Water Data · NOAA/NWS. <Link href="/river-map/ozarks" className="font-semibold underline">Ozarks float conditions →</Link>
        </p>
      </div>
    </div>
  );
}

// ── Search ──────────────────────────────────────────────────────────────────

export function SearchBox({
  index,
  unavailable,
  onPick,
}: {
  index: SearchIndex | null;
  unavailable: boolean;
  onPick: (r: SearchResult) => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const results = useMemo(() => (index && q.trim() ? search(index, q) : []), [index, q]);
  const showList = open && results.length > 0;
  const pick = (r: SearchResult) => {
    onPick(r);
    setOpen(false);
    setQ(r.label);
  };
  const status = !q.trim() || !index ? '' : results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'No matches';
  return (
    <div className="relative">
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Search rivers, places, states or USGS station IDs
      </label>
      <div className={`${styles.searchField} flex items-center gap-2 rounded-md px-2`}>
        <Search size={16} aria-hidden className={styles.muted} />
        <input
          id={`${listId}-input`}
          type="search"
          role="combobox"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          placeholder={index ? 'River, place, state or station ID' : unavailable ? 'Station search unavailable — retrying' : 'Loading stations…'}
          disabled={!index}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && results[active]) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === 'Escape' && showList) {
              // Only an open list consumes Escape; otherwise it closes details.
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className={`${styles.searchInput} min-h-11 w-full bg-transparent`}
        />
      </div>
      <p className="sr-only" role="status">
        {status}
      </p>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Search results" className={`${styles.panel} absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto py-1`}>
          {results.map((r, i) => (
            <li
              key={`${r.kind}-${r.label}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 text-sm ${styles.breakAnywhere}`}
              style={{ background: i === active ? 'var(--color-surface-hover)' : undefined }}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="font-semibold">{r.label}</span>
              <span className={`block text-xs ${styles.muted}`}>{r.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Map controls (Explore) ──────────────────────────────────────────────────

export function MapControls({
  onZoomIn,
  onZoomOut,
  onReset,
  onFullscreen,
  appearance,
  onAppearance,
  motion,
  onMotion,
  reducedMotion,
  displayDetails,
  onDisplayDetails,
  flowColors,
  onFlowColors,
  horizontal = false,
  fullscreenRef,
}: {
  horizontal?: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFullscreen: () => void;
  appearance: Appearance;
  onAppearance: (a: Appearance) => void;
  motion: boolean;
  onMotion: (m: boolean) => void;
  reducedMotion: boolean;
  displayDetails: boolean;
  onDisplayDetails: (d: boolean) => void;
  flowColors: FlowColors;
  onFlowColors: (c: FlowColors) => void;
  fullscreenRef?: React.Ref<HTMLButtonElement>;
}) {
  const [settings, setSettings] = useState(false);
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setSettings(false);
    trigger.current?.focus();
  };
  // The settings trigger is the LAST button and its panel follows it in the
  // DOM, so Tab moves straight from the trigger into the panel;
  // flex-col-reverse keeps the panel drawn above the buttons.
  return (
    <div className="pointer-events-auto flex flex-col-reverse items-end gap-2">
      <div className={horizontal ? 'flex gap-1.5' : 'flex flex-col gap-1.5'}>
        <Button variant="icon" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn}>
          <Plus size={18} aria-hidden />
        </Button>
        <Button variant="icon" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut}>
          <Minus size={18} aria-hidden />
        </Button>
        <Button variant="icon" aria-label="Show the whole country" title="Show the whole country" onClick={onReset}>
          <MapIcon size={18} aria-hidden />
        </Button>
        <Button ref={fullscreenRef} variant="icon" aria-label="Fullscreen map" title="Fullscreen map" onClick={onFullscreen}>
          <Maximize size={18} aria-hidden />
        </Button>
        <Button
          ref={trigger}
          variant="icon"
          aria-label="Map settings"
          title="Map settings"
          aria-expanded={settings}
          aria-controls={panelId}
          onClick={() => setSettings((v) => !v)}
        >
          <Settings size={18} aria-hidden />
        </Button>
      </div>
      {settings && (
        <div
          id={panelId}
          className={`${styles.panel} w-64 space-y-3 p-3`}
          role="group"
          aria-label="Map settings"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
        >
          <div className="space-y-1">
            <p className="text-xs font-semibold">Appearance</p>
            <Segmented
              options={[
                { value: 'system' as const, label: 'System' },
                { value: 'light' as const, label: 'Light' },
                { value: 'dark' as const, label: 'Dark' },
              ]}
              value={appearance}
              onChange={onAppearance}
              stretch
              aria-label="Appearance"
            />
          </div>
          <label className="flex min-h-11 items-center justify-between gap-2 text-sm">
            <span>
              Motion
              {reducedMotion && <span className={`block text-xs ${styles.muted}`}>Reduced by your system setting</span>}
            </span>
            <input type="checkbox" checked={motion && !reducedMotion} disabled={reducedMotion} onChange={(e) => onMotion(e.target.checked)} className="h-5 w-5" />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-2 text-sm">
            <span>
              Details in fullscreen
              <span className={`block text-xs ${styles.muted}`}>A quiet status line and one rotating gauge or river</span>
            </span>
            <input type="checkbox" checked={displayDetails} onChange={(e) => onDisplayDetails(e.target.checked)} className="h-5 w-5" />
          </label>
          <div className="space-y-1">
            <p className="text-xs font-semibold">Flow colours</p>
            <Segmented
              options={[
                { value: 'eddy' as const, label: 'Eddy' },
                { value: 'vivid' as const, label: 'Vivid' },
              ]}
              value={flowColors}
              onChange={onFlowColors}
              stretch
              aria-label="Flow colours"
            />
            <p className={`text-xs ${styles.muted}`}>Vivid is a prototype for wall displays: copper for low, teal for normal, saturated cyan for high.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fullscreen tray ─────────────────────────────────────────────────────────

export function FullscreenTray({
  open,
  view,
  onView,
  displayDetails,
  onDisplayDetails,
  motion,
  onMotion,
  reducedMotion,
  onExit,
  onActivity,
  trayRef,
  narrow,
  status,
}: {
  open: boolean;
  view: MapView;
  onView: (v: MapView) => void;
  displayDetails: boolean;
  onDisplayDetails: (d: boolean) => void;
  motion: boolean;
  onMotion: (m: boolean) => void;
  reducedMotion: boolean;
  onExit: () => void;
  /** Any use of the tray keeps it open. Pointer drift over the map does not. */
  onActivity: () => void;
  trayRef: React.RefObject<HTMLDivElement | null>;
  /** Phone width: icon-only Details so the row never wraps. */
  narrow: boolean;
  /** Why the selected view is not live, or null. Shown only once the tray is open. */
  status: string | null;
}) {
  const reducedId = useId();
  const paused = !motion || reducedMotion;
  return (
    <div
      ref={trayRef}
      className={`${styles.panel} ${styles.tray} ${open ? '' : styles.trayHidden} pointer-events-auto flex max-w-full flex-col gap-1.5 p-2`}
      role="group"
      aria-label="Fullscreen controls"
      aria-hidden={!open}
      inert={!open}
      onPointerMove={onActivity}
      onPointerDown={onActivity}
      onKeyDown={onActivity}
      onFocus={onActivity}
    >
      {status && (
        <p className="px-1 text-sm font-semibold" role="status">
          {status}
        </p>
      )}
      <div className="flex flex-nowrap items-center gap-2">
      <Segmented options={VIEW_OPTIONS} value={view} onChange={onView} size={narrow ? 'sm' : 'md'} aria-label="Map view" />
      {/* Fixed names with aria-pressed: the state is the pressed state, not a
          label that rewrites itself ("Hide details, pressed"). */}
      {narrow ? (
        <Button variant="icon" aria-label="Details" title="Details" aria-pressed={displayDetails} onClick={() => onDisplayDetails(!displayDetails)}>
          <SlidersHorizontal size={18} aria-hidden />
        </Button>
      ) : (
        <Button variant="outline" aria-pressed={displayDetails} onClick={() => onDisplayDetails(!displayDetails)}>
          Details
        </Button>
      )}
      <Button
        variant="icon"
        aria-label="Pause motion"
        title={reducedMotion ? 'Motion is reduced by your system setting' : 'Pause motion'}
        aria-pressed={paused}
        aria-disabled={reducedMotion || undefined}
        aria-describedby={reducedMotion ? reducedId : undefined}
        onClick={() => {
          if (!reducedMotion) onMotion(!motion);
        }}
      >
        {paused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
      </Button>
      {reducedMotion && (
        <span id={reducedId} className="sr-only">
          Motion is reduced by your system setting.
        </span>
      )}
      <Button variant="icon" aria-label="Exit fullscreen" title="Exit fullscreen" onClick={onExit}>
        <X size={18} aria-hidden />
      </Button>
      </div>
    </div>
  );
}

// ── Display with details ────────────────────────────────────────────────────

export function DisplayDetails({
  view,
  flow,
  flood,
  noaaOk,
  capturedAt,
  now,
  featured,
  caption,
  liveStatus,
  palette,
  narrow,
}: {
  view: MapView;
  flow: FlowSummary | null;
  flood: FloodSummary | null;
  noaaOk: boolean;
  capturedAt: number | null;
  now: number;
  /** The spotlit highlight (the parent rotates it), or null. */
  featured: Site | null;
  /** While a "Follow the river" journey runs: its one caption (river names). */
  caption: string | null;
  /** Why the view is not live, or null — replaces the status line when set. */
  liveStatus: string | null;
  palette: MapPalette;
  /** Phone width: stack the status line above the card instead of side by side. */
  narrow: boolean;
}) {
  const status = liveStatus
    ? liveStatus
    : view === 'flow'
      ? flow
        ? `Flow compared with usual · ${nf.format(flow.live)} gauges current`
        : 'Flow compared with usual'
      : !noaaOk
        ? 'NWS flood status unavailable'
        : flood
          ? `${nf.format(flood.major + flood.moderate + flood.minor)} gauges above flood stage · ${nf.format(flood.action)} at action stage`
          : 'Official flood status';

  let line: string | null = null;
  if (featured) {
    if (view === 'flooding' && featured.nws) line = FLOOD_STATUS_TEXT[featured.nws.observed].label;
    else if (featured.reading?.flowPercentile != null) line = featured.reading.flowPercentile >= 50 ? 'Much higher than usual' : 'Much lower than usual';
  }
  const style = featured
    ? view === 'flooding'
      ? floodStyle(classifyFlood(featured, now, noaaOk))
      : flowStyle(classifyFlow(featured, now))
    : null;
  const observedAt = featured ? (view === 'flooding' ? featured.nws?.observedAt ?? null : featured.reading?.observedAt ?? null) : null;

  const statusLine = (
    <p className={`${styles.displayText} ${narrow ? '' : 'max-w-[60vw]'}`} style={{ color: 'var(--nm-ink-2)' }}>
      <span className="font-semibold" style={{ color: 'var(--nm-ink)' }}>
        {status}
      </span>
      {capturedAt !== null && <span className={styles.nowrap}> · {formatTime(capturedAt)}</span>}
    </p>
  );
  const card = caption ? (
    <div key={caption} className={`${styles.panel} ${styles.fade} ${styles.displayCard} p-[0.75em]`}>
      <p className={`font-bold leading-snug ${styles.breakAnywhere}`}>{caption}</p>
    </div>
  ) :
    featured && line ? (
      <div className={`${styles.panel} ${styles.fade} ${styles.displayCard} p-[0.75em]`}>
        <p className={`font-bold leading-snug ${styles.breakAnywhere}`}>{featured.name}</p>
        <p className="flex items-center gap-2">
          {style && <MarkSymbol style={style} palette={palette} />}
          {line}
        </p>
        <p className={`${styles.mono} ${styles.muted}`} style={{ fontSize: '0.8em' }}>
          {featured.reading?.dischargeCfs != null && <span className={styles.nowrap}>{nf.format(featured.reading.dischargeCfs)} cfs · </span>}
          <span className={styles.nowrap}>{formatTime(observedAt)}</span> · <span className={styles.nowrap}>{formatAge(observedAt, now)}</span>
        </p>
      </div>
    ) : null;

  if (narrow) {
    return (
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col gap-2" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {statusLine}
        {card}
      </div>
    );
  }
  return (
    <>
      <div className="pointer-events-none absolute bottom-4 left-4" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        {statusLine}
      </div>
      {card && (
        <div className="pointer-events-none absolute bottom-4 right-4" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
          {card}
        </div>
      )}
    </>
  );
}

// ── Overlap chooser and hover tip ───────────────────────────────────────────

const CHOOSER_W = 256;
const CHOOSER_H = 320;

export function Chooser({
  sites,
  x,
  y,
  bounds,
  onPick,
  onClose,
  onZoomIn,
}: {
  sites: Array<{ index: number; site: Site }>;
  x: number;
  y: number;
  /** The map root's size, so the chooser stays inside it. */
  bounds: { width: number; height: number };
  onPick: (index: number) => void;
  onClose: () => void;
  onZoomIn: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus({ preventScroll: true }), []);
  const left = Math.max(8, Math.min(bounds.width - CHOOSER_W - 8, x - CHOOSER_W / 2));
  // Below the point when it fits, otherwise above it.
  const below = y + 14 + CHOOSER_H <= bounds.height - 8;
  const top = below ? y + 14 : Math.max(8, y - 14 - CHOOSER_H);
  return (
    <div
      className={`${styles.panel} pointer-events-auto absolute z-30 flex flex-col p-1`}
      style={{ left, top, width: CHOOSER_W, maxHeight: CHOOSER_H }}
      role="dialog"
      aria-label={`Choose a gauge — ${sites.length} here`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <p className={`text-xs ${styles.muted}`}>{nf.format(sites.length)} gauges here</p>
        {sites.length > 8 && (
          <button type="button" className="min-h-11 text-xs font-semibold underline" onClick={onZoomIn}>
            Zoom in here
          </button>
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {sites.map(({ index, site }, i) => (
          <li key={site.key}>
            <button
              ref={i === 0 ? first : undefined}
              type="button"
              className={`min-h-11 w-full rounded px-2 py-1.5 text-left text-sm hover:underline ${styles.breakAnywhere}`}
              onClick={() => onPick(index)}
            >
              <span className="font-semibold">{site.name}</span>
              <span className={`block text-xs ${styles.muted}`}>{site.kind === 'usgs' ? `USGS ${site.siteId}` : `NWS ${site.lid}`}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TIP_W = 260;

export function HoverTip({ site, x, y, text, boundsWidth }: { site: Site; x: number; y: number; text: string; boundsWidth: number }) {
  // Flip to the left of the pointer near the right edge instead of squashing.
  const flip = x + 14 + TIP_W > boundsWidth - 8;
  return (
    <div
      className={`${styles.panel} pointer-events-none absolute z-20 px-2 py-1.5`}
      style={{ left: flip ? undefined : x + 14, right: flip ? boundsWidth - x + 14 : undefined, top: y + 14, maxWidth: TIP_W }}
    >
      <p className={`text-xs font-bold leading-snug ${styles.breakAnywhere}`}>{site.name}</p>
      <p className="text-xs">{text}</p>
    </div>
  );
}
