'use client';
import styles from './overview.module.css';

/** Missing is never shown as zero. */
export const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString();

export type Tone = 'good' | 'warn' | 'bad' | 'quiet';

export function Status({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={styles.status} data-tone={tone}>
      <span aria-hidden="true" className={styles.dot} />
      {children}
    </span>
  );
}

/** "▲ 12% vs last week" chip. Rising is good for every number we chart. */
export function Change({
  total,
  prior,
  days,
}: {
  total: number;
  prior: number;
  days: 7 | 30;
}) {
  const span = days === 7 ? 'last week' : 'the 30 days before';
  if (total === prior)
    return <span className={styles.change} data-dir="flat">Same as {span}</span>;
  const up = total > prior;
  const label = prior
    ? `${Math.round((Math.abs(total - prior) / prior) * 100)}%`
    : `+${(total - prior).toLocaleString()}`;
  return (
    <span className={styles.change} data-dir={up ? 'up' : 'down'}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span> {label}
      <span className={styles.srOnly}>{up ? ' up' : ' down'}</span> vs {span}
    </span>
  );
}

export function Sparkline({
  values,
  label,
}: {
  values: number[];
  label: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const y = (v: number) => 30 - (v / max) * 26;
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  return (
    <svg
      className={styles.spark}
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <path d={`${line} L100,32 L0,32 Z`} className={styles.sparkArea} />
      <path d={line} className={styles.sparkLine} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A dashboard card. Its title is the question the card answers. */
export function Panel({
  id,
  question,
  hint,
  action,
  children,
  wide,
}: {
  id?: string;
  question: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section
      id={id}
      className={styles.panel}
      data-wide={wide || undefined}
      aria-labelledby={id ? `${id}-q` : undefined}
    >
      <header className={styles.panelHead}>
        <div>
          <h2 id={id ? `${id}-q` : undefined}>{question}</h2>
          {hint && <p>{hint}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
