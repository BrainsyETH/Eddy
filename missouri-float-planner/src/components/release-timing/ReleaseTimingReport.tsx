'use client';

// The interactive part of the findings page, in the order a reader asks:
// how long does it take (the map, whose heading is the answer), how close has
// Eddy been (the live test), and what changes it (the two measured findings).
// One release size drives the answer, the map and the size chart together, and
// picking a live result replays that release on the map.

import { useEffect, useMemo, useRef, useState } from 'react';
import Segmented from '@/components/ui/Segmented';
import type { PublicResult, PublicResults } from '@/lib/arrival-trial/public-results';
import { FINDINGS, hoursOf, hoursText, sizeHours, sizeIndexFor, spread } from '@/lib/release-timing/findings';
import HowClose from './HowClose';
import RangeRows, { type RangeRow } from './RangeRows';
import ReleaseMap, { type ShownRelease } from './ReleaseMap';
import styles from './release-timing.module.css';

const SIZE_LABELS = ['About 1 generator', 'About 2 generators', 'About 3 generators', 'About 4 generators', '5 or more generators'];
const BASELINE_LABELS = ['Started below 1,500 cfs', 'Already releasing 1,500+ cfs', 'Already releasing 3,000+ cfs'];
type View = 'height' | 'baseline';

export default function ReleaseTimingReport({ results }: { results: PublicResults | null }) {
  const F = FINDINGS;
  const [size, setSize] = useState(() => sizeIndexFor(F.example.peakCfs));
  const [view, setView] = useState<View>('height');
  const [shown, setShown] = useState<ShownRelease | null>(null);
  const replayTrigger = useRef<HTMLButtonElement | null>(null);

  const bySize = useMemo(() => F.size.map((band, i) => ({ ...band, label: SIZE_LABELS[i], values: sizeHours(i) })), [F]);
  const spreads = useMemo(() => bySize.map((row) => spread(row.values)), [bySize]);
  const byHeight: RangeRow[] = useMemo(
    () => F.height.map((band) => ({ ...band, label: `Gauge ${band.label.toLowerCase()}`, values: hoursOf(F.points, (p) => p[2] >= band.lo && p[2] < (band.hi ?? Infinity)) })),
    [F],
  );
  const byBaseline: RangeRow[] = useMemo(
    () => F.baseline.map((band, i) => ({ ...band, label: BASELINE_LABELS[i], values: hoursOf(F.points, (p) => p[3] >= band.lo && p[3] < (i === 0 ? 1500 : Infinity)) })),
    [F],
  );

  const play = (result: Extract<PublicResult, { kind: 'compared' }>, trigger: HTMLButtonElement) => {
    replayTrigger.current = trigger;
    setShown({ onsetMs: Date.parse(result.releasedAt), riseMs: Date.parse(result.roseAt) });
  };

  // Move focus after the view has changed. An earlier comparison may be deep
  // inside the open history, so return to its actual button.
  useEffect(() => {
    if (!replayTrigger.current) return;
    const target = shown ? document.querySelector<HTMLElement>('#release-map h2') : replayTrigger.current;
    const history = !shown && target?.closest('details');
    if (history) history.open = true;
    target?.focus({ preventScroll: true });
    const scrollTarget = shown ? target?.closest('section') : target;
    scrollTarget?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: shown ? 'start' : 'center',
    });
    if (!shown) replayTrigger.current = null;
  }, [shown]);

  const high = F.height[F.height.length - 1];
  const changeSize = (index: number) => {
    replayTrigger.current = null;
    setSize(index);
    setShown(null);
  };
  return (
    <div className={styles.report}>
      <ReleaseMap size={size} onSize={changeSize} spreads={spreads} shown={shown} onClear={() => setShown(null)} />

      <HowClose results={results} onPlay={play} />

      <section id="by-size" className="card-panel scroll-mt-24" aria-labelledby="by-size-heading">
        <div className={styles.cardHead}>
          <h2 id="by-size-heading">Bigger releases arrive sooner</h2>
          <p>The biggest releases reached the gauge about {hoursText(F.size[0].median - F.size[F.size.length - 1].median)} hours sooner than the smallest.</p>
        </div>
        <div className={styles.cardBody}>
          <RangeRows rows={bySize} label="Hours to first rise near Norfork, by release size" emphasis={size} onPick={changeSize} />
          <div className={styles.key}>
            <span><i data-key="bar" />Typical window</span>
            <span><i data-key="tick" />typical</span>
            <span><i data-key="dot" />one release</span>
            <span>One generator is about {F.generatorCfs.toLocaleString('en-US')} cfs</span>
          </div>
        </div>
      </section>

      <section id="when-it-changes" className="card-panel scroll-mt-24" aria-labelledby="when-it-changes-heading">
        <div className={styles.cardHead}>
          <h2 id="when-it-changes-heading">{view === 'height' ? 'Higher water, earlier rise' : 'An existing release changes the timing'}</h2>
          <p>{view === 'height'
            ? `Above 8.5 ft, the rise came about ${hoursText(F.normalAll.median - high.median)} hours sooner than on a normal river, with a wider spread.`
            : `When the dam was already releasing 3,000+ cfs, the next increase arrived about ${hoursText(F.baseline[0].median - F.baseline[2].median)} hours sooner than from below 1,500 cfs.`}</p>
        </div>
        <div className={styles.cardBody}>
          <div>
            <Segmented
              options={[{ value: 'height', label: 'River level' }, { value: 'baseline', label: 'Starting release' }]}
              value={view}
              onChange={setView}
              size="md"
              aria-label="Group releases by"
            />
          </div>
          {view === 'height' ? (
            <RangeRows rows={byHeight} label="Hours to first rise near Norfork, by gauge height when the release began" emphasis={byHeight.length - 1} />
          ) : (
            <RangeRows rows={byBaseline} label="Hours to first rise near Norfork, by what the dam was already releasing" emphasis={null} />
          )}
        </div>
        <p className={styles.note}>
          {view === 'height'
            ? 'Below 7 ft the gauge height made little difference.'
            : 'The 3,000+ cfs group is also included in the 1,500+ cfs group.'}
        </p>
      </section>
    </div>
  );
}
