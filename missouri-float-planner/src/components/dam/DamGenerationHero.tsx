// The observed half of the generation card. Plans stay in GenerationSchedule.
// Generator cells estimate full-load equivalents; they are not unit status.
// Total release retains its own timestamp and is never inferred from turbine flow.

import { Zap } from 'lucide-react';
import type { DamSnapshot } from '@/lib/data/dams';
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

function GeneratorCell({ fill }: { fill: number }) {
  const pct = Math.round(fill * 100);
  return (
    <span
      className="relative inline-block h-8 w-5 min-w-0 rounded-[3px] border-2 border-primary-700"
      style={{
        background: `linear-gradient(to top, var(--color-primary-700) ${pct}%, var(--color-primary-50) ${pct}%)`,
      }}
    >
      {/* The rotor channel. Decorative, and the only thing separating this from
          a plain bar chart of eight identical columns. */}
      <span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-primary-200/70" />
    </span>
  );
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
      <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary-800">
        <Zap className="h-3.5 w-3.5" aria-hidden="true" />
        {status}
      </h2>

      {/* The rack, the number, and the bar are one figure. It is hidden from
          assistive technology and carries the same facts as a sentence — a
          drawing that exists only for people who can see it is half a feature. */}
      <div className={dim ? 'opacity-60' : undefined}>
        {rack && (
          <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
            {rack.cells.map((cell, i) => (
              <GeneratorCell key={i} fill={cell.fill} />
            ))}
          </div>
        )}

        {percent && ref && state.kind === 'generating' && (
          <p className="mt-4 text-4xl font-bold tabular-nums tracking-tight text-neutral-900">
            {percent}
            <span className="mt-1 block text-sm font-medium tracking-normal text-neutral-600">{FULL_GENERATION_SHORT_LABEL}</span>
            {state.fraction !== null && state.fraction > 1 && <span className="mt-1 block text-xs font-medium text-accent-700">Above the published reference</span>}
          </p>
        )}
        {state.kind !== 'unavailable' && (
          <p className="mt-1 text-lg font-bold tabular-nums text-neutral-900">
            <span className="whitespace-nowrap">{cfs(state.turbineCfs)}</span>
            <span className="ml-1.5 text-sm font-medium text-neutral-500">through the turbines</span>
          </p>
        )}
        {observedAt && <p className="text-xs text-neutral-500">Last reading {observedAt}</p>}

        {rack && <p className="mt-2 text-xs text-neutral-500">{RACK_ESTIMATE_SHORT}</p>}

      </div>

      {voiceOver && <p className="sr-only">{voiceOver}</p>}

      {dam.metrics.release && (
        <div className="mt-4 border-t border-neutral-200 pt-3">
          {/* The age is not optional. Turbine flow above carries one, and two
              adjacent measurements with different ages look synchronised when
              only one of them is dated — which is exactly the impression that
              makes a reader trust a difference between them. */}
          <p
            className={
              readingStaleness(dam.metrics.release.at, now) === 'fresh'
                ? 'text-sm text-neutral-600'
                : 'text-sm text-neutral-600 opacity-60'
            }
          >
            <span className="font-medium text-neutral-700">
              {dam.metrics.release.dailyMean ? 'Total release at dam (daily avg)' : 'Total release at dam'}
            </span>{' '}
            <span className="font-bold tabular-nums text-neutral-900">
              {cfs(dam.metrics.release.value)}
            </span>
            <span className="ml-1.5 text-xs text-neutral-500">
              {relativeAge(dam.metrics.release.at, now)}
            </span>
          </p>
          {comparison.kind === 'other-release' && (
            <>
              <p className="mt-1 text-sm text-neutral-600">
                <span className="font-medium text-neutral-700">Other release</span>{' '}
                <span className="font-bold tabular-nums text-neutral-900">
                  {cfs(comparison.otherCfs)}
                </span>
              </p>
              <p className="text-xs text-neutral-500">{OTHER_RELEASE_NOTE}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
