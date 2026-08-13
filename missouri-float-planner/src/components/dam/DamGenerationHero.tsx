// src/components/dam/DamGenerationHero.tsx
// The dominant block on /dams/[damId]: what the powerhouse is doing right now.
//
// Server component — everything here is read-through data with no interaction.
//
// ── The four questions, in order ───────────────────────────────────────────
//   1. Is the powerhouse generating now?      the status line
//   2. How much water is through the turbines? the cfs figure
//   3. How large is that for THIS project?     the rack and the bar
//   4. When does generation change?            the now → next sentence
// Everything else on the page is secondary and lives below it.
//
// ── Why a generator rack and not just a percentage ─────────────────────────
// "Six generators" is the unit anglers already think in, and it makes a
// powerhouse feel like a powerhouse rather than another gauge. The honesty
// problem it creates is handled by drawing the last active cell PARTIALLY
// filled: 19,130 cfs is 5.8 units' worth of full-load discharge, and six
// identical lit icons would claim a unit count the Corps does not publish. The
// caveat under it is a reminder, not a correction.
//
// ── Colour discipline ──────────────────────────────────────────────────────
// One hue, the `primary` teal ramp, with magnitude carried by fill and height.
// No green/yellow/orange/red progression: a capacity ramp in condition colours
// reads as a verdict on the river, and this block issues none.

import { Zap, Clock } from 'lucide-react';
import type { DamSnapshot } from '@/lib/data/dams';
import { relativeAge, SCHEDULE_CHANGE_NOTE } from '@shared/dam-schedule-copy';
import {
  fullGenerationReferenceLabel,
  generationNow,
  generationPercentLabel,
  generationStatusLabel,
  generationVoiceOver,
  generatorEquivalentPhrase,
  generatorRack,
  nowNextClauses,
  releaseComparison,
  OTHER_RELEASE_NOTE,
  RACK_ESTIMATE_NOTE,
} from '@shared/dam-generation';

function cfs(value: number): string {
  return `${Math.round(value).toLocaleString()} cfs`;
}

/**
 * One generator, filled to `fill`.
 *
 * The partial fill is a gradient stop rather than a nested element so a cell at
 * 0.8 draws as one shape rather than as a ring with something inside it — at
 * 28px the second reading is "a different kind of unit", not "a unit at
 * part load".
 */
function GeneratorCell({ fill }: { fill: number }) {
  const pct = Math.round(fill * 100);
  return (
    <span
      className="inline-block h-7 w-7 rounded-full border-2 border-primary-700"
      style={{
        background: `linear-gradient(to top, var(--color-primary-700) ${pct}%, var(--color-primary-50) ${pct}%)`,
      }}
    />
  );
}

export default function DamGenerationHero({ dam }: { dam: DamSnapshot }) {
  const state = generationNow(dam);
  const status = generationStatusLabel(state);

  // A flood-control project has no powerhouse to report on, and a hero that
  // said anything at all here would invent one. The page's own no-powerhouse
  // copy covers it instead.
  if (!status) return null;

  const ref = dam.generationReference;
  const rack = state.kind === 'generating' ? generatorRack(state.turbineCfs, ref) : null;
  const equivalentPhrase =
    state.kind === 'generating' ? generatorEquivalentPhrase(state.equivalents, ref) : null;
  const percent = state.kind === 'generating' ? generationPercentLabel(state.fraction) : null;
  const clauses = nowNextClauses(state, dam.schedule, ref);
  const comparison = releaseComparison(dam.metrics.generationFlow, dam.metrics.release, ref);
  const voiceOver = generationVoiceOver(state, ref);

  const generating = state.kind === 'generating';
  const observedAt = state.kind === 'unavailable' ? null : relativeAge(state.observedAt);
  const dim = state.kind !== 'unavailable' && state.age === 'stale';

  return (
    <section className="rounded-xl border-2 border-t-4 border-primary-800 bg-white p-5 shadow-[4px_4px_0_var(--color-primary-200)]">
      <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary-800">
        <Zap className="h-3.5 w-3.5" aria-hidden="true" />
        {status}
      </h2>

      {/* The rack, the number, and the bar are one figure. It is hidden from
          assistive technology and carries the same facts as a sentence — a
          drawing that exists only for people who can see it is half a feature. */}
      <div className={dim ? 'opacity-60' : undefined}>
        {rack && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-hidden="true">
            {rack.cells.map((cell, i) => (
              <GeneratorCell key={i} fill={cell.fill} />
            ))}
          </div>
        )}

        {equivalentPhrase && (
          <p className="mt-3 text-2xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
            {equivalentPhrase}
          </p>
        )}

        {state.kind !== 'unavailable' && (
          <p className="mt-1 text-lg font-bold tabular-nums text-neutral-900">
            {cfs(state.turbineCfs)}
            <span className="ml-1.5 text-sm font-medium text-neutral-500">through the turbines</span>
          </p>
        )}
        {observedAt && <p className="text-xs text-neutral-500">Updated {observedAt}</p>}

        {/* The capacity bar. Single hue, and the label names the exact
            reference — "31% of published full-generation discharge", never
            "31% power", which describes something the number is not. */}
        {generating && percent && ref && state.fraction !== null && (
          <div className="mt-4" aria-hidden="true">
            <div className="h-3 w-full overflow-hidden rounded-full bg-primary-100">
              <div
                className="h-full rounded-full bg-primary-700"
                style={{ width: `${Math.min(100, Math.round(state.fraction * 100))}%` }}
              />
            </div>
            <p className="mt-1 text-sm text-neutral-600">
              <span className="font-bold tabular-nums text-neutral-900">{percent}</span>{' '}
              {fullGenerationReferenceLabel(ref)}
              {/* Above the reference is real information — spill, a different
                  measurement basis, or a reference that has drifted since the
                  rehabilitation project. The bar caps; the sentence does not. */}
              {state.fraction > 1 && ' — above the published reference'}
            </p>
          </div>
        )}
      </div>

      {voiceOver && <p className="sr-only">{voiceOver}</p>}

      {rack && <p className="mt-2 text-xs text-neutral-500">{RACK_ESTIMATE_NOTE}</p>}

      {/* Turbine flow and total release as two labelled facts. The difference
          is only ever named when releaseComparison says every rule passed — see
          that function for why a bare subtraction is a claim someone acts on. */}
      {dam.metrics.release && (
        <div className="mt-4 border-t border-neutral-200 pt-3">
          <p className="text-sm text-neutral-600">
            <span className="font-medium text-neutral-700">
              {dam.metrics.release.dailyMean ? 'Total release at dam (daily avg)' : 'Total release at dam'}
            </span>{' '}
            <span className="font-bold tabular-nums text-neutral-900">
              {cfs(dam.metrics.release.value)}
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

      {/* Now and next. Two clauses, two weights: the first is a measurement,
          the second is SWPA's plan, and they can honestly disagree. The note
          carries location and downstream lag and is not decoration. */}
      <div className="mt-4 border-t border-neutral-200 pt-3">
        <p className="text-sm font-bold text-neutral-900">{clauses.observed}</p>
        {clauses.scheduled && (
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-medium text-primary-800">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {clauses.scheduled}
          </p>
        )}
        {clauses.scheduled && <p className="text-xs text-neutral-500">{SCHEDULE_CHANGE_NOTE}</p>}
      </div>
    </section>
  );
}
