'use client';

// The interactive part of the findings page: the release map, "How close was
// Eddy?" directly under it, and the two measured findings. One release size
// drives the map and the size chart together, and picking a live result plays
// that release on the map.

import { useMemo, useState } from 'react';
import Segmented from '@/components/ui/Segmented';
import type { PublicResult, PublicResults } from '@/lib/arrival-trial/public-results';
import { FINDINGS, hoursOf, hoursText, sizeHours, sizeIndexFor, spread } from '@/lib/release-timing/findings';
import HowClose from './HowClose';
import RangeRows, { type RangeRow } from './RangeRows';
import ReleaseMap, { SIZE_OPTIONS, type ShownRelease } from './ReleaseMap';
import styles from './release-timing.module.css';

const SIZE_LABELS = ['About 1 generator', 'About 2 generators', 'About 3 generators', 'About 4 generators', '5 or more generators'];
const BASELINE_LABELS = ['Started below 1,500 cfs', 'Already releasing 1,500+ cfs', 'Already releasing 3,000+ cfs'];
type View = 'height' | 'baseline';

export default function ReleaseTimingReport({ results }: { results: PublicResults | null }) {
  const F = FINDINGS;
  const [size, setSize] = useState(() => sizeIndexFor(F.example.peakCfs));
  const [view, setView] = useState<View>('height');
  const [shown, setShown] = useState<ShownRelease | null>(null);
  const [playRequest, setPlayRequest] = useState(0);

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

  const play = (result: Extract<PublicResult, { kind: 'compared' }>) => {
    const sizeIndex = result.peakCfs === null ? size : sizeIndexFor(result.peakCfs);
    setShown({ onsetMs: Date.parse(result.releasedAt), riseMs: Date.parse(result.roseAt) });
    setSize(sizeIndex);
    setPlayRequest((n) => n + 1);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('release-map')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  };

  const band = F.size[size];
  const high = F.height[F.height.length - 1];
  const changeSize = (index: number) => { setSize(index); setShown(null); };
  return (
    <div className={styles.report}>
      <ReleaseMap size={size} onSize={changeSize} spreads={spreads} shown={shown} onClear={() => setShown(null)} playRequest={playRequest} />

      <HowClose results={results} onPlay={play} />

      <section id="by-size" className="card-panel scroll-mt-24" aria-labelledby="by-size-heading">
        <div className={styles.cardHead}><h2 id="by-size-heading">Bigger releases arrived sooner</h2></div>
        <div className={styles.cardBody}>
          <div className={styles.answerRow}>
            <p className={styles.answer} aria-live="polite">
              <b>About {hoursText(band.median)} hours</b>
              <span>Typical window: {hoursText(band.p10)}–{hoursText(band.p90)} hr at the gauge</span>
            </p>
            <div className={styles.sizePick}>
              <span>Generators</span>
              <Segmented options={SIZE_OPTIONS} value={size} onChange={changeSize} size="md" aria-label="Release size, in generators" />
            </div>
          </div>
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
        <div className={styles.cardHead}><h2 id="when-it-changes-heading">Higher water, earlier rise</h2></div>
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
          {view === 'height' ? (
            <>
              <b>Above 8.5 ft the rise came about {hoursText(F.height[2].median - high.median)} hours sooner</b> than at 6 to 7 ft, and the spread was much wider. Below 7 ft the gauge height made little difference.
            </>
          ) : (
            <>
              <b>An increase on top of a release already running arrived about {hoursText(F.baseline[0].median - F.baseline[2].median)} hours sooner.</b> The last two groups overlap: the third is part of the second.
            </>
          )}
        </p>
      </section>
    </div>
  );
}
