'use client';

// The White River from Bull Shoals Dam to the gauge near Norfork, with one
// clock. The card's heading is the answer for the chosen release size; the map
// shows the same thing moving.
//
// MEASURED FIRST. The gauge is the only place a release was timed, so the
// headline, the typical window and the timeline are all the gauge's. Access
// points upstream get a rough guide under the map: one rounded time each, from
// the steady-pace assumption, with no window. Nothing is reported below the
// gauge. Historical distributions and completed releases are separate views.
import { useEffect, useId, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { EddyIcon, eddyIconUrl } from '@/components/ui/EddyIcon';
import Segmented, { type SegmentedOption } from '@/components/ui/Segmented';
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { hoursText, type Spread } from '@/lib/release-timing/findings';
import { elapsedText, playbackHours, roughHours, sizePhrase, windowPosition } from '@/lib/release-timing/presentation';
import { frontMile, GAUGE_INDEX, GAUGE_MILE, MAP, paceShare, PLACES, riverFrame } from '@/lib/release-timing/river';
import { clockTime, datedDay, releaseHour, weekdayDate } from '@/lib/release-timing/time';
import styles from './release-timing.module.css';

const HOUR_MS = 3_600_000;
const PLAY_SECONDS = 24;

export interface ShownRelease { onsetMs: number; riseMs: number }

export const SIZE_OPTIONS: SegmentedOption<number>[] = [
  { value: 0, label: '1', title: 'About 1 generator' },
  { value: 1, label: '2', title: 'About 2 generators' },
  { value: 2, label: '3', title: 'About 3 generators' },
  { value: 3, label: '4', title: 'About 4 generators' },
  { value: 4, label: '5+', title: '5 or more generators' },
];

/** Access points with no gauge, upstream of the one that has one. */
const ROUGH_GUIDE = PLACES.filter((p) => !p.kind && !p.minor && p.mile < GAUGE_MILE);

export default function ReleaseMap({ size, onSize, spreads, shown, onClear, playRequest }: {
  size: number;
  onSize: (index: number) => void;
  spreads: Spread[];
  /** A completed release selected in How close was Eddy; null is the historical model. */
  shown: ShownRelease | null;
  onClear: () => void;
  playRequest: number;
}) {
  const q = spreads[size];
  const [elapsed, setElapsed] = useState(0);
  const [selected, setSelected] = useState(GAUGE_INDEX);
  const [playing, setPlaying] = useState(false);
  const [frame, width] = useMeasuredWidth<HTMLDivElement>(760, 260);
  const ids = useId().replace(/:/g, '');
  const river = useMemo(() => riverFrame(width), [width]);
  const recordedHours = shown ? (shown.riseMs - shown.onsetMs) / HOUR_MS : null;
  const travelHours = recordedHours ?? q.median;
  const hoursShown = playbackHours(recordedHours ?? q.p90);
  const playUntil = shown ? travelHours : q.p90;
  const place = PLACES[selected];

  useEffect(() => { setPlaying(false); }, [size]);
  useEffect(() => {
    if (!shown || playRequest === 0) { setPlaying(false); return; }
    setElapsed(0);
    setPlaying(true);
  }, [playRequest, shown]);
  useEffect(() => {
    if (!playing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timer = window.setInterval(() => setElapsed((t) => Math.min(playUntil, t + 0.5)), 500);
      return () => window.clearInterval(timer);
    }
    let last = performance.now();
    let request = requestAnimationFrame(function tick(now: number) {
      setElapsed((t) => Math.min(playUntil, t + ((now - last) / 1000) * (playUntil / PLAY_SECONDS)));
      last = now;
      request = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(request);
  }, [playing, playUntil]);
  useEffect(() => {
    if (elapsed >= playUntil) {
      setPlaying(false);
      if (elapsed > hoursShown) setElapsed(hoursShown);
    }
  }, [elapsed, hoursShown, playUntil]);

  const base = useMemo(() => ({
    lakes: Object.values(MAP.lakes).flatMap((rings) => rings.map((ring) => river.line(ring) + 'Z')),
    tributaries: Object.entries(MAP.tribs).map(([name, points]) => ({ name, d: river.line(points), major: name === 'Buffalo River' || name === 'Crooked Creek' })),
    norfork: river.line(MAP.norfork),
    norforkDam: river.project(MAP.norfork[0]),
    upper: river.slice(0, GAUGE_MILE),
    lower: river.slice(GAUGE_MILE, PLACES[PLACES.length - 1].mile + 3),
    marks: PLACES.map((p, index) => ({ p, index, at: river.at(p.mile) })),
  }), [river]);
  const [frontX, frontY] = river.at(frontMile(elapsed, travelHours));
  const percent = (hours: number) => Math.max(0, Math.min(100, hours / hoursShown * 100)) + '%';
  const label = (lon: number, lat: number) => { const [x, y] = river.project([lon, lat]); return { x, y }; };
  const ticks = river.narrow ? [0, hoursShown / 2, hoursShown] : [0, hoursShown / 4, hoursShown / 2, hoursShown * 3 / 4, hoursShown];
  const status = shown
    ? (elapsed < travelHours ? 'Before the recorded rise' : elapsed > travelHours ? 'Past the recorded rise' : 'At the recorded rise')
    : ({ before: 'Before the typical window', within: 'Within the typical window', past: 'Past the typical window' } as const)[windowPosition(elapsed, q.p10, q.p90)];

  return (
    <section id="release-map" className={'card-panel scroll-mt-24 ' + styles.explorer} aria-labelledby={ids + 'answer'}>
      <div className={styles.answerHead}>
        <div className={styles.modelRow}>
          <span className={styles.modelLabel}>{shown ? 'Recorded release · ' + datedDay(shown.onsetMs) : 'Historical timing · Not live'}</span>
          {shown && (
            <Button variant="outline" size="sm" className="min-h-11" onClick={() => {
              onClear();
              setElapsed(0);
              setPlaying(false);
              document.getElementById(ids + 'answer')?.focus({ preventScroll: true });
            }}>Back to timing</Button>
          )}
        </div>
        <div className={styles.answerRow}>
          <div>
            <h2 id={ids + 'answer'} tabIndex={-1} className={styles.answerLine} aria-live="polite">About <b>{hoursText(travelHours)} hours</b></h2>
            <p className={styles.destination}>To the gauge near Norfork{!shown && <> · {sizePhrase(size, spreads.length)} · normal river</>}</p>
          </div>
          {!shown && <div className={styles.sizePick}>
            <span>Generators</span>
            <Segmented options={SIZE_OPTIONS} value={size} onChange={onSize} size="md" aria-label="Release size, in generators" />
          </div>}
        </div>
        <p className={styles.answerSub}>{shown
          ? <>Released in the {releaseHour(shown.onsetMs)}. Gauge rose {weekdayDate(shown.riseMs)}, {clockTime(shown.riseMs)} CT.</>
          : <>Typical window {hoursText(q.p10)}–{hoursText(q.p90)} hours · {q.sorted.length} past releases</>}
        </p>
      </div>

      <div className={styles.mapwrap}>
        <div ref={frame} className={styles.mapCanvas}>
          <svg viewBox={'0 0 ' + river.width + ' ' + river.height} role="group" aria-label="White River map, select a place for river miles" aria-describedby={ids + 'map-note'}>
          <defs><clipPath id={ids + 'frame'}><rect width={river.width} height={river.height} /></clipPath></defs>
          <g clipPath={'url(#' + ids + 'frame)'} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {base.lakes.map((d, i) => <path key={i} d={d} fill="var(--rt-lake)" />)}
            {base.tributaries.map((t) => <path key={t.name} d={t.d} stroke="var(--rt-trib)" strokeWidth={t.major ? 2.4 : 1.4} />)}
            <path d={base.norfork} stroke="var(--rt-river)" strokeWidth={3} />
            <path d={base.lower} stroke="var(--rt-river)" strokeWidth={3} strokeDasharray="1 7" />
            <path d={base.upper} stroke="var(--rt-series)" strokeWidth={river.narrow ? 4 : 5} />
            {!shown && <path data-timing-band d={river.slice(frontMile(elapsed, q.p90), frontMile(elapsed, q.p10))} stroke="var(--rt-emph)" strokeOpacity={0.35} strokeWidth={river.narrow ? 15 : 20} />}
          </g>
          <text {...label(-92.612, 36.398)} {...(river.narrow ? { x: 8 } : {})} className={styles.tWater} textAnchor={river.narrow ? 'start' : 'middle'}>Bull Shoals Lake</text>
          <text {...label(-92.165, 36.335)} className={styles.tWater} textAnchor="middle">Norfork Lake</text>
          {!river.narrow && <>
            <text {...label(-92.497, 36.118)} className={styles.tWater}>Buffalo River</text>
            <text {...label(-92.6, 36.222)} className={styles.tWater} textAnchor="middle">Crooked Creek</text>
            <text {...label(-92.385, 36.338)} className={styles.tTown} textAnchor="middle">Mountain Home</text>
          </>}
          <text {...(river.narrow ? { x: river.width - 8, y: base.norforkDam[1] - 15 } : label(-92.222, 36.252))} textAnchor={river.narrow ? 'end' : 'start'} className={styles.tTown}>Norfork Dam</text>
          <image href={eddyIconUrl('dam')} x={base.norforkDam[0] - 9} y={base.norforkDam[1] - 9} width={18} height={18} aria-hidden="true" />
          {[...base.marks.filter((m) => !m.p.kind), ...base.marks.filter((m) => m.p.kind)].map(({ p, index, at: [x, y] }) => {
            const on = selected === index;
            const interactive = !p.minor;
            const labelled = !p.minor && (!river.narrow || Boolean(p.kind) || p.name === 'Cotter' || p.name === 'Buffalo City' || p.name === 'Calico Rock');
            const offset = (river.narrow && p.narrowLabel) || p.label || { dx: 10, dy: 4, anchor: 'start' as const };
            const textX = Math.min(river.width - 8, Math.max(8, x + offset.dx));
            return (
              <g key={p.name} className={interactive ? styles.hit : undefined} role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined} aria-label={interactive ? `${p.name}, mile ${p.mile}` : undefined}
                aria-pressed={interactive ? on : undefined} onClick={interactive ? () => setSelected(index) : undefined}
                onKeyDown={interactive ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(index); }
                } : undefined}>
                {interactive && <circle cx={x} cy={y} r={22} fill="transparent" className={styles.hitRing} />}
                {on && <circle cx={x} cy={y} r={16} fill="none" stroke="var(--rt-series)" strokeWidth={2} strokeDasharray="3 3" />}
                {p.kind ? <image href={eddyIconUrl(p.kind === 'dam' ? 'dam' : 'gaugeStation')} x={x - 12} y={y - 12} width={24} height={24} aria-hidden="true" /> :
                  <circle cx={x} cy={y} r={p.minor ? 2.5 : 4.5} fill="var(--color-surface)" stroke="var(--rt-series)" strokeWidth={2} />}
                {labelled && <text x={textX} y={y + offset.dy} className={styles.tPlace} textAnchor={offset.anchor}>
                  {(river.narrow && p.short) || p.name}
                  {p.kind === 'gauge' && <tspan x={textX} dy={16} className={styles.tTiming}>Measured</tspan>}
                </text>}
              </g>
            );
          })}
          <circle data-rise-marker cx={frontX} cy={frontY} r={7} fill="var(--rt-emph)" stroke="var(--color-surface)" strokeWidth={3} pointerEvents="none" />
        </svg>
        </div>
        <div className={styles.placeCaption} aria-live="polite">
          <b>{place.name}</b><span>Mile {place.mile} · {place.kind === 'gauge' ? 'Measured gauge' : place.kind === 'dam' ? 'Release starts here' : place.mile > GAUGE_MILE ? 'No timing below the gauge' : 'Timing not measured here'}</span>
          <span className={styles.mapHint}>Tap a place for river miles</span>
        </div>
        <div className={styles.mapKey}>
          <span><i />{shown ? 'Replayed first rise' : 'Typical first rise'}</span>
          {!shown && <span><i data-key="window" />Typical window</span>}
          <span><EddyIcon name="gaugeStation" size={18} />Measured gauge</span>
          <span id={ids + 'map-note'}>Motion assumes steady travel.</span>
        </div>
      </div>

      <div className={styles.deck}>
        <div className={styles.deckRow}>
          <div className={styles.transport}>
            <Button variant="primary" size="sm" className="min-h-11 min-w-24" onClick={() => { if (!playing && elapsed >= playUntil) setElapsed(0); setPlaying(!playing); }}>
              {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{playing ? 'Pause' : 'Play'}
            </Button>
            <Button variant="outline" size="sm" className="min-h-11" aria-label="Restart from the dam" onClick={() => { setPlaying(false); setElapsed(0); }}><RotateCcw size={16} aria-hidden="true" /><span className="sr-only">Restart</span></Button>
          </div>
          <div className={styles.clock}>
            <b>{elapsedText(elapsed)} <span>after release</span></b>
            <small role="status" aria-live={playing ? 'off' : 'polite'}>{status}{shown ? ' · ' + weekdayDate(shown.onsetMs + elapsed * HOUR_MS) + ', ' + clockTime(shown.onsetMs + elapsed * HOUR_MS) + ' CT' : ''}</small>
          </div>
        </div>
        <div>
          <div className={styles.timeline}>
            <div className={styles.timelineCaption}>Gauge near Norfork · {shown ? 'recorded rise' : 'typical window'}</div>
            <div className={styles.sliderArea}>
              <div className={styles.bars} aria-hidden="true">
                {!shown && <i data-band="window" style={{ left: percent(q.p10), width: Math.max(0.3, (q.p90 - q.p10) / hoursShown * 100) + '%' }} />}
                <i data-band={shown ? 'observed' : 'typical'} style={{ left: percent(travelHours) }} />
              </div>
              <input type="range" min={0} max={hoursShown * 12} step={1} value={Math.round(elapsed * 12)} aria-label="Time since release"
                aria-valuetext={elapsedText(elapsed) + ' after release, ' + status.toLowerCase()}
                onChange={(event) => { setPlaying(false); setElapsed(Number(event.target.value) / 12); }} />
            </div>
          </div>
          <div className={styles.ticks}>{ticks.map((hours) => <span key={hours} style={{ left: percent(hours) }}>{hours === 0 ? 'Release' : '+' + hours + ' hr'}</span>)}</div>
        </div>
      </div>

      <details className={styles.more}>
        <summary>Rough guide upstream</summary>
        <div className={styles.rough}>
          <p>Not measured. These times assume steady travel from the dam.</p>
          <ul>
            {ROUGH_GUIDE.map((p) => <li key={p.name}><span>{p.name}</span><b>{roughHours(travelHours * paceShare(p)!)}</b></li>)}
          </ul>
        </div>
      </details>
      <details className={styles.more}>
        <summary>About this estimate</summary>
        <div>
          {shown ? <p>This is one recorded release: when it rose at the dam, and when the gauge near Norfork rose.</p> : <>
            <p>{q.sorted.length} past releases of this size on a normal river. The typical window spans the 10th to 90th percentiles; the marker is the median. These are past timings, not forecast confidence.</p>
            <p>Full range at the gauge: {elapsedText(q.min)} to {elapsedText(q.max)}.</p>
          </>}
          <p>Releases are published as hourly averages, so a release is known to the hour it began in. Map motion assumes steady travel. No timing is reported below the gauge, where Norfork Dam adds its own releases.</p>
        </div>
      </details>
    </section>
  );
}
