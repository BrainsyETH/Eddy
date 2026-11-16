'use client';

// The vertical wall's stats band (top of a portrait display): a calm,
// readable anchor that says what the map shows and what changed. The map
// supplies the movement; the band supplies meaning.
//
//   * Flooding: the count in flood above its 24-hour history (hourly bars by
//     severity, so a falling total cannot hide a rise in major flooding;
//     missing hours stay gaps), each category with its own change.
//   * Flow: the actual distribution, much lower → much higher, as one broad
//     strip whose segments ease to new widths when the distribution changes.
//   * The comparison (band.ts) keeps real changes — gauges that entered or
//     left flood — apart from reporting changes.
//   * Freshness: when this snapshot was taken and when the next is due.
//
// Motion is brief and settles: a number that changed crossfades once when a
// new snapshot lands, in a fixed position; nothing loops. Off with the
// Motion setting or the system's reduced-motion preference (CSS).

import { useState } from 'react';
import type { ChangeSummary } from '@/lib/national-map/change';
import { changeStyle } from '@/lib/national-map/change';
import { signed, transitionSentence, type Transitions } from '@/lib/national-map/band';
import { wallStyle, type FloodSummary, type FlowSummary, type MapView, type MarkStyle } from '@/lib/national-map/marks';
import type { MapPalette } from '@/lib/national-map/theme';
import type { TrendPoint } from '@/lib/national-map/trend';
import { formatAge, formatTime, MarkSymbol } from './Legend';
import styles from './national-map.module.css';

const nf = new Intl.NumberFormat('en-US');
/** "9:27 PM" — the next snapshot is the same day, so the date is not repeated. */
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const HOUR = 3_600_000;
/** The recorder captures every 15 minutes. */
const CAPTURE_MS = 15 * 60_000;

interface Tile {
  key: string;
  value: string;
  label: string;
  style?: MarkStyle | null;
  /** Change since the earlier snapshot (null: no comparison). */
  delta?: number | null;
}

/**
 * A number that crossfades once when its value changes — never on first
 * paint. The span is keyed by value, so a new value mounts afresh and runs
 * the one-shot animation; an unchanged value never moves.
 */
function Num({ value }: { value: string }) {
  const [first] = useState(value);
  return (
    <span key={value} className={`${styles.wallHeadNum} ${value !== first ? styles.wallHeadNumIn : ''}`} style={{ minWidth: `${Math.max(2, value.length)}ch` }}>
      {value}
    </span>
  );
}

function Chip({ delta, hours }: { delta: number | null | undefined; hours: number | null }) {
  if (delta === null || delta === undefined || hours === null) return null;
  return (
    <span className={styles.wallHeadChip} data-dir={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}>
      {signed(delta)}
      <span className={styles.wallHeadChipSince}> vs {hours} h ago</span>
    </span>
  );
}

export function WallStats({
  ref,
  view,
  palette,
  place,
  flow,
  flood,
  change,
  noaaOk,
  windowLabel,
  rated,
  trend,
  transitions,
  capturedAt,
  now,
  liveStatus,
}: {
  ref?: React.Ref<HTMLElement>;
  view: MapView;
  palette: MapPalette;
  place: string | null;
  flow: FlowSummary | null;
  flood: FloodSummary | null;
  change: ChangeSummary | null;
  noaaOk: boolean;
  /** Change: "6 h" / "24 h", or null while history builds. */
  windowLabel: string | null;
  /** Eddy's rated gauges in view: floatable (flowing or good) of all with a current reading. */
  rated: { floatable: number; current: number } | null;
  /** Flooding: the 24 h trend for the place (null while loading). */
  trend: TrendPoint[] | null;
  /** Changes since the earlier recorded snapshot (null: none recorded yet). */
  transitions: Transitions | null;
  capturedAt: number | null;
  now: number;
  /** Why the view is not live, or null. */
  liveStatus: string | null;
}) {
  const hours = transitions?.hours ?? null;
  const d = (k: string) => (transitions ? (transitions.delta[k] ?? null) : null);
  const title = view === 'flooding' ? 'Flooding · Observed' : view === 'change' ? `Change${windowLabel ? ` · Last ${windowLabel}` : ''}` : 'Flow · Versus usual';

  let body: React.ReactNode = null;
  if (view === 'flooding') {
    if (!noaaOk || !flood) {
      body = <p className={styles.wallHeadNote}>NWS flood status is unavailable for this snapshot — not a report of no flooding.</p>;
    } else {
      const tiles: Tile[] = [
        { key: 'major', value: nf.format(flood.major), label: 'Major', style: wallStyle('flooding', 'major'), delta: d('major') },
        { key: 'moderate', value: nf.format(flood.moderate), label: 'Moderate', style: wallStyle('flooding', 'moderate'), delta: d('moderate') },
        { key: 'minor', value: nf.format(flood.minor), label: 'Minor', style: wallStyle('flooding', 'minor'), delta: d('minor') },
        { key: 'action', value: nf.format(flood.action), label: 'Action stage', style: wallStyle('flooding', 'action'), delta: d('action') },
      ];
      body = (
        <>
          <div className={styles.wallHeadLeadRow}>
            <div className={styles.wallHeadLeadNum}>
              <span className={styles.wallHeadBig}>
                <Num value={nf.format(flood.major + flood.moderate + flood.minor)} />
              </span>
              <span className={styles.wallHeadLabel}>
                in flood of {nf.format(flood.assessed)} reporting <Chip delta={d('flooding')} hours={hours} />
              </span>
            </div>
            <BandTrend points={trend} palette={palette} />
          </div>
          {transitions && <p className={styles.wallHeadWhy}>{transitionSentence(transitions, 'flood')}</p>}
          <Tiles tiles={tiles} palette={palette} hours={hours} />
        </>
      );
    }
  } else if (view === 'flow') {
    if (!flow || !flow.compared) {
      body = <p className={styles.wallHeadNote}>Waiting for current readings.</p>;
    } else {
      const pct = (n: number) => `${Math.round((n / flow.compared) * 100)}%`;
      const tiles: Tile[] = [
        { key: 'mh', value: nf.format(flow.bands.much_higher), label: 'Much higher', style: wallStyle('flow', 'much_higher'), delta: d('much_higher') },
        { key: 'ml', value: nf.format(flow.bands.much_lower), label: 'Much lower', style: wallStyle('flow', 'much_lower'), delta: d('much_lower') },
      ];
      if (rated && rated.current > 0) tiles.push({ key: 'rated', value: `${nf.format(rated.floatable)} of ${nf.format(rated.current)}`, label: 'Eddy-rated gauges floatable' });
      body = (
        <>
          <div className={styles.wallHeadLeadNum}>
            <span className={styles.wallHeadBig}>
              <Num value={pct(flow.bands.normal)} />
            </span>
            <span className={styles.wallHeadLabel}>
              normal for the date · {nf.format(flow.compared)} gauges compared
              {transitions && transitions.delta.compared ? ` (${signed(transitions.delta.compared)} reporting vs ${hours} h ago)` : ''}
            </span>
          </div>
          <Distribution flow={flow} palette={palette} />
          {transitions && <p className={styles.wallHeadWhy}>{transitionSentence(transitions, 'an unusual band')}</p>}
          <Tiles tiles={tiles} palette={palette} hours={hours} />
        </>
      );
    }
  } else if (!change || !windowLabel) {
    body = <p className={styles.wallHeadNote}>Change history is still being recorded.</p>;
  } else {
    const c = change.counts;
    const sample = (cls: 'rising_fast' | 'falling_fast' | 'flood_up') => changeStyle({ cls, magnitude: 0, floodNow: 'moderate', floodThen: 'below' });
    body = (
      <>
        <div className={styles.wallHeadLeadNum}>
          <span className={styles.wallHeadBig}>
            <Num value={nf.format(c.rising + c.rising_fast)} />
          </span>
          <span className={styles.wallHeadLabel}>rising of {nf.format(change.compared)} compared</span>
        </div>
        <Tiles
          tiles={[
            { key: 'upfast', value: nf.format(c.rising_fast), label: 'Rising sharply', style: sample('rising_fast') },
            { key: 'downfast', value: nf.format(c.falling_fast), label: 'Falling sharply', style: sample('falling_fast') },
            { key: 'flood', value: nf.format(c.flood_up), label: 'Flood category rose', style: sample('flood_up') },
          ]}
          palette={palette}
         
          hours={null}
        />
      </>
    );
  }

  return (
    <section ref={ref} className={styles.wallHead} aria-label="Summary">
      <p className={styles.wallHeadTitle}>
        <span>{place ?? 'United States'}</span>
        <span className={styles.wallHeadView}>{title}</span>
      </p>
      {body}
      <p className={styles.wallHeadFresh}>
        {liveStatus ??
          (capturedAt !== null
            ? `Snapshot ${formatTime(capturedAt)} · ${formatAge(capturedAt, now)} · next due about ${timeFmt.format(new Date(capturedAt + CAPTURE_MS))}`
            : 'Waiting for data')}
      </p>
    </section>
  );
}

function Tiles({ tiles, palette, hours }: { tiles: Tile[]; palette: MapPalette; hours: number | null }) {
  return (
    <ul className={styles.wallHeadTiles}>
      {tiles.map((t) => (
        <li key={t.key}>
          <span className={styles.wallHeadValue}>
            {t.style && <MarkSymbol style={t.style} palette={palette} css={{ width: '0.62em', height: '0.62em' }} />}
            <Num value={t.value} />
          </span>
          <span className={styles.wallHeadLabel}>
            {t.label} <Chip delta={t.delta} hours={hours} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The last 24 hours of flooding in the place, one bar per hour, stacked by
 * severity in NWS colours. A capture whose NOAA read failed is a short tick;
 * an hour with no recorded capture is an empty slot. Redrawn only when new
 * data arrives — no pulse, no animation.
 */
function BandTrend({ points, palette }: { points: TrendPoint[] | null; palette: MapPalette }) {
  if (!points || points.length < 2) {
    return <p className={styles.wallHeadTrendNote}>The 24-hour history builds as snapshots are recorded.</p>;
  }
  const W = 240;
  const H = 46;
  const slot = W / 24;
  const bar = slot * 0.7;
  const end = points[points.length - 1].t;
  const max = Math.max(1, ...points.filter((p) => p.ok).map((p) => p.major + p.moderate + p.minor));
  const ok = points.filter((p) => p.ok);
  const first = ok[0];
  const last = ok[ok.length - 1];
  const label = first && last
    ? `In flood over the last 24 hours: ${first.major + first.moderate + first.minor} at ${formatTime(first.t)}, ${last.major + last.moderate + last.minor} at ${formatTime(last.t)}; major ${first.major} → ${last.major}.`
    : 'In flood over the last 24 hours: NOAA could not be read.';
  return (
    <figure className={styles.wallHeadTrend}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke={palette.flood.below} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {points.map((p) => {
          const i = 23 - Math.min(23, Math.max(0, Math.round((end - p.t) / HOUR)));
          const x = i * slot + (slot - bar) / 2;
          if (!p.ok) return <rect key={p.t} x={x} y={H - 3} width={bar} height={3} fill={palette.flood.notCurrent} opacity={0.6} />;
          let base = H;
          return (['minor', 'moderate', 'major'] as const).map((k) => {
            const h = (p[k] / max) * (H - 2);
            if (h <= 0) return null;
            base -= h;
            return <rect key={`${p.t}${k}`} x={x} y={base} width={bar} height={h} fill={palette.flood[k]} />;
          });
        })}
      </svg>
      <figcaption>
        <span>24 h ago</span>
        <span>now</span>
      </figcaption>
    </figure>
  );
}

/** The actual Flow distribution, much lower → much higher; segments ease to new widths. */
function Distribution({ flow, palette }: { flow: FlowSummary; palette: MapPalette }) {
  const keys = ['much_lower', 'lower', 'normal', 'higher', 'much_higher'] as const;
  const names: Record<(typeof keys)[number], string> = {
    much_lower: 'Much lower',
    lower: 'Lower',
    normal: 'Normal',
    higher: 'Higher',
    much_higher: 'Much higher',
  };
  const share = (k: (typeof keys)[number]) => flow.bands[k] / flow.compared;
  const label = keys.map((k) => `${names[k]} ${Math.round(share(k) * 100)}%`).join(', ');
  return (
    <figure className={styles.wallHeadDist}>
      <div className={styles.wallHeadDistBar} role="img" aria-label={`Flow distribution: ${label}`}>
        {keys.map((k) => (
          <span key={k} style={{ flexGrow: Math.max(0.0001, share(k)), background: palette.flow[k] }} />
        ))}
      </div>
      <div className={styles.wallHeadDistLabels} aria-hidden="true">
        {keys.map((k) => (
          <span key={k} style={{ flexGrow: Math.max(0.0001, share(k)) }}>
            {/* Wide segments carry their name; narrow ones just the share. */}
            {share(k) >= 0.12 ? (
              <>
                <strong>{Math.round(share(k) * 100)}%</strong> {names[k]}
              </>
            ) : share(k) >= 0.04 ? (
              <strong>{Math.round(share(k) * 100)}%</strong>
            ) : null}
          </span>
        ))}
      </div>
    </figure>
  );
}
