'use client';

// The active view's legend: every mark the map can draw in this view, its
// meaning in plain words, and how many sites carry it right now. Symbols are
// drawn from the same style table the canvas uses, so legend and map cannot
// disagree about a shape or a color.

import { Fragment } from 'react';
import type { MapPalette } from '@/lib/national-map/theme';
import {
  EXTREME_HIGH,
  floodStyle,
  flowExtremeHighStyle,
  flowStyle,
  type FloodClass,
  type FloodSummary,
  type FlowClass,
  type FlowSummary,
  type MarkStyle,
} from '@/lib/national-map/marks';
import styles from './national-map.module.css';

function resolve(p: MapPalette, key: string): string {
  const [a, b] = key.split('.');
  const v = b ? (p as unknown as Record<string, Record<string, string>>)[a]?.[b] : (p as unknown as Record<string, string>)[a];
  return typeof v === 'string' ? v : '#888';
}

export function MarkSymbol({
  style,
  palette,
  size = 14,
  css,
}: {
  style: MarkStyle;
  palette: MapPalette;
  size?: number;
  /** Optional CSS box (e.g. em-sized for the wall legend); the drawing scales with it. */
  css?: React.CSSProperties;
}) {
  // Mirrors drawMarkShape in renderer.ts: backing disc for fills this theme's
  // land would swallow, an outer keyline under rings that need one, a small
  // × for unavailable data.
  const c = resolve(palette, style.color);
  const keyline = style.color.startsWith('flood') ? palette.floodKeyline : palette.flowKeyline;
  const backed = palette.backed.includes(style.color);
  const r = Math.min(4.6, 2.2 + style.radius * 0.8);
  const m = size / 2;
  const path = (rr: number) =>
    style.shape === 'diamond'
      ? `M${m} ${m - rr * 1.15}L${m + rr * 1.15} ${m}L${m} ${m + rr * 1.15}L${m - rr * 1.15} ${m}Z`
      : style.shape === 'triangle'
        ? `M${m} ${m - rr * 1.2}L${m + rr * 1.1} ${m + rr * 0.8}L${m - rr * 1.1} ${m + rr * 0.8}Z`
        : `M${m - rr} ${m}a${rr} ${rr} 0 1 0 ${rr * 2} 0a${rr} ${rr} 0 1 0 ${-rr * 2} 0`;
  const ring = style.shape === 'ring';
  if (style.shape === 'cross') {
    const a = r * 0.85;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0" style={css}>
        <path d={`M${m - a} ${m - a}L${m + a} ${m + a}M${m + a} ${m - a}L${m - a} ${m + a}`} stroke={c} strokeWidth={1.8} strokeLinecap="round" fill="none" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0" style={{ opacity: Math.max(0.75, style.alpha ?? 1), ...css }}>
      {backed && <path d={path(r + 0.9)} fill={palette.backing} />}
      {ring && style.keyline && <path d={path(r)} fill="none" stroke={keyline} strokeWidth={3} />}
      <path
        d={path(r)}
        fill={ring ? 'none' : c}
        fillOpacity={backed ? palette.backedFillAlpha : 1}
        stroke={ring ? c : style.keyline && !backed ? keyline : 'none'}
        strokeWidth={ring ? 1.8 : 1}
      />
    </svg>
  );
}

const nf = new Intl.NumberFormat('en-US');

function Row({ style, palette, label, count }: { style: MarkStyle | null; palette: MapPalette; label: string; count: number | null }) {
  if (!style) return null;
  return (
    <li className={styles.legendRow}>
      <MarkSymbol style={style} palette={palette} />
      <span className="min-w-0 flex-1">{label}</span>
      {count !== null && <span className={`${styles.mono} ${styles.muted} text-xs`}>{nf.format(count)}</span>}
    </li>
  );
}

export function FlowLegend({ palette, summary }: { palette: MapPalette; summary: FlowSummary | null }) {
  const rows: Array<[FlowClass, string, number | null]> = [
    ['much_higher', 'Much higher than usual', summary?.bands.much_higher ?? null],
    ['higher', 'Higher than usual', summary?.bands.higher ?? null],
    ['normal', 'Normal for this time of year', summary?.bands.normal ?? null],
    ['lower', 'Lower than usual', summary?.bands.lower ?? null],
    ['much_lower', 'Much lower than usual', summary?.bands.much_lower ?? null],
    ['no_comparison', 'Current, no seasonal comparison', summary?.noComparison ?? null],
    ['stale', 'Not current or flagged by USGS', summary?.stale ?? null],
  ];
  return (
    <ul className="space-y-0.5" aria-label="Flow legend">
      {rows.map(([cls, label, count]) => (
        <Fragment key={cls}>
          <Row style={flowStyle(cls)} palette={palette} label={label} count={count} />
          {/* The vivid colours give the rarest highs their own colour, so
              they get their own row (a subset of Much higher). */}
          {cls === 'much_higher' && palette.flowExtremeHigh !== palette.flow.much_higher && (
            <Row
              style={flowExtremeHighStyle()}
              palette={palette}
              label={`Of those, at or above the ${EXTREME_HIGH}th-percentile flow for the date`}
              count={summary?.extremeHigh ?? null}
            />
          )}
        </Fragment>
      ))}
    </ul>
  );
}

export function FloodLegend({ palette, summary, noaaOk }: { palette: MapPalette; summary: FloodSummary | null; noaaOk: boolean }) {
  if (!noaaOk) {
    return (
      <p className={`text-sm ${styles.muted}`}>
        NWS flood status could not be read for this snapshot. Gauges are shown without flood categories — this is not a
        report of no flooding.
      </p>
    );
  }
  const rows: Array<[FloodClass, string, number | null]> = [
    ['major', 'Major flooding', summary?.major ?? null],
    ['moderate', 'Moderate flooding', summary?.moderate ?? null],
    ['minor', 'Minor flooding', summary?.minor ?? null],
    ['action', 'Action stage (not flooding)', summary?.action ?? null],
    ['below', 'Below flood stage', summary ? summary.assessed - summary.major - summary.moderate - summary.minor - summary.action : null],
    ['no_threshold', 'No NWS flood threshold', summary?.noThreshold ?? null],
    ['not_current', 'NWS reading not current', summary?.notCurrent ?? null],
    ['no_nws', 'USGS gauge, no NWS forecast point', null],
  ];
  return (
    <ul className="space-y-0.5" aria-label="Flooding legend">
      {rows.map(([cls, label, count]) => (
        <Row key={cls} style={floodStyle(cls)} palette={palette} label={label} count={count} />
      ))}
    </ul>
  );
}

const zoneFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

/** Local time with its zone — details always say which clock they mean. */
export function formatTime(ms: number | null): string {
  return ms === null || !Number.isFinite(ms) ? 'unknown time' : zoneFmt.format(new Date(ms));
}

export function formatAge(ms: number | null, now: number): string {
  if (ms === null) return 'unknown';
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}
