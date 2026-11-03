'use client';

// The vertical wall's stats band (top of a portrait display): the place and
// view, then a few large counts for what the map is showing — the numbers a
// guest reads before the map. Counts are the Explore legend's own summaries
// (scoped to the place), so the band, the legend and the map always agree.

import type { ChangeSummary } from '@/lib/national-map/change';
import { changeStyle } from '@/lib/national-map/change';
import { wallStyle, type FloodSummary, type FlowSummary, type MapView, type MarkStyle } from '@/lib/national-map/marks';
import type { MapPalette } from '@/lib/national-map/theme';
import { MarkSymbol } from './Legend';
import styles from './national-map.module.css';

const nf = new Intl.NumberFormat('en-US');

interface Tile {
  key: string;
  value: string;
  label: string;
  style?: MarkStyle | null;
  /** The headline count: larger. */
  lead?: boolean;
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
}) {
  const title = view === 'flooding' ? 'Flooding · Observed' : view === 'change' ? `Change${windowLabel ? ` · Last ${windowLabel}` : ''}` : 'Flow · Versus usual';
  const tiles: Tile[] = [];
  let note: string | null = null;
  if (view === 'flooding') {
    if (!noaaOk || !flood) note = 'NWS flood status is unavailable for this snapshot — not a report of no flooding.';
    else {
      tiles.push(
        { key: 'in', value: nf.format(flood.major + flood.moderate + flood.minor), label: `in flood of ${nf.format(flood.assessed)}`, lead: true },
        { key: 'major', value: nf.format(flood.major), label: 'Major', style: wallStyle('flooding', 'major') },
        { key: 'moderate', value: nf.format(flood.moderate), label: 'Moderate', style: wallStyle('flooding', 'moderate') },
        { key: 'minor', value: nf.format(flood.minor), label: 'Minor', style: wallStyle('flooding', 'minor') },
        { key: 'action', value: nf.format(flood.action), label: 'Action stage', style: wallStyle('flooding', 'action') },
      );
    }
  } else if (view === 'flow') {
    if (!flow || !flow.compared) note = 'Waiting for current readings.';
    else {
      const pct = (n: number) => `${Math.round((n / flow.compared) * 100)}%`;
      tiles.push(
        { key: 'normal', value: pct(flow.bands.normal), label: `normal for the date · ${nf.format(flow.compared)} gauges`, lead: true },
        { key: 'mh', value: nf.format(flow.bands.much_higher), label: 'Much higher', style: wallStyle('flow', 'much_higher') },
        { key: 'ml', value: nf.format(flow.bands.much_lower), label: 'Much lower', style: wallStyle('flow', 'much_lower') },
      );
      if (rated && rated.current > 0) {
        tiles.push({ key: 'rated', value: `${nf.format(rated.floatable)} of ${nf.format(rated.current)}`, label: 'Eddy-rated gauges floatable' });
      }
    }
  } else if (!change || !windowLabel) {
    note = 'Change history is still being recorded.';
  } else {
    const c = change.counts;
    const sample = (cls: 'rising_fast' | 'falling_fast' | 'flood_up') => changeStyle({ cls, magnitude: 0, floodNow: 'moderate', floodThen: 'below' });
    tiles.push(
      { key: 'up', value: nf.format(c.rising + c.rising_fast), label: `rising of ${nf.format(change.compared)}`, lead: true },
      { key: 'upfast', value: nf.format(c.rising_fast), label: 'Rising sharply', style: sample('rising_fast') },
      { key: 'downfast', value: nf.format(c.falling_fast), label: 'Falling sharply', style: sample('falling_fast') },
      { key: 'flood', value: nf.format(c.flood_up), label: 'Flood category rose', style: sample('flood_up') },
    );
  }
  return (
    <section ref={ref} className={styles.wallHead} aria-label="Summary">
      <p className={styles.wallHeadTitle}>
        <span>{place ?? 'United States'}</span>
        <span className={styles.wallHeadView}>{title}</span>
      </p>
      {note ? (
        <p className={styles.wallHeadNote}>{note}</p>
      ) : (
        <ul className={styles.wallHeadTiles}>
          {tiles.map((t) => (
            <li key={t.key} className={t.lead ? styles.wallHeadLead : undefined}>
              <span className={styles.wallHeadValue}>
                {t.style && <MarkSymbol style={t.style} palette={palette} css={{ width: '0.62em', height: '0.62em' }} />}
                {t.value}
              </span>
              <span className={styles.wallHeadLabel}>{t.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
