'use client';

// Historical distributions and completed releases are separate views. Only the
// Norfork gauge is measured; motion elsewhere always assumes a steady pace.
import { useEffect, useId, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { EddyIcon, eddyIconUrl } from '@/components/ui/EddyIcon';
import Segmented, { type SegmentedOption } from '@/components/ui/Segmented';
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { hoursText, type Spread } from '@/lib/release-timing/findings';
import { elapsedText, playbackHours, windowPosition } from '@/lib/release-timing/presentation';
import { frontMile, GAUGE_INDEX, GAUGE_MILE, MAP, paceShare, PLACES, riverFrame } from '@/lib/release-timing/river';
import { clockTime, datedDay, weekdayDate } from '@/lib/release-timing/time';
import styles from './release-timing.module.css';

const HOUR_MS = 3_600_000;
const PLAY_SECONDS = 24;
const COTTER = PLACES.findIndex((p) => p.name === 'Cotter');

export interface ShownRelease { onsetMs: number; riseMs: number }

export const SIZE_OPTIONS: SegmentedOption<number>[] = [
  { value: 0, label: '1', title: 'About 1 generator' },
  { value: 1, label: '2', title: 'About 2 generators' },
  { value: 2, label: '3', title: 'About 3 generators' },
  { value: 3, label: '4', title: 'About 4 generators' },
  { value: 4, label: '5+', title: '5 or more generators' },
];

export default function ReleaseMap({ size, onSize, spreads, shown, onClear, playRequest }: {
  size: number;
  onSize: (index: number) => void;
  spreads: Spread[];
  /** A completed release selected in How close was Eddy; null is the historical model. */
  shown: ShownRelease | null;
  onClear: () => void;
  playRequest: number;
}) {
  const [selected, setSelected] = useState(COTTER);
  const [elapsed, setElapsed] = useState(() => spreads[size].median * paceShare(PLACES[COTTER])!);
  const [playing, setPlaying] = useState(false);
  const [frame, width] = useMeasuredWidth<HTMLDivElement>(760, 260);
  const ids = useId().replace(/:/g, '');
  const river = useMemo(() => riverFrame(width), [width]);
  const q = spreads[size];
  const place = PLACES[selected];
  const share = paceShare(place);
  const recordedHours = shown ? (shown.riseMs - shown.onsetMs) / HOUR_MS : null;
  const travelHours = recordedHours ?? q.median;
  const hoursShown = playbackHours(recordedHours ?? q.p90);
  const typical = share === null ? null : travelHours * share;
  const early = share === null ? null : q.p10 * share;
  const late = share === null ? null : q.p90 * share;
  const position = early !== null && late !== null ? windowPosition(elapsed, early, late) : null;
  const isRecorded = Boolean(shown && place.kind === 'gauge');

  useEffect(() => { setPlaying(false); }, [size]);
  useEffect(() => {
    if (!shown || playRequest === 0) { setPlaying(false); return; }
    setSelected(GAUGE_INDEX);
    setElapsed(0);
    setPlaying(true);
  }, [playRequest, shown]);
  useEffect(() => {
    if (!playing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timer = window.setInterval(() => setElapsed((t) => Math.min(hoursShown, t + 0.5)), 500);
      return () => window.clearInterval(timer);
    }
    let last = performance.now();
    let request = requestAnimationFrame(function tick(now: number) {
      setElapsed((t) => Math.min(hoursShown, t + ((now - last) / 1000) * (hoursShown / PLAY_SECONDS)));
      last = now;
      request = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(request);
  }, [playing, hoursShown]);
  useEffect(() => {
    if (elapsed >= hoursShown) {
      setPlaying(false);
      if (elapsed > hoursShown) setElapsed(hoursShown);
    }
  }, [elapsed, hoursShown]);

  const base = useMemo(() => ({
    lakes: Object.values(MAP.lakes).flatMap((rings) => rings.map((ring) => river.line(ring) + 'Z')),
    tributaries: Object.entries(MAP.tribs).map(([name, points]) => ({ name, d: river.line(points), major: name === 'Buffalo River' || name === 'Crooked Creek' })),
    norfork: river.line(MAP.norfork),
    norforkDam: river.project(MAP.norfork[0]),
    upper: river.slice(0, GAUGE_MILE),
    lower: river.slice(GAUGE_MILE, PLACES[PLACES.length - 1].mile + 3),
    marks: PLACES.map((p, index) => ({ p, index, at: river.at(p.mile) })),
  }), [river]);
  const typicalMile = frontMile(elapsed, travelHours);
  const [frontX, frontY] = river.at(typicalMile);
  const markerVisible = elapsed > 0 && elapsed < travelHours;
  const percent = (hours: number) => Math.max(0, Math.min(100, hours / hoursShown * 100)) + '%';
  const label = (lon: number, lat: number) => { const [x, y] = river.project([lon, lat]); return { x, y }; };
  const pickPlace = (index: number) => { setSelected(index); setPlaying(false); };
  const ordered = [...base.marks.filter((m) => !m.p.kind), ...base.marks.filter((m) => m.p.kind)];
  const ticks = river.narrow ? [0, hoursShown / 2, hoursShown] : [0, hoursShown / 4, hoursShown / 2, hoursShown * 3 / 4, hoursShown];
  const status = typical === null || place.kind === 'dam' ? null : shown
    ? (elapsed < typical ? 'Before the ' : elapsed > typical ? 'Past the ' : 'At the ') + (isRecorded ? 'recorded rise' : 'estimated rise')
    : ({ before: 'Before the typical window', within: 'Within the typical window', past: 'Past the typical window' } as const)[position!];

  return (
    <section id="release-map" className={'card-panel scroll-mt-24 ' + styles.explorer} aria-label="Release travel time">
      <div className={styles.mapHead}>
        <div className={styles.mapTitle}><EddyIcon name="release" size={28} /><h2>Release travel time</h2></div>
        <span className={styles.modelLabel}>{shown ? 'Recorded release · ' + datedDay(shown.onsetMs) : 'Historical model · Not live'}</span>
      </div>
      <div className={styles.mapControls}>
        <div className={styles.locationPick}>
          <label htmlFor={ids + 'place'}>Location</label>
          <select id={ids + 'place'} className="input input--compact" value={selected} onChange={(event) => pickPlace(Number(event.target.value))}>
            {PLACES.map((p, index) => <option key={p.name} value={index}>{p.name}</option>)}
          </select>
        </div>
        {shown ? <Button variant="outline" size="sm" className="min-h-11" onClick={onClear}>Back to timing</Button> : (
          <div className={styles.sizePick}>
            <span>Generators</span>
            <Segmented options={SIZE_OPTIONS} value={size} onChange={onSize} size="md" aria-label="Compare release sizes, in generators" />
          </div>
        )}
      </div>
      <div className={styles.stage}>
        <div ref={frame} className={styles.mapwrap}>
          <svg viewBox={'0 0 ' + river.width + ' ' + river.height} role="group" aria-label="White River travel-time map; only the gauge near Norfork is measured">
            <defs><clipPath id={ids + 'frame'}><rect width={river.width} height={river.height} /></clipPath></defs>
            <g clipPath={'url(#' + ids + 'frame)'} fill="none" strokeLinecap="round" strokeLinejoin="round">
              {base.lakes.map((d, i) => <path key={i} d={d} fill="var(--rt-lake)" />)}
              {base.tributaries.map((t) => <path key={t.name} d={t.d} stroke="var(--rt-trib)" strokeWidth={t.major ? 2.4 : 1.4} />)}
              <path d={base.norfork} stroke="var(--rt-river)" strokeWidth={3} />
              <path d={base.lower} stroke="var(--rt-river)" strokeWidth={3} strokeDasharray="1 7" />
              <path d={base.upper} stroke="var(--rt-series)" strokeWidth={river.narrow ? 4 : 5} />
              {!shown && <path data-timing-band d={river.slice(frontMile(elapsed, q.p90), frontMile(elapsed, q.p10))} stroke="var(--rt-emph)" strokeOpacity={0.35} strokeWidth={river.narrow ? 15 : 20} />}
              {markerVisible && <circle data-rise-marker cx={frontX} cy={frontY} r={7} fill="var(--rt-emph)" stroke="var(--color-surface)" strokeWidth={3} />}
            </g>
            <text {...label(river.narrow ? -92.575 : -92.612, 36.398)} className={styles.tWater} textAnchor="middle">Bull Shoals Lake</text>
            <text {...label(-92.165, 36.335)} className={styles.tWater} textAnchor="middle">Norfork Lake</text>
            {!river.narrow && <>
              <text {...label(-92.497, 36.118)} className={styles.tWater}>Buffalo River</text>
              <text {...label(-92.6, 36.222)} className={styles.tWater} textAnchor="middle">Crooked Creek</text>
              <text {...label(-92.385, 36.338)} className={styles.tTown} textAnchor="middle">Mountain Home</text>
            </>}
            <text {...label(-92.222, 36.252)} className={styles.tTown}>Norfork Dam</text>
            <image href={eddyIconUrl('dam')} x={base.norforkDam[0] - 9} y={base.norforkDam[1] - 9} width={18} height={18} aria-hidden="true" />
            {ordered.map(({ p, index, at: [x, y] }) => {
              const on = index === selected;
              const interactive = !p.minor || on;
              const labelled = on || (!p.minor && (!river.narrow || Boolean(p.kind) || p.name === 'Cotter' || p.name === 'Buffalo City' || p.name === 'Calico Rock'));
              const offset = (river.narrow && p.narrowLabel) || p.label || { dx: 10, dy: 4, anchor: 'start' as const };
              const pShare = paceShare(p);
              const timed = labelled && pShare !== null && pShare > 0 && (on || p.kind === 'gauge' || p.name === 'Cotter' || p.name === 'Buffalo City');
              const timing = pShare === null ? '' : (shown && p.kind === 'gauge' ? 'Recorded ' : '~') + hoursText(travelHours * pShare) + ' hr';
              const textX = Math.min(river.width - 8, Math.max(8, x + offset.dx));
              const textY = y + offset.dy;
              return (
                <g key={p.name} className={interactive ? styles.hit : undefined} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
                  aria-label={interactive ? p.name + ', mile ' + p.mile + (pShare && timed ? ', ' + timing + ' after release' : '') : undefined}
                  aria-pressed={interactive ? on : undefined} onClick={interactive ? () => pickPlace(index) : undefined}
                  onKeyDown={interactive ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pickPlace(index); } } : undefined}>
                  {interactive && <circle cx={x} cy={y} r={22} fill="transparent" stroke="transparent" className={styles.ring} />}
                  {on && <circle cx={x} cy={y} r={15} fill="none" stroke="var(--rt-emph)" strokeWidth={2} />}
                  {p.kind ? <image href={eddyIconUrl(p.kind === 'dam' ? 'dam' : 'gaugeStation')} x={x - 12} y={y - 12} width={24} height={24} aria-hidden="true" /> :
                    <circle cx={x} cy={y} r={on ? 7 : p.minor ? 2.5 : 4.5} fill={on ? 'var(--rt-emph)' : 'var(--color-surface)'} stroke="var(--rt-series)" strokeWidth={2} />}
                  {labelled && <text x={textX} y={textY} className={styles.tPlace} textAnchor={offset.anchor}>
                    {(river.narrow && p.short) || p.name}
                    {timed && <tspan x={textX} dy={16} className={styles.tTiming}>{timing}</tspan>}
                    {p.kind === 'gauge' && !timed && <tspan x={textX} dy={16} className={styles.tTiming}>Measured</tspan>}
                  </text>}
                </g>
              );
            })}
          </svg>
          <div className={styles.mapKey}>
            <span><i />Estimated first rise</span>
            {!shown && <span><i data-key="window" />Typical window</span>}
            <span><EddyIcon name="gaugeStation" size={18} />Measured gauge</span>
          </div>
        </div>
        <aside className={styles.side} aria-label="Selected location">
          <div className={styles.sideHead}><span>{place.kind === 'dam' ? 'Release start' : place.kind === 'gauge' ? 'Measured gauge' : share === null ? 'No estimate' : 'Estimated timing'}</span><span>Mile {place.mile}</span></div>
          <h3>{place.name}</h3>
          {place.kind === 'dam' ? <div className={styles.stat}><b>0 hr</b><small>Timing starts when the release rises.</small></div> : share === null ?
            <p>No timing below this gauge. Norfork Dam adds another release.</p> : <>
              <div className={styles.stat}><span>{isRecorded ? 'Recorded first rise' : 'Estimated first rise'}</span><b>{isRecorded ? '' : 'About '}{elapsedText(typical!)}</b><small>after release</small></div>
              {!shown && <div className={styles.arrivalWindow}>
                <div><span>Typical window</span><b>{elapsedText(early!)}–{elapsedText(late!)}</b></div>
                <div className={styles.localRange} role="img" aria-label={'Typical window ' + elapsedText(early!) + ' to ' + elapsedText(late!) + ' after release'}>
                  <span /><i style={{ left: ((q.median - q.p10) / Math.max(q.p90 - q.p10, 0.01) * 100) + '%' }} />
                </div>
              </div>}
              {shown && <p>{weekdayDate(shown.onsetMs + typical! * HOUR_MS)}, {clockTime(shown.onsetMs + typical! * HOUR_MS)} CT</p>}
              <p className={styles.position} data-position={shown ? undefined : position} role="status">{status}</p>
              <Button variant="outline" size="sm" className="min-h-11" onClick={() => { setPlaying(false); setElapsed(typical!); }}>Show first rise</Button>
            </>}
        </aside>
      </div>
      <div className={styles.deck}>
        <div className={styles.deckRow}>
          <div className={styles.transport}>
            <Button variant="primary" size="sm" className="min-h-11 min-w-24" onClick={() => { if (!playing && elapsed >= hoursShown) setElapsed(0); setPlaying(!playing); }}>
              {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{playing ? 'Pause' : 'Play'}
            </Button>
            <Button variant="outline" size="sm" className="min-h-11" aria-label="Restart from the dam" onClick={() => { setPlaying(false); setElapsed(0); }}><RotateCcw size={16} aria-hidden="true" /><span className="sr-only">Restart</span></Button>
          </div>
          <div className={styles.clock}><b>{elapsedText(elapsed)} <span>after release</span></b>{shown && <small>{weekdayDate(shown.onsetMs + elapsed * HOUR_MS)}, {clockTime(shown.onsetMs + elapsed * HOUR_MS)} CT</small>}</div>
        </div>
        <div>
          <div className={styles.timeline}>
            <div className={styles.timelineCaption}>{share !== null && share > 0 ? place.name + (shown ? ' · first rise' : ' · typical window') : 'Time since release'}</div>
            <div className={styles.sliderArea}>
              {share !== null && share > 0 && <div className={styles.bars} aria-hidden="true">
                {!shown && <i data-band="window" style={{ left: percent(early!), width: Math.max(0.3, (late! - early!) / hoursShown * 100) + '%' }} />}
                <i data-band={isRecorded ? 'observed' : 'typical'} style={{ left: percent(typical!) }} />
              </div>}
              <input type="range" min={0} max={hoursShown * 12} step={1} value={Math.round(elapsed * 12)} aria-label="Time since release"
                aria-valuetext={elapsedText(elapsed) + ' after release' + (shown ? ', ' + weekdayDate(shown.onsetMs + elapsed * HOUR_MS) + ', ' + clockTime(shown.onsetMs + elapsed * HOUR_MS) + ' Central' : '')}
                onChange={(event) => { setPlaying(false); setElapsed(Number(event.target.value) / 12); }} />
            </div>
          </div>
          <div className={styles.ticks}>{ticks.map((hours) => <span key={hours} style={{ left: percent(hours) }}>{hours === 0 ? 'Release' : '+' + hours + ' hr'}</span>)}</div>
        </div>
      </div>
      <p className={styles.note}>First rise, not peak flow. Only the gauge is measured.</p>
      <details className={styles.more}>
        <summary>About this estimate</summary>
        <div>
          <p>Map motion assumes steady travel from the dam to the gauge. Timing at access points is not measured.</p>
          {shown ? <p>Release: {weekdayDate(shown.onsetMs)}, {clockTime(shown.onsetMs)} CT. Gauge rise: {weekdayDate(shown.riseMs)}, {clockTime(shown.riseMs)} CT.</p> : <>
            <p>{q.sorted.length} past releases in this size group. The typical window spans the 10th to 90th percentiles; the marker is the median. These are historical timings, not forecast confidence.</p>
            {share !== null && share > 0 && <p>Full range at {place.name}: {elapsedText(q.min * share)}–{elapsedText(q.max * share)}.</p>}
          </>}
        </div>
      </details>
    </section>
  );
}
