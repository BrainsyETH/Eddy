// The study so far, as dated one-liners ending with what comes next. Visible,
// not folded away: it is how the page shows the work is still moving.

import type { PublicResults } from '@/lib/arrival-trial/public-results';
import { FINDINGS } from '@/lib/release-timing/findings';
import { researchLog } from '@/lib/release-timing/presentation';
import styles from './release-timing.module.css';

export default function ResearchLog({ results }: { results: PublicResults | null }) {
  return (
    <section id="research-log" className="card-panel scroll-mt-24" aria-labelledby="research-log-heading">
      <div className={styles.cardHead}>
        <h2 id="research-log-heading">Research log</h2>
        <p>We have not shown that an arrival can be called ahead of time. This is where the work stands.</p>
      </div>
      <ol className={styles.log}>
        {researchLog(FINDINGS, results).map((entry, k) => (
          <li key={k} data-next={entry.when === 'Next' || undefined}>
            <span>{entry.when}</span>
            <p>{entry.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
