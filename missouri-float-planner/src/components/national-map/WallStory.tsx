'use client';

// The Story presentation's one featured event, built to be read across a room:
//
//   * the LEAD is what the map shows — the gauge's own mark (shape, NWS or
//     flow colour) and its category at title size — with the development set
//     above it ("Now in", "Rose to", "Still rising", "Back below flood
//     stage"), only when the observations support it (stories.ts);
//   * the gauge, its river and state, and a small locator map;
//   * the reading as a number, against NWS flood stage only where the datums
//     agree (storyStanding / chartStages);
//   * the last 24 hours, with NWS flood stages where they can be drawn
//     honestly, the area above flood stage shaded, and the latest value
//     labelled at the end of the line;
//   * how many developments are in rotation (dots).
//
// While a river journey runs the card names it; when nothing in view
// deserves a story, a calm card says so with the counts (calmSummary).

import type { ReactNode } from 'react';
import {
  chartStages,
  seriesDevelopment,
  storyDetails,
  storyLead,
  storyStanding,
  type CalmSummary,
  type SeriesPoint,
  type Story,
} from '@/lib/national-map/stories';
import type { FloodStages } from '@/lib/national-map/catalog';
import type { MapPalette } from '@/lib/national-map/theme';
import type { MapView } from '@/lib/national-map/marks';
import { locatorBox, locatorPoint, type Locator } from '@/lib/national-map/locator';
import { formatAge, MarkSymbol } from './Legend';
import { useHistory } from './SiteDetail';
import styles from './national-map.module.css';

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export interface StoryJourney {
  kicker: string;
  caption: string;
}

export function WallStory({
  story,
  journey,
  calm,
  view,
  now,
  palette,
  locator,
  regionStates,
  sequence,
}: {
  story: Story | null;
  journey: StoryJourney | null;
  calm: CalmSummary | null;
  view: MapView;
  now: number;
  palette: MapPalette;
  locator: Locator | null;
  /** The states of the region on show (the locator frames them), or null for the country. */
  regionStates: string[] | null;
  /** Developments in rotation, and which one this is. */
  sequence: { count: number; index: number } | null;
}) {
  if (journey) {
    return (
      <section className={styles.wallStory} aria-label="Featured river">
        <p className={styles.wallStoryLeadKicker}>{journey.kicker}</p>
        <h2 className={styles.wallStoryTitle}>{journey.caption}</h2>
      </section>
    );
  }
  if (story) {
    return (
      <StoryBody
        key={story.site.key}
        story={story}
        view={view}
        now={now}
        palette={palette}
        locator={locator}
        regionStates={regionStates}
        sequence={sequence}
      />
    );
  }
  if (calm) return <CalmCard calm={calm} palette={palette} />;
  return null;
}

function StoryBody({
  story,
  view,
  now,
  palette,
  locator,
  regionStates,
  sequence,
}: {
  story: Story;
  view: MapView;
  now: number;
  palette: MapPalette;
  locator: Locator | null;
  regionStates: string[] | null;
  sequence: { count: number; index: number } | null;
}) {
  const site = story.site;
  const unit: 'ft' | 'cfs' = view === 'flow' ? 'cfs' : site.reading?.gaugeHeightFt != null || site.kind === 'nws' ? 'ft' : 'cfs';
  const history = useHistory(site.kind === 'usgs' ? site.siteId : null, unit, 1);
  const cutoff = now - 24 * 3_600_000;
  const points: SeriesPoint[] = (history.points ?? []).filter((p) => p.t >= cutoff);
  const development = seriesDevelopment(points, unit);
  const lead = storyLead(story, development, view);
  const details = storyDetails(story);
  const standing = view === 'change' ? null : storyStanding(site, view, story.cls);
  const observedAt = view === 'flooding' ? site.nws?.observedAt ?? site.reading?.observedAt ?? null : site.reading?.observedAt ?? null;
  const place = [site.waterbody && !site.name.includes(site.waterbody) ? site.waterbody : null, site.stateCode].filter(Boolean).join(' · ');
  const stages = unit === 'ft' ? chartStages(site) : null;
  return (
    <section className={styles.wallStory} aria-label="Featured event" aria-live="polite">
      {lead.kicker && <p className={styles.wallStoryLeadKicker}>{lead.kicker}</p>}
      {lead.status && (
        <p className={styles.wallStoryStatus}>
          {lead.style && <MarkSymbol style={lead.style} palette={palette} css={{ width: '1.35em', height: '1.35em' }} />}
          <span>{lead.status}</span>
        </p>
      )}
      <div className={styles.wallStoryHead}>
        <div>
          <h2 className={styles.wallStoryTitle}>{site.name}</h2>
          {place && <p className={styles.wallStoryPlace}>{place}</p>}
        </div>
        {locator && <LocatorMap locator={locator} site={story.site} regionStates={regionStates} />}
      </div>
      {standing && (
        <p className={styles.wallStoryStanding}>
          <strong>{standing.value}</strong>
          {standing.relation && <span> · {standing.relation}</span>}
        </p>
      )}
      {details.length > 0 && <p className={styles.wallStoryObservation}>{details.join(' · ')}</p>}
      {points.length >= 2 ? (
        <DayChart points={points} unit={unit} crest={development === 'crest_passed'} stages={stages} palette={palette} />
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
      <div className={styles.wallStoryFoot}>
        <p className={styles.wallStoryFine}>Observed {formatAge(observedAt, now)}</p>
        {sequence && sequence.count > 1 && <SequenceDots {...sequence} />}
      </div>
    </section>
  );
}

function SequenceDots({ count, index }: { count: number; index: number }) {
  return (
    <span className={styles.wallStoryDots} role="img" aria-label={`Story ${index + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} data-on={i === index ? 'true' : undefined} />
      ))}
    </span>
  );
}

/** The country (or the region's states) with the gauge marked. */
function LocatorMap({ locator, site, regionStates }: { locator: Locator; site: Story['site']; regionStates: string[] | null }) {
  const box = locatorBox(locator, regionStates);
  const [x, y] = locatorPoint(locator, site.component, site.x, site.y);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const r = Math.max(w, h) * 0.028;
  return (
    <svg
      className={styles.wallStoryLocator}
      viewBox={`${box.minX.toFixed(1)} ${box.minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`}
      role="img"
      aria-label={`Location${site.stateCode ? `: ${site.stateCode}` : ''}`}
    >
      {locator.states.map((s, i) => (
        <path
          key={s.code ?? i}
          d={s.d}
          fill={s.code && s.code === site.stateCode ? 'var(--nm-locator-here)' : 'var(--nm-locator-land)'}
          stroke="var(--nm-locator-line)"
          strokeWidth={Math.max(w, h) * 0.0025}
          fillRule="evenodd"
        />
      ))}
      <circle cx={x} cy={y} r={r * 1.9} fill="none" stroke="var(--nm-ink)" strokeWidth={r * 0.55} />
      <circle cx={x} cy={y} r={r * 0.75} fill="var(--nm-ink)" />
    </svg>
  );
}

function CalmCard({ calm, palette }: { calm: CalmSummary; palette: MapPalette }): ReactNode {
  return (
    <section className={styles.wallStory} aria-label="Featured event" aria-live="polite">
      <p className={styles.wallStoryLeadKicker}>All quiet</p>
      <h2 className={styles.wallStoryTitle}>{calm.title}</h2>
      {calm.lines.map((l) => (
        <p key={l} className={styles.wallStoryObservation}>
          {l}
        </p>
      ))}
      {calm.bands && (
        <div className={styles.wallStoryBands} role="img" aria-label={calm.bands.map((b) => `${b.key.replace('_', ' ')} ${Math.round(b.share * 100)}%`).join(', ')}>
          {calm.bands.map((b) =>
            b.share > 0 ? <span key={b.key} style={{ flexGrow: b.share, background: palette.flow[b.key] }} /> : null,
          )}
        </div>
      )}
    </section>
  );
}

/**
 * 24 hours of water level; the crest is marked when the story says it passed.
 * NWS flood-category stages are drawn as dashed lines when they share the
 * gauge's datum (chartStages); the range stretches to the nearest one above
 * the water so an approach reads at a glance, and the water above flood stage
 * is shaded.
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
  const h = 92;
  const right = 40; // room for the latest value at the end of the line
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
  const plotW = w - right;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * plotW;
  const y = (v: number) => h - 8 - ((v - lo) / span) * (h - 18);
  let d = '';
  points.forEach((p, i) => {
    const gap = i > 0 && p.t - points[i - 1].t > 3 * 3_600_000;
    d += `${i === 0 || gap ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`;
  });
  const last = points[points.length - 1];
  const flood = lines.find((l) => l.label === 'Flood');
  const linesText = lines.map((l) => `${l.label.toLowerCase()} stage ${nf.format(l.value)} ft`).join(', ');
  const lastY = y(last.v);
  return (
    <figure className={styles.wallStoryChart}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Last 24 hours, ${nf.format(Math.min(...points.map((p) => p.v)))} to ${nf.format(Math.max(...points.map((p) => p.v)))} ${unit}, now ${nf.format(last.v)} ${unit}${linesText ? `; NWS ${linesText}` : ''}`}
      >
        {flood && <rect x={0} y={0} width={plotW} height={Math.max(0, y(flood.value))} fill={flood.color} opacity={0.12} />}
        {lines.map((l) => (
          <g key={l.label}>
            <line x1={0} x2={plotW} y1={y(l.value)} y2={y(l.value)} stroke={l.color} strokeWidth={1.3} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            {/* Labels sit at the left: the latest reading (the right end) is where the line lives. */}
            <text x={2} y={y(l.value) - 2.5} textAnchor="start" fontSize={8.5} fontWeight={600} fill={l.color}>
              {l.label} {nf.format(l.value)}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--nm-edge)" strokeWidth={2.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {crest && <circle cx={x(top.t)} cy={y(top.v)} r={3.4} fill="none" stroke="var(--nm-ink-2)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />}
        <circle cx={x(last.t)} cy={lastY} r={3.8} fill="var(--nm-edge)" />
        <text x={plotW + 6} y={Math.min(h - 3, Math.max(10, lastY + 3.5))} fontSize={11} fontWeight={700} fill="var(--nm-ink)">
          {nf.format(last.v)}
        </text>
      </svg>
      <figcaption>
        <span>24 h{lines.length ? ' · NWS flood stages' : ''}</span>
        <span>{unit}</span>
      </figcaption>
    </figure>
  );
}
