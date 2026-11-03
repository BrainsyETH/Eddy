'use client';

// The wall's persistent legend: what the marks on screen mean, readable from
// across a room, visible whether or not the controls are. Default in
// fullscreen; the text-free map is an explicit choice (Settings / tray).
//
// Symbols come from wallStyle — the table the canvas draws the wall with — so
// the legend cannot disagree with the map. Flooding keeps action stage apart
// from the flood categories: NWS defines it as the stage at which to prepare
// for possible significant conditions, not as flooding.

import { EXTREME_HIGH, EXTREME_LOW, wallStyle, type FloodClass, type FlowClass, type MapView } from '@/lib/national-map/marks';
import type { MapPalette } from '@/lib/national-map/theme';
import { CHANGE_LEGEND, changeStyle, type ChangeWindow } from '@/lib/national-map/change';
import { formatTime, MarkSymbol } from './Legend';
import styles from './national-map.module.css';

type Row = { cls: FlowClass | FloodClass; label: string; extreme?: boolean };

const FLOOD_EVENTS: Row[] = [
  { cls: 'major', label: 'Major flooding' },
  { cls: 'moderate', label: 'Moderate flooding' },
  { cls: 'minor', label: 'Minor flooding' },
];
const FLOOD_CONTEXT: Row[] = [
  { cls: 'action', label: 'Action stage' },
  { cls: 'below', label: 'Below flood stage' },
];
const FLOW_ROWS: Row[] = [
  { cls: 'much_higher', label: 'Much higher than usual' },
  { cls: 'higher', label: 'Higher than usual' },
  { cls: 'normal', label: 'Normal for the date' },
  { cls: 'lower', label: 'Lower than usual' },
  { cls: 'much_lower', label: 'Much lower than usual' },
];

export function WallLegend({
  view,
  palette,
  noaaOk,
  capturedAt,
  liveStatus,
  pulses,
  journey,
  strip,
  changeWindow = null,
  place = null,
}: {
  view: MapView;
  palette: MapPalette;
  noaaOk: boolean;
  capturedAt: number | null;
  /** Why the view is not live, or null — replaces the update line. */
  liveStatus: string | null;
  /** Event rings are animating (motion on, view live). */
  pulses: boolean;
  /** A "Follow the river" journey can run (explains the moving line). */
  journey: boolean;
  /** Narrow / portrait screens: a bottom strip instead of a side panel. */
  strip: boolean;
  /** Change view: the window compared, or null while history is still building. */
  changeWindow?: ChangeWindow | null;
  /** The place on show ("Missouri"), or null for the whole country. */
  place?: string | null;
}) {
  const symbol = (r: Row) => {
    const style = wallStyle(view, r.cls, r.extreme);
    return style ? <MarkSymbol style={style} palette={palette} css={{ width: '1.5em', height: '1.5em' }} /> : null;
  };
  const row = (r: Row) => (
    <li key={`${r.cls}${r.extreme ? '-x' : ''}`} className={styles.wallLegendRow}>
      {symbol(r)}
      <span>{r.label}</span>
    </li>
  );
  const flooding = view === 'flooding';
  const change = view === 'change';
  const title = flooding
    ? 'Flooding · Observed'
    : change
      ? `Change · ${changeWindow === '6h' ? 'Last 6 h' : 'Last 24 h'}`
      : 'Flow · Versus usual';
  const changeRow = (cls: string) => {
    const item = CHANGE_LEGEND.find((c) => c.cls === cls)!;
    const style = changeStyle(item.sample, true);
    return (
      <li key={cls} className={styles.wallLegendRow}>
        {style && <MarkSymbol style={style} palette={palette} css={{ width: '1.5em', height: '1.5em' }} />}
        <span>{item.label}</span>
      </li>
    );
  };
  return (
    <section
      className={`${styles.wallLegend} ${strip ? styles.wallLegendStrip : ""}`}
      aria-label={`${title} legend`}
    >
      {place && <p className={styles.wallLegendPlace}>{place}</p>}
      <h2 className={styles.wallLegendTitle}>{title}</h2>
      {change ? (
        changeWindow ? (
          <>
            <ul className={styles.wallLegendList}>{['flood_up', 'flood_down'].map(changeRow)}</ul>
            <ul className={`${styles.wallLegendList} ${styles.wallLegendApart}`} aria-label="Flow">
              {['rising_fast', 'rising', 'steady', 'falling', 'falling_fast'].map(changeRow)}
            </ul>
          </>
        ) : (
          <p className={styles.wallLegendNote}>Change history is still being recorded; comparisons begin once a full window exists.</p>
        )
      ) : flooding && !noaaOk ? (
        <p className={styles.wallLegendNote}>NWS flood status is unavailable for this snapshot — not a report of no flooding.</p>
      ) : flooding ? (
        <>
          <ul className={styles.wallLegendList}>{FLOOD_EVENTS.map(row)}</ul>
          <ul className={`${styles.wallLegendList} ${styles.wallLegendApart}`} aria-label="Not flooding">
            {FLOOD_CONTEXT.map(row)}
          </ul>
        </>
      ) : (
        <ul className={styles.wallLegendList}>
          {FLOW_ROWS.map(row)}
          <li className={`${styles.wallLegendRow} ${styles.wallLegendFine}`}>
            <span className={styles.wallLegendPair} aria-hidden="true">
              {symbol({ cls: 'much_higher', label: '', extreme: true })}
            </span>
            <span>
              Larger: beyond the {EXTREME_HIGH}th / {EXTREME_LOW}th percentile for the date
            </span>
          </li>
        </ul>
      )}
      {(pulses || journey) && (
        <ul className={`${styles.wallLegendList} ${styles.wallLegendApart} ${styles.wallLegendFine}`} aria-label="Motion">
          {pulses && (flooding || change) && (
            <li className={styles.wallLegendRow}>
              <svg viewBox="0 0 14 14" aria-hidden="true" style={{ width: '1.5em', height: '1.5em' }} className="shrink-0">
                <circle cx="7" cy="7" r="2.6" fill={palette.flood.minor} />
                <circle cx="7" cy="7" r="5.6" fill="none" stroke={palette.flood.minor} strokeWidth="1.1" opacity="0.6" />
              </svg>
              <span>{change ? 'Pulsing ring: flooding began or worsened' : 'Pulsing ring: a current flood'}</span>
            </li>
          )}
          {journey && (
            <li className={styles.wallLegendRow}>
              <svg viewBox="0 0 14 14" aria-hidden="true" style={{ width: '1.5em', height: '1.5em' }} className="shrink-0">
                <path d="M1 10 C4 3, 8 12, 13 4" fill="none" stroke={palette.journeyGlow} strokeWidth="3.4" strokeLinecap="round" opacity={palette.journeyGlowAlpha} />
                <path d="M1 10 C4 3, 8 12, 13 4" fill="none" stroke={palette.journeyCore} strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span>Bright line: a river followed downstream</span>
            </li>
          )}
        </ul>
      )}
      <p className={styles.wallLegendSource}>
        {liveStatus ?? (capturedAt !== null ? `Updated ${formatTime(capturedAt)}` : 'Waiting for data')}
        {' · '}
        {flooding || change ? 'NOAA/NWS, USGS' : 'USGS'}
      </p>
    </section>
  );
}
