// The observed half of the generation card. Plans stay in GenerationSchedule.
// Generator cells estimate full-load equivalents; they are not unit status.
// Total release retains its own timestamp and is never inferred from turbine flow.

import { Zap } from 'lucide-react';
import type { DamSnapshot } from '@/lib/data/dams';
import DamGeneratorRack from './DamGeneratorRack';
import {
  relativeAge,
  readingStaleness,
} from '@shared/dam-schedule-copy';
import {
  FULL_GENERATION_SHORT_LABEL,
  generationNow,
  generationPercentLabel,
  generationStatusLabel,
  generationVoiceOver,
  generatorRack,
  releaseComparison,
  speaksForNow,
  OTHER_RELEASE_NOTE,
  RACK_ESTIMATE_SHORT,
} from '@shared/dam-generation';

function cfs(value: number): string {
  return `${Math.round(value).toLocaleString()} cfs`;
}

export default function DamGenerationHero({ dam, now }: { dam: DamSnapshot; now: number }) {
  const state = generationNow(dam, now);
  const status = generationStatusLabel(state);

  // A flood-control project has no powerhouse to report on, and a hero that
  // said anything at all here would invent one. The page's own no-powerhouse
  // copy covers it instead.
  if (!status) return null;

  const ref = dam.generationReference;
  const rack = state.kind === 'generating' ? generatorRack(state.turbineCfs, ref) : null;
  const percent = state.kind === 'generating' ? generationPercentLabel(state.fraction) : null;
  const comparison = releaseComparison(dam.metrics.generationFlow, dam.metrics.release, ref, {
    declared: dam.releaseExcludesGeneration, now,
  });
  const voiceOver = generationVoiceOver(state, ref);

  const observedAt = state.kind === 'unavailable' ? null : relativeAge(state.observedAt, now);
  // The same rule the phrasing uses, so a reading that stopped saying "now"
  // also stops looking current. It was gated on `stale` while the copy is
  // gated on `fresh`, so a four-hour-old reading lost the present tense and
  // kept full emphasis.
  const dim = state.kind !== 'unavailable' && !speaksForNow(state.age);

  return (
    <section aria-label="Observed generation" className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-widest text-primary-200">Observed at the dam</p>
      <h2 className="mt-4 flex items-center gap-2 text-base font-semibold text-white">
        <Zap className="size-4 shrink-0 text-primary-200" aria-hidden="true" /> {status}
      </h2>

      {/* Flow leads; the rack adds scale against the published reference.
          Its decorative cells are hidden from assistive technology. */}
      <div className={dim ? 'opacity-80' : undefined}>
        {state.kind !== 'unavailable' && (
          <p className="mt-4 font-mono text-[clamp(2rem,4vw,3rem)] font-medium leading-tight tracking-tight text-white">
            {Math.round(state.turbineCfs).toLocaleString()} <span className="text-base tracking-normal text-primary-200">cfs</span>
            <span className="mt-1 block font-sans text-sm font-normal tracking-normal text-primary-100">through the turbines</span>
          </p>
        )}
        {observedAt && <p className="mt-2 text-xs text-primary-200">Last reading {observedAt}</p>}
        {rack && <div className="mt-6 flex flex-wrap items-center gap-3">
          <DamGeneratorRack rack={rack} inverse />
          {percent && ref && state.kind === 'generating' && <p className="text-sm font-bold text-white">
            {percent} <span className="font-normal text-primary-100">{FULL_GENERATION_SHORT_LABEL}</span>
          </p>}
        </div>}
        {rack && <p className="mt-2 text-xs text-primary-200">{RACK_ESTIMATE_SHORT}</p>}
        {state.kind === 'generating' && state.fraction !== null && state.fraction > 1 && <p className="mt-1 text-xs text-primary-100">Above the published reference</p>}
      </div>

      {voiceOver && <p className="sr-only">{voiceOver}</p>}

      {dam.metrics.release && (
        <div className="mt-6 border-t border-primary-600 pt-5">
          {/* The age is not optional. Turbine flow above carries one, and two
              adjacent measurements with different ages look synchronised when
              only one of them is dated — which is exactly the impression that
              makes a reader trust a difference between them. */}
          <p
            className={
              readingStaleness(dam.metrics.release.at, now) === 'fresh'
                ? 'text-sm text-primary-100'
                : 'text-sm text-primary-100 opacity-80'
            }
          >
            <span className="block text-xs font-medium text-primary-200">
              {dam.metrics.release.dailyMean ? 'Total release at dam (daily avg)' : 'Total release at dam'}
            </span>{' '}
            <span className="mt-1 block font-mono text-xl text-white">
              {cfs(dam.metrics.release.value)}
            </span>
            <span className="mt-1 block text-xs text-primary-200">
              {relativeAge(dam.metrics.release.at, now)}
            </span>
          </p>
          {comparison.kind === 'other-release' && (
            <>
              <p className="mt-4 text-sm text-primary-100">
                <span className="font-medium">Other release</span>{' '}
                <span className="font-mono text-white">
                  {cfs(comparison.otherCfs)}
                </span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-primary-200">{OTHER_RELEASE_NOTE}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
