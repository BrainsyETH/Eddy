'use client';

// The Story presentation's one featured event: river and place, one short
// observation, and the last 24 hours of water level — with a headline
// ("Still rising", "Crest passed", "Back below flood stage", …) only when the
// observations support it (stories.ts). The map marks the same gauge with the
// spotlight ring. While a river journey runs, the card names that river.

import { seriesDevelopment, storyHeadline, storyObservation, type SeriesPoint, type Story } from '@/lib/national-map/stories';
import type { MapView } from '@/lib/national-map/marks';
import { formatAge } from './Legend';
import { useHistory } from './SiteDetail';
import styles from './national-map.module.css';

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function WallStory({ story, journeyCaption, view, now }: { story: Story | null; journeyCaption: string | null; view: MapView; now: number }) {
  if (journeyCaption) {
    return (
      <section className={styles.wallStory} aria-label="Featured river">
        <p className={styles.wallStoryKicker}>Following the river</p>
        <h2 className={styles.wallStoryTitle}>{journeyCaption}</h2>
      </section>
    );
  }
  if (!story) return null;
  return <StoryBody key={story.site.key} story={story} view={view} now={now} />;
}

function StoryBody({ story, view, now }: { story: Story; view: MapView; now: number }) {
  const site = story.site;
  const unit: 'ft' | 'cfs' = site.reading?.gaugeHeightFt != null || site.kind === 'nws' ? 'ft' : 'cfs';
  const history = useHistory(site.kind === 'usgs' ? site.siteId : null, unit, 1);
  const cutoff = now - 24 * 3_600_000;
  const points: SeriesPoint[] = (history.points ?? []).filter((p) => p.t >= cutoff);
  const development = seriesDevelopment(points, unit);
  const headline = storyHeadline(story, development);
  const observedAt = view === 'flooding' ? site.nws?.observedAt ?? site.reading?.observedAt ?? null : site.reading?.observedAt ?? null;
  const place = [site.waterbody && !site.name.includes(site.waterbody) ? site.waterbody : null, site.stateCode].filter(Boolean).join(' · ');
  return (
    <section className={styles.wallStory} aria-label="Featured event" aria-live="polite">
      {headline && <p className={styles.wallStoryKicker}>{headline}</p>}
      <h2 className={styles.wallStoryTitle}>{site.name}</h2>
      {place && <p className={styles.wallStoryPlace}>{place}</p>}
      <p className={styles.wallStoryObservation}>{storyObservation(story, view)}</p>
      {points.length >= 2 ? (
        <DayChart points={points} unit={unit} crest={development === 'crest_passed'} />
      ) : (
        <p className={styles.wallStoryFine}>
          {site.kind !== 'usgs'
            ? 'NWS forecast point — no USGS series.'
            : history.error
              ? 'Recent readings unavailable.'
              : history.points
                ? 'Not enough readings in the last 24 hours to chart.'
                : 'Loading the last 24 hours…'}
        </p>
      )}
      <p className={styles.wallStoryFine}>Observed {formatAge(observedAt, now)}</p>
    </section>
  );
}

/** 24 hours of water level; the crest is marked when the story says it passed. */
function DayChart({ points, unit, crest }: { points: SeriesPoint[]; unit: string; crest: boolean }) {
  const w = 240;
  const h = 70;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  let lo = Infinity;
  let hi = -Infinity;
  let top = points[0];
  for (const p of points) {
    lo = Math.min(lo, p.v);
    hi = Math.max(hi, p.v);
    if (p.v > top.v) top = p;
  }
  const span = hi - lo || Math.max(0.5, Math.abs(hi) * 0.05);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * w;
  const y = (v: number) => h - 6 - ((v - lo) / span) * (h - 12);
  let d = '';
  points.forEach((p, i) => {
    const gap = i > 0 && p.t - points[i - 1].t > 3 * 3_600_000;
    d += `${i === 0 || gap ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`;
  });
  const last = points[points.length - 1];
  return (
    <figure className={styles.wallStoryChart}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Last 24 hours, ${nf.format(lo)} to ${nf.format(hi)} ${unit}, now ${nf.format(last.v)} ${unit}`}>
        <path d={d} fill="none" stroke="var(--nm-edge)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {crest && <circle cx={x(top.t)} cy={y(top.v)} r={3.2} fill="none" stroke="var(--nm-ink-2)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />}
        <circle cx={x(last.t)} cy={y(last.v)} r={3.6} fill="var(--nm-edge)" />
      </svg>
      <figcaption>
        <span>24 h</span>
        <span>
          now <strong>{nf.format(last.v)} {unit}</strong>
        </span>
      </figcaption>
    </figure>
  );
}
