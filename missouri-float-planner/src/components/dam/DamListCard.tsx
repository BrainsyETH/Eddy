import { ChevronRight, Clock, Thermometer, Waves, Ruler, Zap } from 'lucide-react';
import type { DamMetricValue, DamSnapshot } from '@/lib/data/dams';
import { relativeAge, readingStaleness, tailwaterMovementSentence } from '@shared/dam-schedule-copy';
import {
  FULL_GENERATION_SHORT_LABEL, RACK_ESTIMATE_SHORT, ABOVE_FULL_GENERATION_LABEL, generationNow,
  generationPercentLabel, generationStatusLabel, generationVoiceOver,
  generatorRack, nowNextClauses, scheduledClauseProvenance, speaksForNow,
} from '@shared/dam-generation';
import DamGeneratorRack from './DamGeneratorRack';

function Reading({ label, value, metric, now, icon, detail }: {
  label: string; value: string; metric: DamMetricValue; now: number;
  icon: React.ReactNode; detail?: string | null;
}) {
  return (
    <div className={readingStaleness(metric.at, now) === 'fresh' ? undefined : 'opacity-60'}>
      <dt className="flex items-center gap-1 text-xs text-neutral-500">{icon}{label}</dt>
      <dd className="mt-1 text-base font-bold tabular-nums text-neutral-900 sm:text-lg">{value}</dd>
      <dd className="text-xs text-neutral-500">{detail ?? relativeAge(metric.at, now)}</dd>
    </div>
  );
}

/** A non-interactive preview: its parent link owns the whole tap target. */
export default function DamListCard({ dam, now }: { dam: DamSnapshot; now: number }) {
  const state = generationNow(dam, now);
  const status = generationStatusLabel(state);
  const rack = state.kind === 'generating' ? generatorRack(state.turbineCfs, dam.generationReference) : null;
  const percent = state.kind === 'generating' ? generationPercentLabel(state.fraction) : null;
  const scheduled = dam.hasTurbines ? nowNextClauses(state, dam.schedule, dam.generationReference, now).scheduled : null;
  const scheduleAge = scheduled ? scheduledClauseProvenance(dam.schedule, dam.generationReference, now) : null;
  const flow = dam.metrics.release ?? dam.metrics.generationFlow;
  const temperature = dam.metrics.tailwaterTempF;
  const level = dam.metrics.tailwaterElevation;
  const dim = state.kind !== 'unavailable' && !speaksForNow(state.age);

  return (
    <article className="h-full min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-colors group-hover:border-primary-400 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{dam.name}</h3>
          {dam.lakeName && <p className="mt-0.5 text-sm text-neutral-500">{dam.lakeName}</p>}
        </div>
        <ChevronRight className="size-5 shrink-0 text-primary-700" aria-hidden="true" />
      </div>

      {status && (
        <div className={`mt-4 rounded-xl bg-primary-50/60 p-3 ${dim ? 'opacity-60' : ''}`}>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-primary-800"><Zap className="size-4 shrink-0" aria-hidden="true" />{status}</p>
          {rack && percent && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <DamGeneratorRack rack={rack} compact />
                <p className="text-sm text-neutral-600"><strong className="text-lg tabular-nums text-primary-900">{percent}</strong> {FULL_GENERATION_SHORT_LABEL}</p>
              </div>
              {rack.overflow && <p className="mt-1 text-xs text-neutral-500">{ABOVE_FULL_GENERATION_LABEL}</p>}
              <p className="sr-only">{generationVoiceOver(state, dam.generationReference)}</p>
            </>
          )}
          {state.kind !== 'unavailable' && <p className="mt-1 text-xs text-neutral-500">{rack && percent ? `${RACK_ESTIMATE_SHORT} · ` : 'Last reading '}{relativeAge(state.observedAt, now)}</p>}
        </div>
      )}

      {(flow || temperature || level) && (
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 min-[360px]:grid-cols-3">
          {flow && <Reading label={`${dam.metrics.release ? 'Release' : 'Turbine flow'}${flow.dailyMean ? ' (daily avg)' : ''}`} value={`${Math.round(flow.value).toLocaleString()} cfs`} metric={flow} now={now} icon={<Waves className="size-3.5" aria-hidden="true" />} />}
          {temperature && <Reading label="Water temp" value={`${temperature.value.toFixed(1)} °F`} metric={temperature} now={now} icon={<Thermometer className="size-3.5" aria-hidden="true" />} />}
          {level && <Reading label="Below-dam elevation" value={`${level.value.toFixed(2)} ft`} metric={level} now={now} detail={tailwaterMovementSentence(level, now)} icon={<Ruler className="size-3.5" aria-hidden="true" />} />}
        </dl>
      )}

      {scheduled && (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <p className="flex items-start gap-1.5 text-sm text-primary-800"><Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{scheduled}</p>
          {scheduleAge && <p className="mt-1 text-xs text-neutral-500">{scheduleAge}</p>}
        </div>
      )}
      {!status && !flow && !temperature && !level && <p className="mt-4 text-sm text-neutral-500">Readings currently unavailable.</p>}
    </article>
  );
}
