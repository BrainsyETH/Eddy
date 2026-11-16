'use client';

// Completed comparisons only. Waiting releases never expose an estimate.
import { Play } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { comparison, type PublicResult, type PublicResults } from '@/lib/arrival-trial/public-results';
import { GAUGE_MILE } from '@/lib/release-timing/river';
import { RESULTS_NEEDED, studyProgress } from '@/lib/release-timing/presentation';
import { clockTime, datedDay, durationText, releaseHour, shortDate, timeSpan } from '@/lib/release-timing/time';
import styles from './release-timing.module.css';

type Compared = Extract<PublicResult, { kind: 'compared' }>;
const HOUR_MS = 3_600_000;
const EARLIER_SHOWN = 8;

function estimateDifference(result: Compared): string {
  const delta = Date.parse(result.roseAt) - Date.parse(result.estimateAt);
  if (delta === 0) return 'Matched estimate';
  const amount = Math.abs(delta) < 60_000 ? '<1 min' : durationText(Math.abs(delta) / 60_000).replace(/hours?/g, 'hr').replace(/minutes?/g, 'min');
  return `${amount} ${delta < 0 ? 'before' : 'after'} estimate`;
}
const shortOutcome = (result: Compared): string => {
  const { position, outsideMinutes } = comparison(result);
  return position === 'inside' ? 'Within window' : `${durationText(outsideMinutes)} ${position} the window`;
};

/** Labels sit on opposite sides of the axis, so close or identical times stay readable. */
function WindowGraphic({ result, compact = false }: { result: Compared; compact?: boolean }) {
  const [frame, W] = useMeasuredWidth<HTMLDivElement>(compact ? 320 : 720, 160);
  const estimate = Date.parse(result.estimateAt);
  const early = Date.parse(result.earlyAt);
  const late = Date.parse(result.lateAt);
  const rose = Date.parse(result.roseAt);
  const reach = Math.max(4 * HOUR_MS, Math.abs(rose - estimate) + HOUR_MS / 2, estimate - early + HOUR_MS / 2, late - estimate + HOUR_MS / 2);
  const pad = compact ? 6 : 12;
  const x = (ms: number) => pad + ((ms - (estimate - reach)) / (2 * reach)) * (W - 2 * pad);
  const labelX = (ms: number) => Math.max(88, Math.min(W - 88, x(ms)));
  const H = compact ? 28 : 108;
  const mid = compact ? 14 : 52;
  const band = compact ? 12 : 20;
  const inside = rose >= early && rose <= late;
  const marker = inside ? 'var(--color-primary-700)' : 'var(--color-accent-600)';
  // The header names the recorded-rise date. Include dates only where they differ.
  const sameDay = (a: number, b: number) => datedDay(a) === datedDay(b);
  const markTime = (ms: number) => clockTime(ms) + (sameDay(ms, rose) ? '' : ` · ${shortDate(ms)}`);
  const windowTime = sameDay(early, late)
    ? `${timeSpan(early, late).replace(' to ', '–')}${sameDay(early, rose) ? '' : ` · ${shortDate(early)}`}`
    : `${shortDate(early)}, ${clockTime(early)}–${shortDate(late)}, ${clockTime(late)}`;
  const reading = (ms: number) => `${clockTime(ms)}, ${datedDay(ms)}`;
  return (
    <div ref={frame} className={styles.window}>
      {!compact && <p className={styles.windowCaption}>Window <b>{windowTime}</b></p>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Eddy’s estimate ${reading(estimate)}. Estimated window ${reading(early)} to ${reading(late)}. Recorded rise ${reading(rose)}. Central time.`}>
        <line x1={pad} x2={W - pad} y1={mid} y2={mid} stroke="var(--color-border-strong)" strokeWidth={compact ? 1 : 1.5} />
        <rect x={x(early)} y={mid - band / 2} width={Math.max(x(late) - x(early), 4)} height={band} rx={band / 2} fill="var(--color-primary-100)" stroke="var(--color-primary-300)" />
        <line x1={x(estimate)} x2={x(estimate)} y1={mid - band / 2} y2={mid + band / 2} stroke="var(--color-primary-500)" strokeWidth={1.5} strokeDasharray="2 2" />
        <line x1={x(rose)} x2={x(rose)} y1={mid - band / 2 - (compact ? 3 : 4)} y2={mid + band / 2 + (compact ? 3 : 4)} stroke={marker} strokeWidth={compact ? 2.5 : 3} strokeLinecap="round" />
        {!compact && <>
          <path d={`M${labelX(estimate)} 34L${x(estimate)} ${mid - band / 2}`} fill="none" stroke="var(--color-primary-500)" strokeDasharray="2 2" />
          <path d={`M${x(rose)} ${mid + band / 2 + 4}L${labelX(rose)} 74`} fill="none" stroke={marker} />
          <text data-reading-label="estimate" x={labelX(estimate)} y={14} textAnchor="middle">Estimate<tspan x={labelX(estimate)} dy={16} className={styles.mark}>{markTime(estimate)}</tspan></text>
          <text data-reading-label="rise" x={labelX(rose)} y={86} textAnchor="middle">Rise<tspan x={labelX(rose)} dy={16} className={styles.mark}>{clockTime(rose)}</tspan></text>
          <circle cx={x(rose)} cy={mid} r={5.5} fill={marker} stroke="var(--color-surface)" strokeWidth={2} />
        </>}
      </svg>
    </div>
  );
}

export default function HowClose({ results, onPlay }: {
  results: PublicResults | null;
  onPlay: (result: Compared) => void;
}) {
  const shown = results?.results.filter((r) => r.kind !== 'no-estimate') ?? [];
  const featured = shown.find((r): r is Compared => r.kind === 'compared');
  const pending = shown.filter((r) => r.kind === 'waiting');
  const latest = shown[0];
  const earlier = shown.filter((r) => r !== featured && r.kind !== 'waiting').slice(0, EARLIER_SHOWN);
  const withheld = results?.tally.noEstimate.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const contextDate = featured ? Date.parse(featured.roseAt) : latest ? Date.parse(latest.releasedAt) : null;
  const position = featured ? comparison(featured).position : null;
  const fullTime = (stamp: string) => `${datedDay(Date.parse(stamp))}, ${clockTime(Date.parse(stamp))}`;

  return (
    <section id="how-close" className={`card-panel scroll-mt-24 ${styles.close}`} aria-labelledby="how-close-heading">
      <div className={styles.cardHead}>
        <h2 id="how-close-heading">How close was Eddy?</h2>
        <div className={styles.resultMeta}>
          <p aria-label={`Gauge near Norfork${contextDate === null ? '' : `. ${featured ? 'Recorded rise' : 'Release'} ${datedDay(contextDate)}`}. Central time.`}>
            Norfork{contextDate !== null && ` · ${shortDate(contextDate)}`} · CT
          </p>
          {featured && <Button variant="outline" size="sm" className="min-h-11" aria-label="Replay release" onClick={() => onPlay(featured)}><Play size={14} aria-hidden="true" />Replay</Button>}
        </div>
      </div>
      <div className={styles.cardBody}>
        {featured ? (
          <div className={styles.featured}>
            <div>
              <h3 className={styles.outcome}>{estimateDifference(featured)}</h3>
              <p className={styles.windowStatus} data-outside={position !== 'inside' || undefined}>{position === 'inside' ? 'Within window' : position === 'before' ? 'Before window' : 'After window'}</p>
            </div>
            <WindowGraphic result={featured} />
          </div>
        ) : (
          <div className={styles.empty}>
            <b>{results === null ? 'Results can’t be loaded' : pending.length > 0 ? 'Waiting for gauge readings' : latest?.kind === 'not-compared' ? 'Couldn’t compare' : 'No results yet'}</b>
            <span>{results === null ? 'Try again later.' : latest?.kind === 'not-compared' && pending.length === 0 ? latest.why : 'Comparisons appear after the rise is checked.'}</span>
          </div>
        )}
        {results !== null && <p className={styles.progress}>
          {studyProgress(results.tally.compared)}{results.tally.waiting > 0 && ` · ${results.tally.waiting} waiting`}
        </p>}
      </div>
      <details className={`${styles.more} ${styles.resultDetails}`}>
        <summary>Details</summary>
        <div>
          {featured && <>
            <h3>Readings · Central time</h3>
            <dl>
              <dt>Release at the dam</dt><dd>{datedDay(Date.parse(featured.releasedAt))}, {releaseHour(Date.parse(featured.releasedAt))}</dd>
              <dt>Window starts</dt><dd>{fullTime(featured.earlyAt)}</dd>
              <dt>Window ends</dt><dd>{fullTime(featured.lateAt)}</dd>
              <dt>Eddy’s estimate</dt><dd>{fullTime(featured.estimateAt)}</dd>
              <dt>Recorded rise</dt><dd>{fullTime(featured.roseAt)}</dd>
            </dl>
          </>}
          {pending.length > 0 && <>
            <h3>Waiting for gauge readings</h3>
            <ul>{pending.map((r) => <li key={r.id}>{datedDay(Date.parse(r.releasedAt))} · Released in the {releaseHour(Date.parse(r.releasedAt))}</li>)}</ul>
          </>}
          {earlier.length > 0 && <>
            <h3>Other releases</h3>
            <ul className={styles.earlier} aria-label="Other releases">
              {earlier.map((r) => <li key={r.id}>
                {r.kind === 'compared'
                  ? <button type="button" onClick={() => onPlay(r)} aria-label={`Replay release from ${datedDay(Date.parse(r.releasedAt))}`}>{shortDate(Date.parse(r.releasedAt))}</button>
                  : <span>{shortDate(Date.parse(r.releasedAt))}</span>}
                {r.kind === 'compared' ? <WindowGraphic result={r} compact /> : <div />}
                <span>{r.kind === 'compared' ? shortOutcome(r) : r.kind === 'not-compared' ? r.why : ''}</span>
              </li>)}
            </ul>
          </>}
          <h3>How we compare</h3>
          <p>Eddy saves each estimate before the rise, then checks the gauge a day later. Results include misses. The study needs {RESULTS_NEEDED} comparisons before judging accuracy.</p>
          <p>Measured at the gauge near Norfork, {GAUGE_MILE} miles downstream. Results apply only to this gauge.</p>
          {withheld > 0 && results && <>
            <p>No estimate for {withheld} release{withheld === 1 ? '' : 's'}:</p>
            <ul>{results.tally.noEstimate.map((row) => <li key={row.why}>{row.why}: {row.count}</li>)}</ul>
          </>}
          {results && results.tally.notCompared > 0 && <p>{results.tally.notCompared} could not be compared because the gauge did not give one clear rise.</p>}
        </div>
      </details>
    </section>
  );
}
