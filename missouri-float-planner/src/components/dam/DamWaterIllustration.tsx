'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Pause, Play, X } from 'lucide-react';
import type { DamSnapshot, DamMetricValue } from '@shared/dam-types';
import type { LakeSection } from '@shared/lake-types';
import { readingStaleness, tailwaterMovementSentence } from '@shared/dam-schedule-copy';
import {
  ABOVE_FULL_GENERATION_LABEL, FULL_GENERATION_SHORT_LABEL, RACK_ESTIMATE_SHORT,
  generationNow, generationPercentLabel, generationStatusLabel, generationVoiceOver, generatorRack,
} from '@shared/dam-generation';
import { damWaterIllustrationState, validMetric } from '@/lib/dam-water-illustration';
import { sharedObservationAt } from '@/lib/lakes/presentation';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import Button from '@/components/ui/Button';
import { ReadingTime } from './DamGenerationHero';
import DamGeneratorRack from './DamGeneratorRack';
import DamWaterScene from './DamWaterScene';
import LakeMovement from '@/components/lake/LakeMovement';
import { lakePoolPositionSentence } from '@shared/lake-pool-reference';

type Detail = 'lake' | 'turbines' | 'downstream';
const areas: Array<{ id: Detail; label: string }> = [
  { id: 'lake', label: 'Lake' }, { id: 'turbines', label: 'Turbines' }, { id: 'downstream', label: 'River' },
];
const cfs = (value: number) => `${Math.round(value).toLocaleString('en-US')} cfs`;
const outdated = (metric: DamMetricValue, now: number) => readingStaleness(metric.at, now) !== 'fresh';

function ReadingNote({ metric, now, showTime = true }: { metric: DamMetricValue; now: number; showTime?: boolean }) {
  return <div className="dam-water-note">
    {metric.dailyMean && <p>Daily average</p>}
    {showTime && <ReadingTime at={metric.at} now={now} className="" />}
    {outdated(metric, now) && <p className="dam-water-outdated">Outdated reading</p>}
  </div>;
}

function DetailReading({ label, metric, now, format, note }: {
  label: string; metric?: DamMetricValue; now: number; format: (value: number) => string; note?: ReactNode;
}) {
  const available = validMetric(metric);
  return <div><p className="dam-water-label">{label}</p>
    <p className={`font-mono text-lg ${available && outdated(metric, now) ? 'opacity-70' : ''}`}>{available ? format(metric.value) : 'Unavailable'}</p>
    {available && (note ? <><p className="dam-water-note">{note}</p><ReadingNote metric={metric} now={now} showTime={false} /></> : <ReadingNote metric={metric} now={now} />)}
  </div>;
}

/** Reported water only. The posted schedule retains its own section below. */
export default function DamWaterIllustration({ dam, now, lake, source }: {
  dam: DamSnapshot; now: number; lake?: LakeSection | null; source?: ReactNode;
}) {
  const pool = dam.metrics.poolElevation!;
  const release = dam.metrics.release!;
  const turbine = validMetric(dam.metrics.generationFlow) && dam.metrics.generationFlow.value >= 0 ? dam.metrics.generationFlow : undefined;
  const spillway = validMetric(dam.metrics.spillwayFlow) && dam.metrics.spillwayFlow.value >= 0 ? dam.metrics.spillwayFlow : undefined;
  const floodPool = validMetric(dam.metrics.pctFloodPool) && dam.metrics.pctFloodPool.value >= 0 ? dam.metrics.pctFloodPool : undefined;
  const view = damWaterIllustrationState(dam, now, lake);
  const commonAt = sharedObservationAt([pool, release, turbine, spillway]);
  const state = generationNow(dam, now);
  const status = generationStatusLabel(state);
  const rack = state.kind === 'generating' ? generatorRack(state.turbineCfs, dam.generationReference) : null;
  const percent = state.kind === 'generating' ? generationPercentLabel(state.fraction) : null;
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const root = useRef<HTMLElement>(null);
  const triggers = useRef<Partial<Record<Detail, HTMLButtonElement | null>>>({});
  const panelId = useId();
  const moving = view.releaseActive && !paused && reducedMotion === false && visible && pageVisible;
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  const closeDetail = () => {
    if (detail) triggers.current[detail]?.focus();
    setDetail(null);
  };

  return <section ref={root} className="dam-water-root" aria-label="Reported water release" data-dam-water-illustration data-motion={moving ? 'running' : 'paused'} data-level-motion={view.poolFresh && reducedMotion === false && !paused && visible && pageVisible ? 'allowed' : 'off'} onKeyDown={event => { if (detail && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeDetail(); } }}>
    <div className="dam-water-readings">
      <div className="dam-water-level">
        <p className="dam-water-label">Lake level</p>
        <p className={`dam-water-level-value ${outdated(pool, now) ? 'opacity-70' : ''}`}>{pool.value.toFixed(2)} <span>ft</span></p>
        {outdated(pool, now) && <p className="dam-water-outdated">Outdated lake reading</p>}
        {view.change24hFt !== undefined && <LakeMovement delta={view.change24hFt} hours={24} />}
        {view.highWaterContext && <p data-high-water-context className="dam-water-note">{view.highWaterContext}</p>}
        {floodPool && <div data-flood-pool className="dam-water-note">
          <p className={outdated(floodPool, now) ? 'opacity-70' : ''}>{floodPool.value.toFixed(0)}% flood pool</p>
          <ReadingNote metric={floodPool} now={now} showTime={floodPool.at !== pool.at} />
        </div>}
        {pool.dailyMean && <p className="dam-water-note">Daily average</p>}
        {!commonAt && <ReadingTime at={pool.at} now={now} className="" />}
      </div>
      <div className="dam-water-release">
        <h2 className="dam-water-label">Water release</h2>
        <p className={`dam-water-release-value ${outdated(release, now) ? 'opacity-60' : ''}`} data-total-release>{Math.round(release.value).toLocaleString('en-US')} <span>cfs</span></p>
        {outdated(release, now) && <p className="dam-water-outdated" data-release-outdated>Outdated release reading</p>}
        <p className="dam-water-note">{release.dailyMean ? 'Total release · Daily average' : 'Total water leaving the dam'}</p>
        {!commonAt && <ReadingTime at={release.at} now={now} className="" />}
      </div>
    </div>
    <span className="sr-only" data-generation-summary>{generationVoiceOver(state, dam.generationReference)}</span>

    <figure className="dam-water-figure">
      <div className="dam-water-scene">
        <DamWaterScene surfaceY={view.surfaceY} turbine={view.turbineActive} spillway={view.spillwayActive} release={view.releaseActive} />
      </div>
      <figcaption className="dam-water-caption">
        {view.seasonalFt !== null && <span className="dam-water-reference-label">Seasonal pool <strong>{view.seasonalFt.toFixed(1)} ft</strong></span>}
        <span>Illustration not to scale</span>
      </figcaption>
    </figure>

    <div className="dam-water-explore" aria-label="Explore dam readings">
      {areas.map(area => <Button key={area.id} ref={el => { triggers.current[area.id] = el; }} variant="outline" size="sm" className="dam-water-hotspot" aria-expanded={detail === area.id} aria-controls={panelId} onClick={() => setDetail(detail === area.id ? null : area.id)}>
        {area.label}<ChevronDown size={14} aria-hidden="true" />
      </Button>)}
    </div>
    <div id={panelId} hidden={!detail} role="region" aria-labelledby={`${panelId}-heading`} className="dam-water-detail-panel">
      {detail && <>
        <div className="dam-water-panel-heading"><h3 id={`${panelId}-heading`}>{detail === 'lake' ? 'Lake readings' : detail === 'turbines' ? 'Generation details' : 'Below the dam'}</h3><Button variant="icon" className="min-h-11 min-w-11" onClick={closeDetail} aria-label="Close reading details"><X size={18} aria-hidden="true" /></Button></div>
        {detail === 'lake' && <>
          {!view.highWaterContext && <p className="dam-water-note">{lakePoolPositionSentence({ slug: 'table-rock', pool: { valueFt: pool.value, at: pool.at, staleness: pool.staleness } })}</p>}
          <DetailReading label="Inflow" metric={dam.metrics.inflow} now={now} format={cfs} />
          <p className="dam-water-note">The illustration marks the Corps&apos; seasonal pool. Elevations use NGVD29.</p>
        </>}
        {detail === 'turbines' && <>
          {status && <p className="font-semibold">{status}</p>}
          {rack && <div className="dam-water-rack"><DamGeneratorRack rack={rack} compact />{percent && <p>~{percent} {FULL_GENERATION_SHORT_LABEL}</p>}</div>}
          {rack && <p className="dam-water-note">{RACK_ESTIMATE_SHORT}</p>}
          {state.kind === 'generating' && state.fraction !== null && state.fraction > 1 && <p className="dam-water-note">{ABOVE_FULL_GENERATION_LABEL}</p>}
          <p className="dam-water-note">The wheel shows reported generation. Its speed does not represent turbine speed.</p>
        </>}
        {detail === 'downstream' && <><div className="dam-water-detail-readings">
          <DetailReading label="River level" metric={dam.metrics.tailwaterElevation} now={now} format={value => `${value.toFixed(2)} ft`} note={dam.metrics.tailwaterElevation && tailwaterMovementSentence(dam.metrics.tailwaterElevation, now)} />
          <DetailReading label="Water temperature" metric={dam.metrics.tailwaterTempF} now={now} format={value => `${value.toFixed(1)} °F`} />
        </div>{dam.tailwaterFishery && <p className="dam-water-note">{dam.tailwaterFishery === 'trout' ? 'Trout fishery · cold year-round, deep release' : 'Warmwater fishery · bass, crappie, catfish'}</p>}</>}
      </>}
    </div>

    <div className="dam-water-breakdown">
      <div><span>Through turbines</span>{' '}<strong className={turbine && outdated(turbine, now) ? 'opacity-70' : ''}>{turbine ? cfs(turbine.value) : 'Unavailable'}</strong>
        {turbine && (!commonAt || turbine.dailyMean || outdated(turbine, now)) && <ReadingNote metric={turbine} now={now} showTime={!commonAt} />}
      </div>
      <div><span>Spillway</span>{' '}<strong className={spillway && outdated(spillway, now) ? 'opacity-70' : ''}>{spillway ? cfs(spillway.value) : 'Unavailable'}</strong>
        {spillway && (!commonAt || spillway.dailyMean || outdated(spillway, now)) && <ReadingNote metric={spillway} now={now} showTime={!commonAt} />}
      </div>
      <Button variant="ghost" size="sm" className="dam-water-motion-toggle" aria-label={reducedMotion || !view.releaseActive ? 'Motion off' : paused ? 'Play motion' : 'Pause motion'} disabled={!view.releaseActive || reducedMotion !== false} onClick={() => setPaused(!paused)}>
        {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}{reducedMotion || !view.releaseActive ? 'Off' : paused ? 'Play' : 'Pause'}
      </Button>
    </div>
    <div className="dam-water-source">{source}{commonAt && <ReadingTime at={commonAt} now={now} className="" />}</div>
  </section>;
}
