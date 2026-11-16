// Orient the reader, then let the map and results explain the findings.

import { FINDINGS } from '@/lib/release-timing/findings';
import { GAUGE_MILE } from '@/lib/release-timing/river';
import styles from './release-timing.module.css';

export const RELEASE_TIMING_TITLE = 'How long a Bull Shoals release takes to reach Norfork';

export default function ReleaseTimingIntro() {
  const F = FINDINGS;
  return (
    <header className={styles.intro}>
      <p className={styles.kicker}>White River · Timing study</p>
      <h1>Bull Shoals release timing</h1>
      <p className={styles.lede}>How long past releases took to reach the gauge near Norfork.</p>
      <p className={styles.context}>{F.scored.toLocaleString('en-US')} measured releases · {F.years[0]}–{F.years[1]} · {GAUGE_MILE} river miles</p>
      <p className={styles.caution}><b>Not a forecast.</b> Releases can change without notice. Don’t use this timing to decide when to wade or launch.</p>
    </header>
  );
}
