'use client';

// The national map's interface pieces. All of them are absent in Map only;
// the fullscreen tray is the only thing that can appear there, and only after
// a deliberate tap, click or key.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Home, Maximize, Minus, Pause, Play, Plus, Search, Settings, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Segmented from '@/components/ui/Segmented';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { FLOOD_STATUS_TEXT } from '@/lib/national-map/flood-status';
import type { FloodSummary, FlowSummary, MapView, Site } from '@/lib/national-map/marks';
import type { Appearance } from '@/lib/national-map/prefs';
import { search, type SearchIndex, type SearchResult } from '@/lib/national-map/search';
import type { MapPalette } from '@/lib/national-map/theme';
import { FloodLegend, FlowLegend, formatAge, formatTime } from './Legend';
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
  now,
}: {
  capturedAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  now: number;
}) {
  if (capturedAt === null) {
    return <p className={`text-xs ${styles.muted}`}>{lastError ? 'Live readings could not load yet. Retrying…' : 'Loading live readings…'}</p>;
  }
  const old = now - capturedAt > 2 * 3_600_000;
  return (
    <p className={`text-xs ${styles.muted}`} role={old || lastError ? 'status' : undefined}>
      Snapshot {formatTime(capturedAt)} ({formatAge(capturedAt, now)})
      {old && ' — older than expected; marks age as their readings do.'}
      {lastError && lastSuccessAt !== null && ' Refresh failed; retrying.'}
    </p>
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
  measureRef,
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
  /** Wraps the always-visible rows, so the map can fit below them on phones. */
  measureRef?: React.Ref<HTMLDivElement>;
}) {
  const [legendOpen, setLegendOpen] = useState(!compact);
  useEffect(() => setLegendOpen(!compact), [compact]);
  const legendId = useId();
  return (
    <div className={`${styles.panel} pointer-events-auto relative w-full p-3 md:w-[320px] md:p-4 ${compact ? 'max-h-[calc(100dvh-7rem)] overflow-y-auto' : ''}`}>
      <div ref={measureRef} className="space-y-3">
        {compact ? (
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-lg font-semibold leading-none">Live River Map</h1>
            <Segmented options={VIEW_OPTIONS} value={view} onChange={onView} aria-label="Map view" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <EddyIcon name="river" size={26} className="shrink-0" />
              <h1 className="font-display text-xl font-semibold leading-none">Live River Map</h1>
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
                <p className={`text-xs ${styles.muted}`}>
                  {nf.format(flow.compared)} of {nf.format(flow.live)} current gauges have a seasonal comparison.{' '}
                  {nf.format(flow.dormant)} stations silent 30+ days appear when zoomed in. Comparisons describe
                  streamflow only — not whether a river is safe or good to float.
                </p>
              )}
            </>
          ) : (
            <>
              <FloodLegend palette={palette} summary={flood} noaaOk={noaaOk} />
              {flood && noaaOk && (
                <p className={`text-xs ${styles.muted}`}>
                  Of {nf.format(flood.assessed)} NWS forecast points with a current reading and a defined flood stage,{' '}
                  {nf.format(flood.major + flood.moderate + flood.minor)} are flooding. Marks locate gauges; they do not
                  show the area flooded.
                </p>
              )}
            </>
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

export function SearchBox({ index, onPick }: { index: SearchIndex | null; onPick: (r: SearchResult) => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const results = useMemo(() => (index && q.trim() ? search(index, q) : []), [index, q]);
  const pick = (r: SearchResult) => {
    onPick(r);
    setOpen(false);
    setQ(r.label);
  };
  return (
    <div className="relative">
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Search rivers, places, states or USGS station IDs
      </label>
      <div className="flex items-center gap-2 rounded-md border-2 px-2" style={{ borderColor: 'var(--color-border-strong)', background: 'var(--nm-surface)' }}>
        <Search size={16} aria-hidden className={styles.muted} />
        <input
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
          placeholder={index ? 'River, place, state or station ID' : 'Loading stations…'}
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
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className="min-h-11 w-full bg-transparent text-sm outline-none"
          style={{ color: 'var(--nm-ink)' }}
        />
      </div>
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className={`${styles.panel} absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto py-1`}>
          {results.map((r, i) => (
            <li
              key={`${r.kind}-${r.label}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className="cursor-pointer px-3 py-2 text-sm"
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
  horizontal = false,
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
}) {
  const [settings, setSettings] = useState(false);
  const panelId = useId();
  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      {settings && (
        <div id={panelId} className={`${styles.panel} w-64 space-y-3 p-3`} role="group" aria-label="Map settings">
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
              <span className={`block text-xs ${styles.muted}`}>A quiet status line and one rotating gauge</span>
            </span>
            <input type="checkbox" checked={displayDetails} onChange={(e) => onDisplayDetails(e.target.checked)} className="h-5 w-5" />
          </label>
        </div>
      )}
      <div className={horizontal ? 'flex gap-1.5' : 'flex flex-col gap-1.5'}>
        <Button variant="icon" aria-label="Zoom in" onClick={onZoomIn}>
          <Plus size={18} />
        </Button>
        <Button variant="icon" aria-label="Zoom out" onClick={onZoomOut}>
          <Minus size={18} />
        </Button>
        <Button variant="icon" aria-label="Show the whole country" onClick={onReset}>
          <Home size={18} />
        </Button>
        <Button variant="icon" aria-label="Map settings" aria-expanded={settings} aria-controls={panelId} onClick={() => setSettings((v) => !v)}>
          <Settings size={18} />
        </Button>
        <Button variant="icon" aria-label="Fullscreen map" onClick={onFullscreen}>
          <Maximize size={18} />
        </Button>
      </div>
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
}) {
  return (
    <div
      ref={trayRef}
      className={`${styles.panel} ${styles.tray} ${open ? '' : styles.trayHidden} pointer-events-auto flex flex-wrap items-center gap-2 p-2`}
      role="toolbar"
      aria-label="Fullscreen controls"
      aria-hidden={!open}
      inert={!open}
      onPointerMove={onActivity}
      onPointerDown={onActivity}
      onKeyDown={onActivity}
      onFocus={onActivity}
    >
      <Segmented options={VIEW_OPTIONS} value={view} onChange={onView} size="md" aria-label="Map view" />
      <Button variant="outline" size="sm" aria-pressed={displayDetails} onClick={() => onDisplayDetails(!displayDetails)}>
        {displayDetails ? 'Hide details' : 'Show details'}
      </Button>
      <Button
        variant="icon"
        aria-label={motion ? 'Pause motion' : 'Resume motion'}
        aria-pressed={!motion}
        disabled={reducedMotion}
        title={reducedMotion ? 'Motion is reduced by your system setting' : undefined}
        onClick={() => onMotion(!motion)}
      >
        {motion && !reducedMotion ? <Pause size={18} /> : <Play size={18} />}
      </Button>
      <Button variant="icon" aria-label="Exit fullscreen" onClick={onExit}>
        <X size={18} />
      </Button>
    </div>
  );
}

// ── Display with details ────────────────────────────────────────────────────

const ROTATE_MS = 30_000;

export function DisplayDetails({
  view,
  flow,
  flood,
  noaaOk,
  capturedAt,
  now,
  notable,
  onFeature,
}: {
  view: MapView;
  flow: FlowSummary | null;
  flood: FloodSummary | null;
  noaaOk: boolean;
  capturedAt: number | null;
  now: number;
  notable: Site[];
  onFeature: (site: Site | null) => void;
}) {
  const [i, setI] = useState(0);
  const keys = notable.map((s) => s.key).join('|');
  useEffect(() => setI(0), [keys]);
  useEffect(() => {
    if (notable.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % notable.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [notable.length]);
  const featured = notable.length ? notable[i % notable.length] : null;
  const featuredRef = useRef(onFeature);
  featuredRef.current = onFeature;
  useEffect(() => {
    featuredRef.current(featured);
    return () => featuredRef.current(null);
  }, [featured]);

  const status =
    view === 'flow'
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

  return (
    <>
      <div className="pointer-events-none absolute bottom-4 left-4 max-w-[60vw] text-xs" style={{ color: 'var(--nm-ink-2)' }}>
        <span className="font-semibold" style={{ color: 'var(--nm-ink)' }}>
          {status}
        </span>
        {capturedAt !== null && <> · {formatTime(capturedAt)}</>}
      </div>
      {featured && line && (
        <div className={`${styles.panel} ${styles.fade} pointer-events-none absolute bottom-4 right-4 w-72 p-3`} aria-live="off">
          <p className="text-sm font-bold leading-snug">{featured.name}</p>
          <p className="text-sm">{line}</p>
          <p className={`${styles.mono} text-xs ${styles.muted}`}>
            {featured.reading?.dischargeCfs != null && `${nf.format(featured.reading.dischargeCfs)} cfs · `}
            {formatTime(view === 'flooding' ? featured.nws?.observedAt ?? null : featured.reading?.observedAt ?? null)}
            {' · '}
            {formatAge(view === 'flooding' ? featured.nws?.observedAt ?? null : featured.reading?.observedAt ?? null, now)}
          </p>
        </div>
      )}
    </>
  );
}

// ── Overlap chooser and hover tip ───────────────────────────────────────────

export function Chooser({
  sites,
  x,
  y,
  onPick,
  onClose,
}: {
  sites: Array<{ index: number; site: Site }>;
  x: number;
  y: number;
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <div
      className={`${styles.panel} pointer-events-auto absolute z-30 w-64 p-1`}
      style={{ left: Math.max(8, x - 128), top: y + 14 }}
      role="dialog"
      aria-label="Choose a gauge"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <p className={`px-2 py-1 text-xs ${styles.muted}`}>{sites.length} gauges here</p>
      <ul className="max-h-60 overflow-y-auto">
        {sites.map(({ index, site }, i) => (
          <li key={site.key}>
            <button
              ref={i === 0 ? first : undefined}
              type="button"
              className="min-h-11 w-full rounded px-2 py-1.5 text-left text-sm hover:underline"
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

export function HoverTip({ site, x, y, text }: { site: Site; x: number; y: number; text: string }) {
  return (
    <div className={`${styles.panel} pointer-events-none absolute z-20 max-w-[260px] px-2 py-1.5`} style={{ left: x + 14, top: y + 14 }}>
      <p className="text-xs font-bold leading-snug">{site.name}</p>
      <p className="text-xs">{text}</p>
    </div>
  );
}
