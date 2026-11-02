// src/components/dam/DamCardParts.tsx
// The body of a dam card, in parts, so every surface that summarises a dam
// draws the same thing: the directory and homepage card (DamListCard) and a
// tailwater river's reading card (RiverDamPanel). A reader who learns the
// readings band and the hourly bars on one learns them on the other.

import type { DamMetricValue, DamSnapshot } from '@/lib/data/dams';
import { relativeAgeShort, readingStaleness } from '@shared/dam-schedule-copy';
import DamInfoTip from './DamInfoTip';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';

/**
 * A MEASURED reading. Its age lives in the band's one corner line — see
 * readingAgeLine — so each value stays a clean label/number pair.
 *
 * The icon sits inside the <dt> (a <dl> group may hold only dt/dd) and is
 * pulled into a left gutter, so it aligns beside the whole label/value group.
 */
function Reading({ label, value, unit, metric, now, icon }: {
  label: string; value: string | null; unit: string; metric?: DamMetricValue; now: number;
  icon: EddyIconName;
}) {
  return (
    <div className="relative min-w-0 pl-9">
      <dt className="text-[13px] font-medium leading-4 text-neutral-700">
        <EddyIcon name={icon} size={28} className="absolute left-0 top-0.5" />
        {label}
      </dt>
      <dd className={`mt-1 flex flex-wrap items-baseline gap-x-1 text-primary-900 ${metric && readingStaleness(metric.at, now) !== 'fresh' ? 'opacity-60' : ''}`}>
        {value === null ? <span className="text-sm">Unavailable</span> : <>
          <span className="font-mono text-2xl font-medium leading-7 tabular-nums tracking-tight sm:text-[26px]">{value}</span>{' '}
          <span className="text-[13px] text-neutral-500">{unit}</span>
        </>}
      </dd>
    </div>
  );
}

/**
 * ONE age line for the readings band: "Measured 53 min ago" when both were
 * observed in the same minute (or only one exists), otherwise
 * "Release 18 min ago · Temp 1 hr ago". Still one line, but never one age for
 * two observations an hour apart, which would date one of them wrongly.
 */
function readingAgeLine(release: DamMetricValue | undefined, temperature: DamMetricValue | undefined, now: number): string | null {
  const releaseAge = release ? relativeAgeShort(release.at, now) : null;
  const temperatureAge = temperature ? relativeAgeShort(temperature.at, now) : null;
  if (!releaseAge || !temperatureAge) {
    const only = releaseAge ?? temperatureAge;
    return only ? `Measured ${only}` : null;
  }
  const minute = (iso: string) => Math.floor(Date.parse(iso) / 60_000);
  return minute(release!.at) === minute(temperature!.at)
    ? `Measured ${releaseAge}`
    : `Release ${releaseAge} · Temp ${temperatureAge}`;
}

/** Release and water temperature at the dam, with one age line. */
export function DamReadings({ dam, now }: { dam: DamSnapshot; now: number }) {
  const flow = dam.metrics.release;
  const temperature = dam.metrics.tailwaterTempF;
  const measured = readingAgeLine(flow, temperature, now);
  return (
    <div className="mx-3 rounded-xl bg-secondary-50 px-3 py-3 sm:mx-4 sm:px-4">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
        <Reading label={`Release${flow?.dailyMean ? ' (daily avg)' : ''}`} value={flow ? Math.round(flow.value).toLocaleString() : null} unit="cfs" metric={flow} now={now} icon="release" />
        <Reading label="Water temp" value={temperature ? temperature.value.toFixed(1) : null} unit="°F" metric={temperature} now={now} icon="waterTemperature" />
      </dl>
      {measured && <p data-reading-age className="mt-1.5 text-right text-xs leading-4 text-neutral-600">{measured}</p>}
    </div>
  );
}

/** The ⓘ beside a card's schedule heading. */
export function DamScheduleInfoTip({ dam }: { dam: DamSnapshot }) {
  return (
    <DamInfoTip title={`${dam.name} schedule`}>
      <p>All times are Central time at the dam. Schedules may change without notice.</p>
      <p>Teal bars show scheduled generation on the project’s full capacity scale, so a small release draws small. The coral line marks now. Select an hour for its details.</p>
      <p>Release and water temperature are measurements; their age is shown under them. The schedule is a plan, and the time Eddy last checked it is shown at the bottom of the card.</p>
    </DamInfoTip>
  );
}
