// Keep the latest update and next step visible; retain the history on request.

import type { PublicResults } from '@/lib/arrival-trial/public-results';
import { FINDINGS } from '@/lib/release-timing/findings';
import { researchLog } from '@/lib/release-timing/presentation';
import styles from './release-timing.module.css';

export default function ResearchLog({ results }: { results: PublicResults | null }) {
  const entries = researchLog(FINDINGS, results);
  const recent = entries.slice(-2);
  return (
    <section id="research-log" className="card-panel scroll-mt-24" aria-labelledby="research-log-heading">
      <div className={styles.cardHead}>
        <h2 id="research-log-heading">Study updates</h2>
      </div>
      <ol className={styles.log}>
        {recent.map((entry, k) => (
          <li key={k} data-next={entry.when === 'Next' || undefined}>
            <span>{entry.when}</span>
            <p>{entry.text}</p>
          </li>
        ))}
      </ol>
      <details className={styles.more}>
        <summary>Earlier study updates</summary>
        <div>
          {entries.slice(0, -2).map((entry, k) => (
            <p key={k}><b>{entry.when}</b> · {entry.text}</p>
          ))}
        </div>
      </details>
    </section>
  );
}
