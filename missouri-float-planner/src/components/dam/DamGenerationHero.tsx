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
  spillwayRelease,
  spillwayReleaseLabel,
  ABOVE_FULL_GENERATION_LABEL,
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
  const spill = spillwayRelease(dam, now);

  const observedAt = state.kind === 'unavailable' ? null : relativeAge(state.observedAt, now);
  // The same rule the phrasing uses, so a reading that stopped saying "now"
  // also stops looking current. It was gated on `stale` while the copy is
  // gated on `fresh`, so a four-hour-old reading lost the present tense and
  // kept full emphasis.
  const dim = state.kind !== 'unavailable' && !speaksForNow(state.age);

  return (
    <section aria-label="Observed generation" className="min-w-0">
      <h2 className="flex flex-wrap items-center gap-2 pr-8 text-base font-semibold text-primary-900 sm:pr-0">
        <Zap className="size-4 shrink-0 text-accent-700" aria-hidden="true" /> {status}
        {dim && <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs font-bold text-accent-900">Outdated reading</span>}
      </h2>

      {/* Flow leads; the rack adds scale against the published reference.
          Its decorative cells are hidden from assistive technology. An old
          reading also says so in words beside the status. */}
      <div className={dim ? 'opacity-70' : undefined}>
        {state.kind !== 'unavailable' && (
          <p className="mt-3 font-mono text-[clamp(2rem,4vw,3rem)] font-medium leading-tight tracking-tight text-primary-900">
            {Math.round(state.turbineCfs).toLocaleString()} <span className="text-base tracking-normal text-neutral-600">cfs</span>
            <span className="mt-1 block font-sans text-sm font-normal tracking-normal text-neutral-700">through the turbines</span>
          </p>
        )}
        {observedAt && <p className="mt-2 text-xs text-neutral-600">Last reading {observedAt}</p>}
        {rack && <div className="mt-5 flex flex-wrap items-center gap-3">
          <DamGeneratorRack rack={rack} />
          {percent && ref && state.kind === 'generating' && <p className="text-sm font-bold text-primary-900">
            ~{percent} <span className="font-normal text-neutral-700">{FULL_GENERATION_SHORT_LABEL}</span>
          </p>}
        </div>}
        {rack && state.kind === 'generating' && state.fraction !== null && state.fraction > 1 && <p className="mt-2 text-xs text-neutral-600">{ABOVE_FULL_GENERATION_LABEL}</p>}
      </div>

      {voiceOver && <p className="sr-only">{voiceOver}</p>}

      {/* Read from the district's spillway series, never inferred from total
          flow: the gates can open well below full turbine capacity. */}
      {spill && (
        <p className="mt-4 rounded-lg border border-accent-500 bg-accent-50 px-3 py-2 text-sm font-semibold text-accent-900">
          {spillwayReleaseLabel(spill)}
          <span className="block text-xs font-normal text-neutral-700">
            Through the spillway gates · {relativeAge(spill.observedAt, now)}
          </span>
        </p>
      )}

      {dam.metrics.release && (
        <div className="mt-6 border-t border-secondary-300 pt-5">
          {/* The age is not optional. Turbine flow above carries one, and two
              adjacent measurements with different ages look synchronised when
              only one of them is dated — which is exactly the impression that
              makes a reader trust a difference between them. */}
          <p
            className={
              readingStaleness(dam.metrics.release.at, now) === 'fresh'
                ? 'text-sm text-neutral-700'
                : 'text-sm text-neutral-700 opacity-70'
            }
          >
            <span className="block text-xs font-medium text-neutral-600">
              {dam.metrics.release.dailyMean ? 'Total release at dam (daily avg)' : 'Total release at dam'}
            </span>{' '}
            <span className="mt-1 block font-mono text-xl text-primary-900">
              {cfs(dam.metrics.release.value)}
            </span>
            <span className="mt-1 block text-xs text-neutral-600">
              {relativeAge(dam.metrics.release.at, now)}
            </span>
          </p>
          {comparison.kind === 'other-release' && (
            <>
              <p className="mt-4 text-sm text-neutral-700">
                <span className="font-medium">Not through turbines</span>{' '}
                <span className="font-mono text-primary-900">
                  {cfs(comparison.otherCfs)}
                </span>
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
