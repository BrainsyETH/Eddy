// Orient the reader, then let the map and results explain the findings.

import { FINDINGS } from '@/lib/release-timing/findings';
import { GAUGE_MILE } from '@/lib/release-timing/river';
import { RESULTS_NEEDED } from '@/lib/release-timing/presentation';
import DamInfoTip from '@/components/dam/DamInfoTip';
import { EddyIcon } from '@/components/ui/EddyIcon';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import styles from './release-timing.module.css';

export const RELEASE_TIMING_TITLE = 'How long a Bull Shoals release takes to reach Norfork';

export default function ReleaseTimingIntro() {
  const F = FINDINGS;
  return (
    <header className={styles.intro}>
      <p className={styles.kicker}>White River · Timing study</p>
      <h1>Bull Shoals release timing</h1>
      <p className={styles.lede}>How long past releases took to reach the gauge near Norfork.</p>
      <div className={styles.context}>
        <DamInfoTip title="The timing study" label={`Based on ${F.scored.toLocaleString('en-US')} historical releases`} anchored className={styles.studyPanel}>
          <dl className={styles.studyFacts}>
            <div><dt>Period</dt><dd>{F.years[0]}–{F.years[1]}</dd></div>
            <div><dt>Reach</dt><dd>Bull Shoals Dam to the gauge near Norfork · {GAUGE_MILE} river miles</dd></div>
            <div><dt>Sample</dt><dd>{F.scored.toLocaleString('en-US')} releases matched to a recorded rise</dd></div>
            <div><dt>Sources</dt><dd>Hourly Corps releases and USGS river levels every 15 minutes</dd></div>
          </dl>
          <p>Of {F.increases.toLocaleString('en-US')} detected increases, {F.scored.toLocaleString('en-US')} had one clear rise and a complete gauge record. Slower starts aren’t included yet. These measurements apply only to the gauge near Norfork.</p>
          <p><b>Recent results are a separate check.</b> Eddy saves each estimate before the rise. We review accuracy after {RESULTS_NEEDED} comparisons; reaching that count isn’t a passing result.</p>
          <Button href="https://github.com/BrainsyETH/Eddy/tree/main/missouri-float-planner/scripts/research/bull-shoals-lag-2026-11" external variant="ghost" className="min-h-11 px-0 text-primary-700 underline underline-offset-4">Read the research reports</Button>
        </DamInfoTip>
      </div>
      <Card variant="panel" as="aside" className={styles.caution} aria-label="Not a forecast">
        <EddyIcon name="hazard" size={28} />
        <div><b>Not a forecast</b><p>Past release timing only. Releases can change without notice. Don’t use this to decide when to wade or launch.</p></div>
      </Card>
    </header>
  );
}
