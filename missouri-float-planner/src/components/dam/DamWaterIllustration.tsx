import type { CSSProperties, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { DamSnapshot, DamMetricValue } from '@shared/dam-types';
import type { LakeSection } from '@shared/lake-types';
import { readingStaleness } from '@shared/dam-schedule-copy';
import {
  ABOVE_FULL_GENERATION_LABEL, FULL_GENERATION_SHORT_LABEL, RACK_ESTIMATE_SHORT,
  generationNow, generationPercentLabel, generationStatusLabel, generationVoiceOver,
  generatorRack, releaseComparison, spillwayRelease, spillwayReleaseLabel,
} from '@shared/dam-generation';
import { damWaterIllustrationState, validMetric } from '@/lib/dam-water-illustration';
import { sharedObservationAt } from '@/lib/lakes/presentation';
import { ReadingTime } from './DamGenerationHero';
import DamGeneratorRack from './DamGeneratorRack';
import LakeMovement from '@/components/lake/LakeMovement';

function ReadingNote({ metric, now }: { metric: DamMetricValue; now: number }) {
  return <>
    {metric.dailyMean && <p className="dam-water-note">Daily average</p>}
    <ReadingTime at={metric.at} now={now} className="" />
    {readingStaleness(metric.at, now) !== 'fresh' && <p className="dam-water-outdated">Outdated reading</p>}
  </>;
}

/** Reported water only. The posted schedule retains its own section below. */
export default function DamWaterIllustration({ dam, now, lake, source }: {
  dam: DamSnapshot; now: number; lake?: LakeSection | null; source?: ReactNode;
}) {
  const pool = dam.metrics.poolElevation!;
  const release = dam.metrics.release!;
  const turbine = validMetric(dam.metrics.generationFlow) && dam.metrics.generationFlow.value >= 0 ? dam.metrics.generationFlow : undefined;
  const spillway = validMetric(dam.metrics.spillwayFlow) && dam.metrics.spillwayFlow.value >= 0 ? dam.metrics.spillwayFlow : undefined;
  const view = damWaterIllustrationState(dam, now, lake);
  const commonAt = sharedObservationAt([pool, release, turbine, spillway]);
  const state = generationNow(dam, now);
  const status = generationStatusLabel(state);
  const rack = state.kind === 'generating' ? generatorRack(state.turbineCfs, dam.generationReference) : null;
  const percent = state.kind === 'generating' ? generationPercentLabel(state.fraction) : null;
  const comparison = releaseComparison(turbine, release, dam.generationReference, { declared: dam.releaseExcludesGeneration, now });
  const spill = spillwayRelease(dam, now);
  const lakeEdge = 482 - (view.surfaceY - 42) * 22 / 180;
  const style = { '--lake-label-y': `${(view.surfaceY + 32) / 240 * 100}%` } as CSSProperties;

  return <section className="dam-water-root" aria-label="Reported water release" data-dam-water-illustration>
    <div className="dam-water-readings">
      <div className="dam-water-level">
        <p className="dam-water-label">Lake level</p>
        <p className="dam-water-level-value">{pool.value.toFixed(2)} <span>ft</span></p>
        {view.change24hFt !== undefined && <LakeMovement delta={view.change24hFt} hours={24} />}
        {commonAt && pool.dailyMean && <p className="dam-water-note">Daily average</p>}
        {!commonAt && <ReadingNote metric={pool} now={now} />}
      </div>
      <div className="dam-water-release">
        <h2 className="dam-water-label">Water release</h2>
        <p className="dam-water-release-value" data-total-release>{Math.round(release.value).toLocaleString('en-US')} <span>cfs</span></p>
        <p className="dam-water-note">{release.dailyMean ? 'Total release · Daily average' : 'Total water leaving the dam'}</p>
        {!commonAt && <ReadingNote metric={{ ...release, dailyMean: false }} now={now} />}
      </div>
    </div>

    <figure className="dam-water-figure">
      <div className="dam-water-scene" style={style}>
      <svg viewBox="0 0 900 240" preserveAspectRatio="none" className="dam-water-drawing" aria-hidden="true">
        <path className="dam-water-ground" d="M0 206 Q190 230 460 220 H900 V240 H0Z" />
        <path className="dam-water-lake-water" d={`M0 ${view.surfaceY} H${lakeEdge} L460 221 Q190 230 0 207Z`} />
        <path className="dam-water-waterline" d={`M0 ${view.surfaceY} H${lakeEdge}`} />
        <path className="dam-water-river-water" d="M584 213 Q733 209 900 213 V232 H584Z" />
        <path className="dam-water-waterline" d="M584 213 Q733 209 900 213" />
        <path className="dam-water-dam" d="M482 42 H537 L641 228 H460Z" />
        <path className="dam-water-dam-face" d="M523 42 H537 L641 228 H625Z" />
        <path className="dam-water-dam-cap" d="M478 35 H540 V48 H478Z" />
        <path className="dam-water-conduit" d="M468 174 H500 C530 174 534 215 566 215 H633" />
        {view.turbineActive && <g data-water-path="turbine">
          <path className="dam-water-flow" d="M468 174 H500 C530 174 534 215 566 215 H633" />
          <path className="dam-water-arrow" d="M579 215 H608 M602 210 L608 215 L602 220" />
        </g>}
        {view.spillwayActive && <g data-water-path="spillway">
          <path className="dam-water-spillway" d={`M${lakeEdge} ${view.surfaceY} H${537 + (view.surfaceY - 42) * 104 / 186} Q${549 + (view.surfaceY - 42) * 104 / 186} ${view.surfaceY + 12} 620 194 Q642 217 677 215`} />
        </g>}
        {view.seasonalFt !== null && <path className="dam-water-reference" d="M0 98 H475" />}
      </svg>
      {view.seasonalFt !== null && <span className="dam-water-reference-label">Seasonal pool <span>{view.seasonalFt.toFixed(1)} ft</span></span>}
      <span className="dam-water-lake-label">Lake</span>
      <span className="dam-water-river-label">Below the dam</span>
      </div>
      <figcaption className="dam-water-caption">Illustration not to scale</figcaption>
    </figure>

    <div className="dam-water-breakdown">
      <div><span>Through turbines</span> <strong>{turbine ? `${Math.round(turbine.value).toLocaleString('en-US')} cfs` : 'Unavailable'}</strong>
        {turbine && (!commonAt || turbine.dailyMean) && <ReadingNote metric={turbine} now={now} />}
      </div>
      <div><span>Spillway</span> <strong>{spillway ? `${Math.round(spillway.value).toLocaleString('en-US')} cfs` : 'Unavailable'}</strong>
        {spillway && (!commonAt || spillway.dailyMean) && <ReadingNote metric={spillway} now={now} />}
      </div>
    </div>
    {spill && <p className="dam-water-spill-note">{spillwayReleaseLabel(spill)}</p>}
    {comparison.kind === 'other-release' && <p className="dam-water-note">Not through turbines <strong>{Math.round(comparison.otherCfs).toLocaleString('en-US')} cfs</strong></p>}

    <details className="dam-water-details">
      <summary>Generation details <ChevronDown size={18} aria-hidden="true" /></summary>
      <div className="dam-water-detail-body">
        {status && <p className="font-semibold">{status}</p>}
        {rack && <div className="dam-water-rack">
          <DamGeneratorRack rack={rack} compact />
          {percent && <p>~{percent} {FULL_GENERATION_SHORT_LABEL}</p>}
          <span className="sr-only">{generationVoiceOver(state, dam.generationReference)}</span>
        </div>}
        {rack && <p className="dam-water-note">{RACK_ESTIMATE_SHORT}</p>}
        {state.kind === 'generating' && state.fraction !== null && state.fraction > 1 && <p className="dam-water-note">{ABOVE_FULL_GENERATION_LABEL}</p>}
        <p className="dam-water-note">The dashed line is the Corps&apos; seasonal power-pool level for the lake reading&apos;s date. Elevations use NGVD29.</p>
      </div>
    </details>
    <div className="dam-water-source">
      {source}
      {commonAt && <div><ReadingTime at={commonAt} now={now} className="" />
        {readingStaleness(commonAt, now) !== 'fresh' && <p className="dam-water-outdated">Outdated readings</p>}
      </div>}
    </div>
  </section>;
}
