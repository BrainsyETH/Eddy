// What the page is, in four labelled facts, before anything interactive.
// Someone who reads only this should leave with the answer, know the work is
// still going, and know it is not a forecast.

import type { PublicResults } from '@/lib/arrival-trial/public-results';
import { FINDINGS, hoursText } from '@/lib/release-timing/findings';
import { RESULTS_NEEDED } from '@/lib/release-timing/presentation';
import { GAUGE_MILE } from '@/lib/release-timing/river';
import styles from './release-timing.module.css';

export const RELEASE_TIMING_TITLE = 'How long a Bull Shoals release takes to reach Norfork';

export default function ReleaseTimingIntro({ results }: { results: PublicResults | null }) {
  const F = FINDINGS;
  const high = F.height[F.height.length - 1];
  return (
    <header className={styles.intro}>
      <p className={styles.kicker}>Our findings · Bull Shoals Dam</p>
      <h1>{RELEASE_TIMING_TITLE}</h1>
      <p className={styles.lede}>An ongoing Eddy study of how long water released from Bull Shoals Dam takes to raise the White River downstream.</p>
      <dl className={styles.about}>
        <div>
          <dt>What we measured</dt>
          <dd>{F.scored.toLocaleString('en-US')} releases from {F.years[0]} to {F.years[1]}, timed at the USGS gauge near Norfork, {GAUGE_MILE} miles below the dam.</dd>
        </div>
        <div>
          <dt>What we found</dt>
          <dd>
            About <b>{hoursText(F.normalAll.median)} hours</b> on a normal river. Bigger releases arrive sooner (about {hoursText(F.size[F.size.length - 1].median)} hours),
            smaller ones later (about {hoursText(F.size[0].median)}), and a high river answers about {hoursText(F.normalAll.median - high.median)} hours sooner.
          </dd>
        </div>
        <div>
          <dt>What we’re testing now</dt>
          <dd>
            Whether Eddy can call the arrival ahead of time.{' '}
            {results ? <><b>{Math.min(results.tally.compared, RESULTS_NEEDED)} of {RESULTS_NEEDED}</b> results in so far.</> : <>We judge it after {RESULTS_NEEDED} results.</>}
          </dd>
        </div>
        <div data-caution>
          <dt>What this isn’t</dt>
          <dd>A forecast. Releases change without notice. Don’t use this page to decide whether it’s safe to wade or launch.</dd>
        </div>
      </dl>
    </header>
  );
}
