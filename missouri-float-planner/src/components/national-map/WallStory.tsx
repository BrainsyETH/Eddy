'use client';

// The Story presentation's one featured event: river and place, one short
// observation, and the last 24 hours of water level — with a headline
// ("Still rising", "Crest passed", "Back below flood stage", …) only when the
// observations support it (stories.ts). The map marks the same gauge with the
// spotlight ring. While a river journey runs, the card names that river.

import { chartStages, seriesDevelopment, storyHeadline, storyObservation, type SeriesPoint, type Story } from '@/lib/national-map/stories';
import type { FloodStages } from '@/lib/national-map/catalog';
import type { MapPalette } from '@/lib/national-map/theme';
import type { MapView } from '@/lib/national-map/marks';
import { formatAge } from './Legend';
import { useHistory } from './SiteDetail';
import styles from './national-map.module.css';

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function WallStory({
  story,
  journeyCaption,
  view,
  now,
  palette,
}: {
  story: Story | null;
  journeyCaption: string | null;
  view: MapView;
  now: number;
  palette: MapPalette;
}) {
  if (journeyCaption) {
    return (
      <section className={styles.wallStory} aria-label="Featured river">
        <p className={styles.wallStoryKicker}>Following the river</p>
        <h2 className={styles.wallStoryTitle}>{journeyCaption}</h2>
      </section>
    );
  }
  if (!story) return null;
  return <StoryBody key={story.site.key} story={story} view={view} now={now} palette={palette} />;
}

function StoryBody({ story, view, now, palette }: { story: Story; view: MapView; now: number; palette: MapPalette }) {
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
        <DayChart
          points={points}
          unit={unit}
          crest={development === 'crest_passed'}
          stages={unit === 'ft' ? chartStages(site) : null}
          palette={palette}
        />
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

/**
 * 24 hours of water level; the crest is marked when the story says it passed.
 * NWS flood-category stages are drawn as dashed lines when they share the
 * gauge's datum (chartStages), and the range stretches to the nearest one
 * above the water so an approach reads at a glance.
 */
function DayChart({
  points,
  unit,
  crest,
  stages,
  palette,
}: {
  points: SeriesPoint[];
  unit: string;
  crest: boolean;
  stages: FloodStages | null;
  palette: MapPalette;
}) {
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
  const range = Math.max(hi - lo, 0.5);
  const lines = stages
    ? (
        [
          ['action', 'Action', palette.flood.action],
          ['flood', 'Flood', palette.flood.minor],
          ['moderate', 'Moderate', palette.flood.moderate],
          ['major', 'Major', palette.flood.major],
        ] as const
      )
        .map(([key, label, color]) => ({ value: stages[key], label, color }))
        .filter((l): l is { value: number; label: typeof l.label; color: string } => l.value !== null)
        // Lines below the water, and the next ones above within reach.
        .filter((l) => l.value >= lo - range && l.value <= hi + Math.max(1, range * 1.5))
    : [];
  for (const l of lines) {
    lo = Math.min(lo, l.value);
    hi = Math.max(hi, l.value);
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
  const linesText = lines.map((l) => `${l.label.toLowerCase()} stage ${nf.format(l.value)} ft`).join(', ');
  return (
    <figure className={styles.wallStoryChart}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Last 24 hours, ${nf.format(Math.min(...points.map((p) => p.v)))} to ${nf.format(Math.max(...points.map((p) => p.v)))} ${unit}, now ${nf.format(last.v)} ${unit}${linesText ? `; NWS ${linesText}` : ''}`}
      >
        {lines.map((l) => (
          <g key={l.label}>
            <line x1={0} x2={w} y1={y(l.value)} y2={y(l.value)} stroke={l.color} strokeWidth={1.2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            {/* Labels sit at the left: a story's latest reading (the right end) is where the line lives. */}
            <text x={2} y={y(l.value) - 2} textAnchor="start" fontSize={8} fill={l.color}>
              {l.label} {nf.format(l.value)}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--nm-edge)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {crest && <circle cx={x(top.t)} cy={y(top.v)} r={3.2} fill="none" stroke="var(--nm-ink-2)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />}
        <circle cx={x(last.t)} cy={y(last.v)} r={3.6} fill="var(--nm-edge)" />
      </svg>
      <figcaption>
        <span>24 h{lines.length ? ' · NWS flood stages' : ''}</span>
        <span>
          now <strong>{nf.format(last.v)} {unit}</strong>
        </span>
      </figcaption>
    </figure>
  );
}
