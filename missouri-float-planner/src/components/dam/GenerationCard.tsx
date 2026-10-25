import { readingStaleness, relativeAge } from '@shared/dam-schedule-copy';
import type { DamSnapshot } from '@/lib/data/dams';
import { generationReferenceCitation, RACK_ESTIMATE_NOTE } from '@shared/dam-generation';
import DamGenerationHero from './DamGenerationHero';
import GenerationSchedule from './GenerationSchedule';
import DamInfoTip from './DamInfoTip';
import Card from '@/components/ui/Card';

export type ScheduleAvailability = { title: string; detail: string };

export default function GenerationCard({ dam, now, availability }: {
  dam: DamSnapshot;
  now: number;
  availability: ScheduleAvailability;
}) {
  const hasSchedule = dam.schedule.length > 0;
  const release = dam.metrics.release;
  const hasObserved = dam.hasTurbines || Boolean(release);
  return (
    <Card as="section" variant="framed">
      <div className="flex items-center justify-between gap-3 border-b border-primary-700 bg-secondary-50 px-5 py-1 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-wider text-primary-800">{dam.hasTurbines ? 'Generation overview' : 'Release overview'}</p>
        <DamInfoTip title="Generation and schedule">
          {dam.generationReference && <p>{generationReferenceCitation(dam.generationReference)}. {RACK_ESTIMATE_NOTE}</p>}
          {dam.nameplate && <p>{dam.nameplate.units} generating units · {dam.nameplate.megawatts} MW nameplate capacity. Nameplate capacity and the published scheduling reference can differ.</p>}
          {hasSchedule && <>
            <p>Southwestern Power Administration posts schedules each afternoon. Its “hour ending” labels describe the preceding hour; Eddy displays the start of each interval.</p>
            <p>Every day uses the same chart scale{dam.generationReference ? `: ${dam.generationReference.schedulingCapacityMw} MW of scheduling capacity` : ''}, so different days can be compared.</p>
          </>}
          <p>Times describe the dam. Water arrives downstream later; the delay depends on location. Schedules can change without notice as power demand, inflow, outages and operating needs change.</p>
          <p>Check posted warnings and local operating information before entering the water below a dam. No generation scheduled does not mean no water is being released.</p>
        </DamInfoTip>
      </div>
      <div className={hasObserved ? 'dam-generation-layout' : undefined}>
        {hasObserved && <div className="dam-observed p-5 sm:p-6">{dam.hasTurbines ? <DamGenerationHero dam={dam} now={now} /> : release && <div>
          <h2 className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary-200">
            {release.dailyMean ? 'Release at dam · Daily average' : 'Release at dam'}
            {!release.dailyMean && readingStaleness(release.at, now) !== 'fresh' && <span className="rounded-full bg-accent-100 px-2 py-0.5 normal-case tracking-normal text-accent-900">Outdated reading</span>}
          </h2>
          <p className={`mt-4 font-mono text-4xl text-white${readingStaleness(release.at, now) === 'fresh' ? '' : ' opacity-70'}`}>{Math.round(release.value).toLocaleString()} <span className="text-base text-primary-200">cfs</span></p>
          <p className="mt-2 text-xs text-primary-200">{relativeAge(release.at, now) ? `Last reading ${relativeAge(release.at, now)}` : 'Reading time unavailable'}</p>
        </div>}</div>}
        <div className="min-w-0 p-5 sm:p-6">
          {hasSchedule ? <GenerationSchedule schedule={dam.schedule} reference={dam.generationReference} now={now} /> : (
            <div className="flex min-h-28 flex-col justify-center">
              <h2 className="text-base font-bold text-neutral-900">{availability.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{availability.detail}</p>
              {dam.infoPhone && <a className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary-700 underline underline-offset-4" href={`tel:${dam.infoPhone.replace(/\D/g, '')}`}>Recorded release line · {dam.infoPhone}</a>}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
