'use client';

// The White River from Bull Shoals Dam to Calico Rock, with past releases
// replayed down it on one clock.
//
// WHAT IS MEASURED AND WHAT IS NOT. The gauge near Norfork is the only place
// the study timed a release, and it is the only thing drawn solid: a ring that
// fills as past releases arrived. The bands between the dam and the gauge
// assume a steady pace (src/lib/release-timing/river.ts) and carry a hatch and
// an "Assumed pace" tag so they are not read as measurements. Nothing is
// reported below the gauge. The bands replay past releases; they are never
// today's water.

import { useEffect, useId, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Segmented, { type SegmentedOption } from '@/components/ui/Segmented';
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { hoursText, type Spread } from '@/lib/release-timing/findings';
import { frontMile, GAUGE_INDEX, GAUGE_MILE, MAP, paceShare, PLACES, riverFrame } from '@/lib/release-timing/river';
import { datedDay, roundedClockTime, shortDate, timeSpan, weekdayDate } from '@/lib/release-timing/time';
import styles from './release-timing.module.css';

const HOUR_MS = 3_600_000;
const HOURS_SHOWN = 24;
/** A full replay takes this long. */
const PLAY_SECONDS = 18;

export interface ShownRelease {
  /** When the release rose at the dam. The clock is read from here. */
  onsetMs: number;
  /** When the gauge rose for this release. */
  riseMs: number;
  sizeIndex: number;
}

export const SIZE_OPTIONS: SegmentedOption<number>[] = [
  { value: 0, label: '1', title: 'About 1 generator' },
  { value: 1, label: '2', title: 'About 2 generators' },
  { value: 2, label: '3', title: 'About 3 generators' },
  { value: 3, label: '4', title: 'About 4 generators' },
  { value: 4, label: '5+', title: '5 or more generators' },
];

export default function ReleaseMap({
  size,
  onSize,
  spreads,
  shown,
  playRequest,
}: {
  size: number;
  onSize: (index: number) => void;
  /** Past releases on a normal river, per size band. */
  spreads: Spread[];
  shown: ShownRelease;
  /** Bumped by "play this release": restart the clock at the gauge and run. */
  playRequest: number;
}) {
  const [selected, setSelected] = useState(GAUGE_INDEX);
  const [elapsed, setElapsed] = useState(11.5);
  const [playing, setPlaying] = useState(false);
  const [frame, width] = useMeasuredWidth<HTMLDivElement>(760, 300);
  const ids = useId().replace(/:/g, '');
  const river = useMemo(() => riverFrame(width), [width]);
  const q = spreads[size];
  const place = PLACES[selected];
  const share = paceShare(place);
  const when = (hours: number) => roundedClockTime(shown.onsetMs + hours * HOUR_MS);
  const observedHours = (shown.riseMs - shown.onsetMs) / HOUR_MS;
  const showsObserved = place.kind === 'gauge' && size === shown.sizeIndex;

  useEffect(() => {
    if (playRequest === 0) return;
    setSelected(GAUGE_INDEX);
    setElapsed(0);
    setPlaying(true);
  }, [playRequest]);

  useEffect(() => {
    if (!playing) return;
    // With reduced motion the clock still moves, in half-hour steps rather than a sweep.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timer = window.setInterval(() => setElapsed((t) => Math.min(HOURS_SHOWN, t + 0.5)), 400);
      return () => window.clearInterval(timer);
    }
    let last = performance.now();
    let request = requestAnimationFrame(function tick(now: number) {
      setElapsed((t) => Math.min(HOURS_SHOWN, t + ((now - last) / 1000) * (HOURS_SHOWN / PLAY_SECONDS)));
      last = now;
      request = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(request);
  }, [playing]);
  useEffect(() => {
    if (elapsed >= HOURS_SHOWN) setPlaying(false);
  }, [elapsed]);

  // Layers that depend only on the frame.
  const base = useMemo(() => {
    const gaugePath = river.slice(0, GAUGE_MILE);
    return {
      lakes: Object.values(MAP.lakes).flatMap((rings) => rings.map((ring) => `${river.line(ring)}Z`)),
      tributaries: Object.entries(MAP.tribs).map(([name, points]) => ({ name, d: river.line(points), major: name === 'Buffalo River' || name === 'Crooked Creek' })),
      norfork: river.line(MAP.norfork),
      norforkDam: river.project(MAP.norfork[0]),
      upper: gaugePath,
      lower: river.slice(GAUGE_MILE, PLACES[PLACES.length - 1].mile + 3),
      marks: PLACES.map((p, index) => ({ p, index, at: river.at(p.mile) })),
    };
  }, [river]);

  const front = (hours: number) => frontMile(elapsed, hours);
  const wide = river.narrow ? 15 : 20;
  const riverWidth = river.narrow ? 4 : 5;
  const typicalMile = front(q.median);
  const [frontX, frontY] = river.at(typicalMile);
  const arrived = q.sorted.filter((hours) => hours <= elapsed).length;
  const ringLength = 2 * Math.PI * 9;
  const label = (lon: number, lat: number) => { const [x, y] = river.project([lon, lat]); return { x, y }; };

  const risenHere = share === null ? 0 : q.sorted.filter((hours) => hours * share <= elapsed).length;
  const fraction = (hours: number) => Math.min(1, hours / HOURS_SHOWN);
  const percent = (hours: number) => `${(fraction(hours) * 100).toFixed(2)}%`;
  const barLabel = place.kind === 'gauge' ? 'Rose at the gauge' : `First rise at ${place.name}`;
  const ticks = river.narrow ? [0, 12, 24] : [0, 6, 12, 18, 24];
  // Gauge and dam last, so a tap on them is never taken by a neighbouring access point.
  const ordered = [...base.marks.filter((m) => !m.p.kind), ...base.marks.filter((m) => m.p.kind)];

  return (
    <section id="release-map" className={`card-panel scroll-mt-24 ${styles.explorer}`} aria-label="Release map">
      <div className={styles.stage}>
        <div ref={frame} className={styles.mapwrap}>
          <svg viewBox={`0 0 ${river.width} ${river.height}`} role="group" aria-label="Map of the White River from Bull Shoals Dam to Calico Rock">
            <defs>
              <clipPath id={`${ids}frame`}><rect width={river.width} height={river.height} /></clipPath>
              {/* A fine hatch over the bands: assumed, not measured. */}
              <mask id={`${ids}hatch`} maskUnits="userSpaceOnUse" x={0} y={0} width={river.width} height={river.height}>
                <path d={base.upper} fill="none" stroke="#B5B5B5" strokeWidth={wide + 4} strokeLinejoin="round" strokeLinecap="round" />
                <path d={base.upper} fill="none" stroke="#FFFFFF" strokeWidth={wide + 4} strokeDasharray="3 3" strokeLinejoin="round" />
              </mask>
            </defs>
            <g clipPath={`url(#${ids}frame)`} fill="none" strokeLinecap="round" strokeLinejoin="round">
              {base.lakes.map((d, i) => <path key={i} d={d} fill="var(--rt-lake)" />)}
              {base.tributaries.map((t) => <path key={t.name} d={t.d} stroke="var(--rt-trib)" strokeWidth={t.major ? 2.4 : 1.4} />)}
              <path d={base.norfork} stroke="var(--rt-river)" strokeWidth={3} />
              <path d={base.lower} stroke="var(--rt-river)" strokeWidth={riverWidth - 1} strokeDasharray="1 7" />
              <g mask={`url(#${ids}hatch)`} stroke="var(--rt-emph)">
                <path d={river.slice(front(q.max), front(q.min))} strokeOpacity={0.3} strokeWidth={wide} />
                <path d={river.slice(front(q.p90), front(q.p10))} strokeOpacity={0.45} strokeWidth={wide * 0.68} />
                <path d={river.slice(front(q.p75), front(q.p25))} strokeWidth={wide * 0.4} />
              </g>
              <path d={base.upper} stroke="var(--rt-river)" strokeWidth={riverWidth} />
              <path d={river.slice(0, front(q.max))} stroke="var(--rt-series)" strokeWidth={riverWidth + 1} />
              {elapsed > 0 && typicalMile < GAUGE_MILE && (
                <circle cx={frontX} cy={frontY} r={river.narrow ? 4 : 5} fill="var(--color-surface)" stroke="var(--rt-emph)" strokeWidth={2.5} />
              )}
            </g>
            <text {...label(river.narrow ? -92.575 : -92.612, 36.398)} className={styles.tWater} textAnchor="middle">Bull Shoals Lake</text>
            <text {...label(-92.165, 36.335)} className={styles.tWater} textAnchor="middle">Norfork Lake</text>
            {!river.narrow && (
              <>
                <text {...label(-92.497, 36.118)} className={styles.tWater}>Buffalo River</text>
                <text {...label(-92.6, 36.222)} className={styles.tWater} textAnchor="middle">Crooked Creek</text>
                <text {...label(-92.385, 36.338)} className={styles.tTown} textAnchor="middle">Mountain Home</text>
              </>
            )}
            <text {...label(-92.222, 36.252)} className={styles.tTown}>Norfork Dam</text>
            <rect x={base.norforkDam[0] - 5} y={base.norforkDam[1] - 5} width={10} height={10} rx={2} fill="var(--color-text-secondary)" />
            {ordered.map(({ p, index, at: [x, y] }) => {
              const on = index === selected;
              const labelled = on || (!p.minor && (!river.narrow || Boolean(p.kind) || p.name === 'Calico Rock'));
              const offset = (river.narrow && p.narrowLabel) || p.label || { dx: 10, dy: 4, anchor: 'start' as const };
              return (
                <g
                  key={p.name}
                  className={styles.hit}
                  role="button"
                  tabIndex={0}
                  aria-label={`${p.name}, mile ${p.mile}`}
                  aria-pressed={on}
                  onClick={() => setSelected(index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelected(index);
                    }
                  }}
                >
                  <title>{p.name}</title>
                  <circle cx={x} cy={y} r={p.minor ? (river.narrow ? 8 : 12) : 16} fill="transparent" stroke="transparent" className={styles.ring} />
                  {p.kind === 'dam' && <rect x={x - 8} y={y - 8} width={16} height={16} rx={3} fill="var(--color-text-primary)" stroke="var(--rt-land)" strokeWidth={2} />}
                  {p.kind === 'gauge' && (
                    <>
                      <circle cx={x} cy={y} r={13} fill="var(--color-surface)" stroke="var(--color-border-strong)" />
                      <circle cx={x} cy={y} r={9} fill="none" stroke="var(--rt-series-soft)" strokeWidth={5} />
                      <circle cx={x} cy={y} r={9} fill="none" stroke="var(--rt-series)" strokeWidth={5} transform={`rotate(-90 ${x} ${y})`} strokeDasharray={`${((arrived / q.sorted.length) * ringLength).toFixed(2)} ${ringLength.toFixed(2)}`} />
                    </>
                  )}
                  {!p.kind && (
                    <circle
                      cx={x}
                      cy={y}
                      r={on ? 8 : p.minor ? (river.narrow ? 2.5 : 3.5) : river.narrow ? 4.5 : 5.5}
                      fill={on ? 'var(--rt-emph)' : 'var(--color-surface)'}
                      stroke="var(--color-text-primary)"
                      strokeWidth={on || !p.minor ? 2.5 : 1.5}
                    />
                  )}
                  {labelled && (
                    <text x={x + offset.dx} y={y + offset.dy} className={styles.tPlace} textAnchor={offset.anchor}>
                      {(river.narrow && p.short) || p.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <div className={styles.clock}>
            <b>{weekdayDate(shown.onsetMs + elapsed * HOUR_MS)}, {when(elapsed)}</b>
            <span>{hoursText(elapsed)} hours after the release rose · Central</span>
          </div>
        </div>

        <aside className={styles.side} aria-live="polite">
          <div className={styles.sideHead}>
            <span className={styles.pill} data-kind={place.kind === 'gauge' ? 'measured' : share !== null && !place.kind ? 'assumed' : undefined}>
              {place.kind === 'dam' ? 'The dam' : place.kind === 'gauge' ? 'Measured' : share === null ? 'Not reported' : 'Assumed pace'}
            </span>
            <span>Mile {place.mile}</span>
          </div>
          <h3>{place.name}</h3>
          {place.kind === 'dam' ? (
            <div className={styles.stat}>
              <span>Release rose</span>
              <b>{when(0)}</b>
              <small>The river here comes up within minutes.</small>
            </div>
          ) : share === null ? (
            <p>Norfork Dam’s releases join the river below the gauge, so we report no time here.</p>
          ) : (
            <>
              <div className={styles.stat}>
                <span>Typical first rise</span>
                <b>{when(q.median * share)}</b>
                <small>{hoursText(q.median * share)} hours after the release</small>
              </div>
              <dl className={styles.rows}>
                <dt>8 in 10</dt>
                <dd>{timeSpan(shown.onsetMs + q.p10 * share * HOUR_MS, shown.onsetMs + q.p90 * share * HOUR_MS, roundedClockTime)}</dd>
                <dt>Earliest</dt>
                <dd>{when(q.min * share)}</dd>
                <dt>Latest</dt>
                <dd>{when(q.max * share)}</dd>
                {showsObserved && (
                  <>
                    <dt>{datedDay(shown.riseMs)}</dt>
                    <dd>{when(observedHours)}</dd>
                  </>
                )}
              </dl>
              <div className={styles.prog} data-kind={place.kind === 'gauge' ? undefined : 'assumed'}>
                <div>
                  <span>Risen by {when(elapsed)}</span>
                  <b>{risenHere} of {q.sorted.length} releases</b>
                </div>
                <div className={styles.progBar}><i style={{ width: `${(risenHere / q.sorted.length) * 100}%` }} /></div>
              </div>
            </>
          )}
        </aside>
      </div>

      <div className={styles.deck}>
        <div className={styles.deckRow}>
          <div className={styles.transport}>
            <Button
              variant="primary"
              size="sm"
              className="min-h-11 min-w-24"
              onClick={() => {
                if (!playing && elapsed >= HOURS_SHOWN - 0.05) setElapsed(0);
                setPlaying(!playing);
              }}
            >
              {playing ? 'Pause' : 'Play'}
            </Button>
            <Button variant="outline" size="sm" className="min-h-11" onClick={() => { setPlaying(false); setElapsed(0); }}>Restart</Button>
          </div>
          <div className={styles.sizePick}>
            <span id={`${ids}size`}>Generators</span>
            <Segmented options={SIZE_OPTIONS} value={size} onChange={onSize} size="md" aria-label="Release size, in generators" />
          </div>
        </div>
        <div>
          <div className={styles.timeline}>
            {share !== null && share > 0 && (
              <div className={styles.bars}>
                <i data-band="outer" style={{ left: percent(q.min * share), width: `max(3px, ${((fraction(q.max * share) - fraction(q.min * share)) * 100).toFixed(2)}%)` }} />
                <i data-band="mid" style={{ left: percent(q.p10 * share), width: `max(3px, ${((fraction(q.p90 * share) - fraction(q.p10 * share)) * 100).toFixed(2)}%)` }} />
                <i data-band="core" style={{ left: percent(q.p25 * share), width: `max(3px, ${((fraction(q.p75 * share) - fraction(q.p25 * share)) * 100).toFixed(2)}%)` }} />
                {showsObserved && <i data-band="observed" style={{ left: percent(observedHours) }} />}
                {fraction(q.max * share) < 0.62 ? (
                  <span style={{ left: `calc(${percent(q.max * share)} + 8px)` }}>{barLabel}</span>
                ) : fraction(q.min * share) > 0.38 ? (
                  <span style={{ right: `calc(${((1 - fraction(q.min * share)) * 100).toFixed(2)}% + 8px)` }}>{barLabel}</span>
                ) : null}
              </div>
            )}
            <input
              type="range"
              min={0}
              max={HOURS_SHOWN * 4}
              step={1}
              value={Math.round(elapsed * 4)}
              aria-label="Hours after the release rose"
              aria-valuetext={`${when(elapsed)}, ${hoursText(elapsed)} hours after the release rose`}
              onChange={(event) => {
                setPlaying(false);
                setElapsed(Number(event.target.value) / 4);
              }}
            />
          </div>
          <div className={styles.ticks}>
            {ticks.map((hours) => (
              <span key={hours} style={{ left: `${(hours / HOURS_SHOWN) * 100}%` }}>
                {when(hours)}{hours % 12 === 0 ? ` ${shortDate(shown.onsetMs + hours * HOUR_MS)}` : ''}
              </span>
            ))}
          </div>
        </div>
        <div className={styles.legend} aria-label="Where the first rise stood in past releases">
          <span><i data-key="risen" />All risen</span>
          <span><i data-key="outer" />Earliest to latest</span>
          <span><i data-key="mid" />8 in 10</span>
          <span><i data-key="core" />Middle half</span>
          <span><i data-key="front" />Typical</span>
          <span><i data-key="gauge" />Gauge, measured</span>
        </div>
      </div>

      <div className={styles.placebar} role="group" aria-label="Places along the river">
        {PLACES.map((p, index) => (!p.minor || index === selected) && (
          <button key={p.name} type="button" className={styles.chip} aria-pressed={index === selected} onClick={() => setSelected(index)}>
            {(river.narrow && p.short) || p.name}
          </button>
        ))}
      </div>
      <p className={styles.note}>
        <b>Only the gauge is measured.</b> The bands replay past releases at an assumed steady pace. They are not today’s water.
      </p>
    </section>
  );
}
