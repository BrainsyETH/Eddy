'use client';

// "How close was Eddy?": each estimate against the rise the gauge recorded.
//
// Forward results only. Rows come from publicResults (src/lib/arrival-trial/
// public-results.ts), which publishes an estimate only together with its
// outcome; a release still travelling arrives here as `waiting`, with no
// window to draw. Results belong to the gauge near Norfork and say so.

import Button from '@/components/ui/Button';
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { comparison, type PublicResult, type PublicResults } from '@/lib/arrival-trial/public-results';
import { GAUGE_MILE } from '@/lib/release-timing/river';
import { clockTime, datedDay, durationText, longDate, shortDate, timeSpan } from '@/lib/release-timing/time';
import styles from './release-timing.module.css';

type Compared = Extract<PublicResult, { kind: 'compared' }>;
const HOUR_MS = 3_600_000;
/** The study scores once this many estimates have been compared (protocol_forward.json). */
const NEEDED = 60;
const EARLIER_SHOWN = 8;

/** One plain sentence: where the rise fell against the estimated window. */
export function outcomeSentence(result: Compared): string {
  const { position, outsideMinutes, fromEstimateMinutes } = comparison(result);
  if (position !== 'inside') return `The river started rising ${durationText(outsideMinutes)} ${position} the estimated window.`;
  const off = Math.abs(fromEstimateMinutes);
  return off < 8
    ? 'The river started rising inside the estimated window, right at Eddy’s estimate.'
    : `The river started rising inside the estimated window, ${durationText(off)} ${fromEstimateMinutes < 0 ? 'before' : 'after'} Eddy’s estimate.`;
}
const shortOutcome = (result: Compared): string => {
  const { position, outsideMinutes } = comparison(result);
  return position === 'inside' ? 'Inside the window' : `${durationText(outsideMinutes)} ${position} the window`;
};

/** The estimated window as a shaded span on a time axis, with the observed rise marked on it. */
function WindowGraphic({ result, compact = false }: { result: Compared; compact?: boolean }) {
  const [frame, W] = useMeasuredWidth<HTMLDivElement>(compact ? 320 : 720, 160);
  const estimate = Date.parse(result.estimateAt);
  const early = Date.parse(result.earlyAt);
  const late = Date.parse(result.lateAt);
  const rose = Date.parse(result.roseAt);
  // Four hours either side of the estimate, widened only when the rise fell outside that.
  const reach = Math.max(4 * HOUR_MS, Math.abs(rose - estimate) + HOUR_MS / 2);
  const pad = compact ? 6 : 12;
  const x = (ms: number) => pad + ((ms - (estimate - reach)) / (2 * reach)) * (W - 2 * pad);
  const H = compact ? 28 : 96;
  const mid = compact ? 14 : 46;
  const band = compact ? 12 : 22;
  const inside = rose >= early && rose <= late;
  const marker = inside ? 'var(--color-primary-700)' : 'var(--color-accent-600)';
  const roseAnchor = x(rose) < 90 ? 'start' : x(rose) > W - 90 ? 'end' : 'middle';
  return (
    <div ref={frame} className={styles.window}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Estimated window ${timeSpan(early, late)}. River rose ${clockTime(rose)}.`}
      >
        <line x1={pad} x2={W - pad} y1={mid} y2={mid} stroke="var(--color-border-strong)" strokeWidth={compact ? 1 : 1.5} />
        <rect x={x(early)} y={mid - band / 2} width={Math.max(x(late) - x(early), 4)} height={band} rx={band / 2} fill="var(--color-primary-100)" stroke="var(--color-primary-300)" />
        <line x1={x(estimate)} x2={x(estimate)} y1={mid - band / 2} y2={mid + band / 2} stroke="var(--color-primary-500)" strokeWidth={1.5} strokeDasharray="2 2" />
        <line x1={x(rose)} x2={x(rose)} y1={mid - band / 2 - (compact ? 3 : 7)} y2={mid + band / 2 + (compact ? 3 : 7)} stroke={marker} strokeWidth={compact ? 2.5 : 3} strokeLinecap="round" />
        {!compact && (
          <>
            <circle cx={x(rose)} cy={mid} r={5.5} fill={marker} stroke="var(--color-surface)" strokeWidth={2} />
            <text x={(x(early) + x(late)) / 2} y={mid - band / 2 - 12} textAnchor="middle">Estimated window {timeSpan(early, late)}</text>
            <text x={x(rose)} y={mid + band / 2 + 24} textAnchor={roseAnchor} className={styles.mark}>River rose {clockTime(rose)}</text>
          </>
        )}
      </svg>
    </div>
  );
}

export default function HowClose({
  results,
  onPlay,
}: {
  /** Null when the results could not be read. */
  results: PublicResults | null;
  onPlay: (result: Compared) => void;
}) {
  const shown = results?.results.filter((r) => r.kind !== 'no-estimate') ?? [];
  const compared = shown.filter((r): r is Compared => r.kind === 'compared');
  const featured = compared[0];
  const pending = shown.filter((r) => r.kind === 'waiting');
  const latest = shown[0];
  const earlier = shown.filter((r) => r !== featured && r.kind !== 'waiting').slice(0, EARLIER_SHOWN);
  const withheld = results?.tally.noEstimate.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const oldest = results?.results[results.results.length - 1];

  return (
    <section id="how-close" className={`card-panel scroll-mt-24 ${styles.close}`} aria-labelledby="how-close-heading">
      <div className={styles.cardHead}>
        <h2 id="how-close-heading">How close was Eddy?</h2>
        <p>Eddy’s estimate against the rise recorded at the gauge near Norfork, {GAUGE_MILE} miles below the dam.</p>
      </div>
      <div className={styles.cardBody}>
        {results === null ? (
          <p className={styles.status}>Results can’t be loaded right now.</p>
        ) : shown.length === 0 ? (
          <div className={styles.empty}>
            <b>No results yet</b>
            <span>The first appears the day after the next release Eddy can estimate.</span>
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <p className={styles.status}>
                <b>Waiting for downstream readings.</b>{' '}
                {pending.length === 1
                  ? `A release went out ${shortDate(Date.parse(pending[0].releasedAt))} at ${clockTime(Date.parse(pending[0].releasedAt))}.`
                  : `${pending.length} releases are still on their way.`}{' '}
                The result appears after the river has answered, about a day later.
              </p>
            )}
            {latest.kind === 'not-compared' && (
              <p className={styles.status}>
                <b>Couldn’t compare the {shortDate(Date.parse(latest.releasedAt))} release.</b> {latest.why}.
              </p>
            )}
            {featured && (
              <div className={styles.featured}>
                <h3>Release of {longDate(Date.parse(featured.releasedAt))}, at {clockTime(Date.parse(featured.releasedAt))}</h3>
                <WindowGraphic result={featured} />
                <p className={styles.outcome}>{outcomeSentence(featured)}</p>
                <div><Button variant="outline" size="sm" className="min-h-11" onClick={() => onPlay(featured)}>Play this release on the map</Button></div>
              </div>
            )}
            {earlier.length > 0 && (
              <ul className={styles.earlier} aria-label="Earlier releases">
                {earlier.map((r) => (
                  <li key={r.id}>
                    {r.kind === 'compared' ? (
                      <button type="button" onClick={() => onPlay(r)} title="Play this release on the map">{shortDate(Date.parse(r.releasedAt))}</button>
                    ) : (
                      <span>{shortDate(Date.parse(r.releasedAt))}</span>
                    )}
                    {r.kind === 'compared' ? <WindowGraphic result={r} compact /> : <div />}
                    <span>{r.kind === 'compared' ? shortOutcome(r) : r.kind === 'not-compared' ? 'Couldn’t compare' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
            {results.tally.compared > 0 && (
              <p className={styles.tally}>
                {results.tally.insideWindow} of {results.tally.compared} inside the window since {datedDay(Date.parse((oldest ?? latest).releasedAt))}.
                {results.tally.compared < NEEDED ? ` Too few to judge: the study needs ${NEEDED}.` : ''}
              </p>
            )}
          </>
        )}
      </div>
      {featured && (
        <details className={styles.more}>
          <summary>See the readings</summary>
          <div>
            <dl>
              <dt>Release rose at the dam</dt>
              <dd>{clockTime(Date.parse(featured.releasedAt))}, {shortDate(Date.parse(featured.releasedAt))}</dd>
              <dt>Estimated window</dt>
              <dd>{timeSpan(Date.parse(featured.earlyAt), Date.parse(featured.lateAt))}, {shortDate(Date.parse(featured.estimateAt))}</dd>
              <dt>Eddy’s estimate</dt>
              <dd>{clockTime(Date.parse(featured.estimateAt))}</dd>
              <dt>River rose at the gauge</dt>
              <dd>{clockTime(Date.parse(featured.roseAt))}, {shortDate(Date.parse(featured.roseAt))}</dd>
            </dl>
          </div>
        </details>
      )}
      <details className={styles.more}>
        <summary>How we compare</summary>
        <div>
          <p>
            When Bull Shoals raises its release by 2,000 cfs or more, Eddy saves an estimate of when the gauge near Norfork will start to rise, with a window around it.
            A day later it reads the gauge. The estimate is shown here only after that, with the misses.
          </p>
          <p>A result here is for that gauge only. It says nothing about Cotter, Rim Shoals or any access without a gauge.</p>
          {withheld > 0 && results && (
            <>
              <p>Eddy made no estimate for {withheld} release{withheld === 1 ? '' : 's'}:</p>
              <ul>
                {results.tally.noEstimate.map((row) => <li key={row.why}>{row.why}: {row.count}</li>)}
              </ul>
            </>
          )}
          {results && results.tally.notCompared > 0 && <p>{results.tally.notCompared} could not be compared, because the gauge did not give one clear rise.</p>}
        </div>
      </details>
    </section>
  );
}
