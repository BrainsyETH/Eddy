// Total release leads. Turbine generation remains a separate observation,
// with its own timestamp and a rack based only on measured turbine flow.
import { Zap } from 'lucide-react';
import type { DamSnapshot } from '@/lib/data/dams';
import { EddyIcon } from '@/components/ui/EddyIcon';
import DamGeneratorRack from './DamGeneratorRack';
import { relativeAge, readingStaleness } from '@shared/dam-schedule-copy';
import {
  FULL_GENERATION_SHORT_LABEL,
  generationNow,
  generationPercentLabel,
  generationStatusLabel,
  generationVoiceOver,
  generatorRack,
  releaseComparison,
  releaseRepeatsTurbineFlow,
  speaksForNow,
  spillwayRelease,
  spillwayReleaseLabel,
  ABOVE_FULL_GENERATION_LABEL,
} from '@shared/dam-generation';

const observationClock = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short',
});

function ReadingTime({ at, now }: { at: string; now: number }) {
  const age = relativeAge(at, now);
  return <p className="mt-2 text-xs leading-5 text-neutral-600">
    {age ? <>Last reading <time dateTime={at}>{observationClock.format(new Date(at))}</time> · {age}</> : 'Reading time unavailable'}
  </p>;
}

export default function DamGenerationHero({ dam, now }: { dam: DamSnapshot; now: number }) {
  const state = generationNow(dam, now);
  const status = generationStatusLabel(state);
  const release = dam.metrics.release;
  const ref = dam.generationReference;
  const rack = state.kind === 'generating' ? generatorRack(state.turbineCfs, ref) : null;
  const percent = state.kind === 'generating' ? generationPercentLabel(state.fraction) : null;
  const comparison = releaseComparison(dam.metrics.generationFlow, release, ref, {
    declared: dam.releaseExcludesGeneration, now,
  });
  const voiceOver = generationVoiceOver(state, ref);
  const spill = spillwayRelease(dam, now);
  const repeatsRelease = releaseRepeatsTurbineFlow(dam.metrics.generationFlow, release);
  // Equal values alone must not hide an older turbine observation.
  const sameTime = state.kind !== 'unavailable' && release && !release.dailyMean &&
    Date.parse(state.observedAt) === Date.parse(release.at);
  const dimTurbine = state.kind !== 'unavailable' && !speaksForNow(state.age);
  const dimRelease = release && readingStaleness(release.at, now) !== 'fresh';

  return (
    <section aria-label="Reported water release" className="min-w-0">
      <h2 className="flex items-center gap-2 pr-8 text-base font-semibold text-primary-900 sm:pr-0">
        <EddyIcon name="release" size={28} /> Latest reported release
      </h2>
      {release ? <>
        <p data-total-release className={`mt-3 flex flex-wrap items-baseline gap-x-2 font-mono text-[clamp(2rem,4vw,3rem)] font-medium leading-tight tracking-tight text-primary-900${dimRelease ? ' opacity-70' : ''}`}>
          {Math.round(release.value).toLocaleString()} <span className="text-base tracking-normal text-neutral-600">cfs</span>
        </p>
        <p className="mt-1 text-sm text-neutral-700">{release.dailyMean ? 'Total release at dam · Daily average' : 'Total water released at the dam'}</p>
        <ReadingTime at={release.at} now={now} />
        {dimRelease && !release.dailyMean && <p className="mt-1 text-xs font-semibold text-accent-900">Outdated release reading</p>}
      </> : <p className="mt-3 text-sm text-neutral-700">Total release unavailable.</p>}

      {status && <div className="mt-4 border-t border-secondary-300 pt-4">
        <h3 className="flex items-start gap-2 text-sm font-semibold leading-5 text-primary-900">
          <Zap className="mt-0.5 size-4 shrink-0 text-primary-700" aria-hidden="true" /> {status}
        </h3>
        {state.kind !== 'unavailable' && <div className={dimTurbine ? 'opacity-70' : undefined}>
          {repeatsRelease ? <p className="mt-1 text-xs text-neutral-600">Turbine flow matches total release.</p> : (
            <p className="mt-2 text-sm text-neutral-700">Through the turbines <span className="font-mono font-medium text-primary-900">{Math.round(state.turbineCfs).toLocaleString()} cfs</span></p>
          )}
          {!sameTime && <ReadingTime at={state.observedAt} now={now} />}
          {dimTurbine && <p className="mt-1 text-xs font-semibold text-accent-900">Outdated turbine reading</p>}
          {rack && <div className="mt-3 flex flex-wrap items-center gap-3">
            <DamGeneratorRack rack={rack} compact />
            {percent && <p className="text-sm font-bold text-primary-900">~{percent} <span className="font-normal text-neutral-700">{FULL_GENERATION_SHORT_LABEL}</span></p>}
          </div>}
          {rack && state.kind === 'generating' && state.fraction !== null && state.fraction > 1 && <p className="mt-2 text-xs text-neutral-600">{ABOVE_FULL_GENERATION_LABEL}</p>}
        </div>}
        {voiceOver && <p className="sr-only">{voiceOver}</p>}
      </div>}

      {spill && <p className="mt-4 rounded-lg border border-accent-500 bg-accent-50 px-3 py-2 text-sm font-semibold text-accent-900">
        {spillwayReleaseLabel(spill)}
        <span className="block text-xs font-normal text-neutral-700">Through the spillway gates · {relativeAge(spill.observedAt, now)}</span>
      </p>}
      {comparison.kind === 'other-release' && <p className="mt-3 text-sm text-neutral-700">
        <span className="font-medium">Not through turbines</span>{' '}
        <span className="font-mono text-primary-900">{Math.round(comparison.otherCfs).toLocaleString()} cfs</span>
      </p>}
    </section>
  );
}
