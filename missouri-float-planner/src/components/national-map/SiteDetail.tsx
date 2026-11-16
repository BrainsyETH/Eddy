'use client';

// One site's details. Short first view — place, condition, reading, time, a
// small chart — with technical metadata behind a disclosure.
//
// Wording rules: a seasonal comparison is a hydrological fact, never a
// recreation verdict (an unrated gauge never borrows the float ladder's words);
// flood status quotes NWS; forecast is labeled as forecast with its own times.

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { flowBandSentence } from '@shared/flow-band';
import Button from '@/components/ui/Button';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { FLOOD_STATUS_TEXT, isFlooding } from '@/lib/national-map/flood-status';
import {
  classifyFlood,
  classifyFlow,
  EXTREME_HIGH,
  EXTREME_LOW,
  floodStyle,
  flowStyle,
  readingState,
  type MapView,
  type MarkStyle,
  type Site,
} from '@/lib/national-map/marks';
import type { MapPalette } from '@/lib/national-map/theme';
import { formatAge, formatTime, MarkSymbol } from './Legend';
import styles from './national-map.module.css';

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function flowSentence(site: Site, clock: number): string {
  if (site.kind === 'nws') return 'NWS forecast point — no USGS discharge record here.';
  const state = readingState(site.reading, clock);
  if (state === 'none') return 'No recent reading from this gauge.';
  if (state === 'dormant') return 'This gauge has not reported in over 30 days.';
  if (state === 'suspect') return 'USGS flagged this reading; no comparison is shown.';
  if (state === 'stale') return 'Reporting delayed — the latest reading is not current.';
  const c = classifyFlow(site, clock);
  if (c === 'no_comparison') return 'Current reading. No seasonal comparison is available for this gauge.';
  return flowBandSentence(c as Parameters<typeof flowBandSentence>[0]) ?? 'No comparison available.';
}

export interface HistoryPoint {
  t: number;
  v: number;
}

/** A gauge's recent readings (live USGS when the database has none). Shared with the wall story. */
export function useHistory(siteId: string | null, unit: 'cfs' | 'ft', days = 7) {
  const [state, setState] = useState<{ id: string | null; points: HistoryPoint[] | null; error: boolean }>({
    id: null,
    points: null,
    error: false,
  });
  useEffect(() => {
    if (!siteId) return;
    const controller = new AbortController();
    fetch(`/api/gauges/${encodeURIComponent(siteId)}/history?days=${days}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { readings?: Array<{ timestamp: string; dischargeCfs: number | null; gaugeHeightFt: number | null }> }) => {
        const points: HistoryPoint[] = [];
        for (const r of body.readings ?? []) {
          const t = Date.parse(r.timestamp);
          const v = unit === 'cfs' ? r.dischargeCfs : r.gaugeHeightFt;
          if (Number.isFinite(t) && typeof v === 'number' && Number.isFinite(v)) points.push({ t, v });
        }
        setState({ id: siteId, points, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ id: siteId, points: null, error: true });
      });
    return () => controller.abort();
  }, [siteId, unit, days]);
  return state.id === siteId ? state : { id: siteId, points: null, error: false };
}

/** Time-scaled sparkline; a gap over six hours breaks the line rather than bridging it. */
function Sparkline({ points, unit }: { points: HistoryPoint[]; unit: string }) {
  if (points.length < 2) return <p className={`text-xs ${styles.muted}`}>Not enough recent readings to chart.</p>;
  const w = 280;
  const h = 64;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    lo = Math.min(lo, p.v);
    hi = Math.max(hi, p.v);
  }
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.1);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * w;
  const y = (v: number) => h - 4 - ((v - lo) / span) * (h - 8);
  let d = '';
  points.forEach((p, i) => {
    const gap = i > 0 && p.t - points[i - 1].t > 6 * 3_600_000;
    d += `${i === 0 || gap ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`;
  });
  const last = points[points.length - 1];
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" role="img" aria-label={`Last 7 days, ${nf.format(lo)} to ${nf.format(hi)} ${unit}`}>
        <path d={d} fill="none" stroke="var(--nm-edge)" strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(last.t)} cy={y(last.v)} r={2.5} fill="var(--nm-edge)" />
      </svg>
      <figcaption className={`flex justify-between text-xs ${styles.muted}`}>
        <span>7 days</span>
        <span className={styles.mono}>
          {nf.format(lo)}–{nf.format(hi)} {unit}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Past the outermost published threshold (p95 / p05) the percentile orders
 * readings but has no measured position, so it is shown as a bound.
 */
function seasonalPercentileText(p: number | null): string {
  if (p === null) return 'none';
  if (p >= EXTREME_HIGH) return `≥ P${EXTREME_HIGH} (published)`;
  if (p <= EXTREME_LOW) return `≤ P${EXTREME_LOW} (published)`;
  return `P${Math.round(p)}`;
}

export default function SiteDetail({
  site,
  view,
  clock,
  noaaOk,
  capturedAt,
  onClose,
  palette,
  autoFocus,
  change,
}: {
  /** Change view: this gauge's measured change over the window, or null while history builds. */
  change?: { style: MarkStyle | null; text: string } | null;
  site: Site;
  view: MapView;
  clock: number;
  noaaOk: boolean;
  capturedAt: number | null;
  onClose: () => void;
  palette: MapPalette;
  /** Move focus to the heading (opened from search, the chooser or the keyboard). */
  autoFocus: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (autoFocus) heading.current?.focus({ preventScroll: true });
  }, [autoFocus, site.key]);
  const markStyle =
    view === 'change'
      ? (change?.style ?? null)
      : view === 'flow'
        ? flowStyle(classifyFlow(site, clock))
        : floodStyle(classifyFlood(site, clock, noaaOk));
  const r = site.reading;
  const nws = site.nws;
  const chartUnit: 'cfs' | 'ft' = r?.dischargeCfs !== null && r?.dischargeCfs !== undefined ? 'cfs' : 'ft';
  const history = useHistory(site.kind === 'usgs' ? site.siteId : null, chartUnit);
  const floodCls = classifyFlood(site, clock, noaaOk);
  const [more, setMore] = useState(false);

  return (
    <section aria-label={`Details for ${site.name}`} className="space-y-3 p-4">
      <header className="flex items-start gap-2">
        <EddyIcon name="gaugeStation" size={28} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 ref={heading} tabIndex={-1} className={`text-base font-bold leading-snug outline-none ${styles.breakAnywhere}`}>
            {site.name}
          </h2>
          <p className={`text-xs ${styles.muted}`}>
            {[site.stateCode, site.kind === 'usgs' ? `USGS ${site.siteId}` : null, site.lid ? `NWS ${site.lid}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Button variant="ghost" aria-label="Close details" onClick={onClose} className="min-h-11 min-w-11 !p-2">
          <X size={18} aria-hidden />
        </Button>
      </header>

      {/* Condition for the active view first, the other view's status second. */}
      <div className="space-y-1.5 text-sm">
        {view === 'change' ? (
          <p className="flex items-start gap-2 font-semibold">
            {markStyle && <MarkSymbol style={markStyle} palette={palette} />}
            <span>{change ? change.text : 'Change history is still being recorded for this window.'}</span>
          </p>
        ) : view === 'flow' ? (
          <p className="flex items-start gap-2 font-semibold">
            {markStyle && <MarkSymbol style={markStyle} palette={palette} />}
            <span>{flowSentence(site, clock)}</span>
          </p>
        ) : (
          <p className="flex items-start gap-2 font-semibold">
            {markStyle && <MarkSymbol style={markStyle} palette={palette} />}
            <span>
            {!noaaOk
              ? 'NWS flood status is unavailable for this snapshot.'
              : nws
                ? floodCls === 'not_current'
                  ? 'The NWS observation here is not current.'
                  : FLOOD_STATUS_TEXT[nws.observed].sentence
                : 'No NWS flood forecast point at this gauge.'}
            </span>
          </p>
        )}
        {view !== 'flow' && site.kind === 'usgs' && <p className={styles.muted}>{flowSentence(site, clock)}</p>}
        {view !== 'flooding' && nws && noaaOk && isFlooding(nws.observed) && floodCls !== 'not_current' && (
          <p className={styles.muted}>NWS: {FLOOD_STATUS_TEXT[nws.observed].label.toLowerCase()} observed.</p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className={`text-xs ${styles.muted}`}>Discharge</dt>
          <dd className={`${styles.mono} font-bold`}>{r?.dischargeCfs != null ? `${nf.format(r.dischargeCfs)} cfs` : '—'}</dd>
        </div>
        <div>
          <dt className={`text-xs ${styles.muted}`}>{site.kind === 'nws' ? 'NWS stage' : 'Gauge height'}</dt>
          <dd className={`${styles.mono} font-bold`}>
            {site.kind === 'nws'
              ? nws?.observedValue != null
                ? `${nf.format(nws.observedValue)} ${nws.units ?? ''}`
                : '—'
              : r?.gaugeHeightFt != null
                ? `${r.gaugeHeightFt.toFixed(2)} ft`
                : '—'}
          </dd>
        </div>
      </dl>

      <p className={`text-xs ${styles.muted}`}>
        Observed {formatTime(site.kind === 'nws' ? nws?.observedAt ?? null : r?.observedAt ?? null)} (
        {formatAge(site.kind === 'nws' ? nws?.observedAt ?? null : r?.observedAt ?? null, clock)})
      </p>

      {nws && noaaOk && (isFlooding(nws.forecast) || nws.forecast === 'action') && (
        <p className="rounded-md border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--nm-hairline)' }}>
          <span className="font-semibold">NWS forecast:</span> {FLOOD_STATUS_TEXT[nws.forecast].label.toLowerCase()}
          {nws.forecastValidAt !== null && <> by {formatTime(nws.forecastValidAt)}</>}
          {nws.forecastIssuedAt !== null && <> · issued {formatTime(nws.forecastIssuedAt)}</>}
        </p>
      )}

      {site.kind === 'usgs' &&
        (history.points ? (
          <Sparkline points={history.points} unit={chartUnit} />
        ) : history.error ? (
          <p className={`text-xs ${styles.muted}`}>The 7-day chart could not load.</p>
        ) : (
          <p role="status" className={`text-xs ${styles.muted}`}>
            Loading 7-day chart…
          </p>
        ))}

      <div className="flex flex-col gap-2">
        {site.kind === 'usgs' && site.siteId && (
          <Button href={`/gauges/${encodeURIComponent(site.siteId)}`} variant="secondary" className="w-full">
            {site.curated ? 'Eddy’s read & full gauge →' : 'Full gauge page & chart →'}
          </Button>
        )}
        {site.lid && (
          <Button href={`https://water.noaa.gov/gauges/${site.lid.toLowerCase()}`} external variant="outline" className="w-full">
            NWS hydrograph ↗
          </Button>
        )}
      </div>

      <div className={styles.hairline}>
        <button type="button" className={`mt-2 min-h-11 text-xs font-semibold underline ${styles.muted}`} onClick={() => setMore((v) => !v)} aria-expanded={more}>
          {more ? 'Hide technical details' : 'Technical details'}
        </button>
        {more && (
          <dl className={`mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs ${styles.muted}`}>
            {site.kind === 'usgs' && (
              <>
                <dt>Seasonal percentile</dt>
                <dd className={styles.mono}>
                  {seasonalPercentileText(r?.flowPercentile ?? null)}
                </dd>
                <dt>USGS flags</dt>
                <dd>{r?.suspect ? 'suspect qualifier' : 'none'}</dd>
              </>
            )}
            {nws && (
              <>
                <dt>NWS observed status</dt>
                <dd className={styles.mono}>{nws.observed}</dd>
                <dt>NWS forecast status</dt>
                <dd className={styles.mono}>{nws.forecast}</dd>
              </>
            )}
            <dt>Snapshot</dt>
            <dd>{formatTime(capturedAt)}</dd>
            <dt>Position</dt>
            <dd className={styles.mono}>
              {site.lat.toFixed(4)}, {site.lng.toFixed(4)}
            </dd>
            <dt>Sources</dt>
            <dd>USGS Water Data{nws ? ', NOAA/NWS' : ''}</dd>
          </dl>
        )}
      </div>
    </section>
  );
}
