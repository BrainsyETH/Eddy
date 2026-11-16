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
/** The readings the band can show, named as the snapshot's metrics are. */
export type DamCardReading = 'release' | 'tailwaterTempF' | 'poolElevation';

function Reading({ label, value, unit, metric, now, icon, dense = false, unsupported = false, note }: {
  label: string; value: string | null; unit: string; metric?: DamMetricValue; now: number;
  icon: EddyIconName;
  /** Three readings share the band: a smaller numeral keeps each on one line. */
  dense?: boolean;
  /**
   * Eddy has no source configured for this reading at this dam. An absent
   * value then reads "Not available in Eddy", and "Unavailable" is kept for a
   * reading that should be here and is not.
   *
   * Deliberately not "Not published": the registry knows which feeds Eddy
   * reads, not what an agency publishes. Kansas City puts Stockton's pool and
   * outflow on its own site, outside the API Eddy reads, so "Not published"
   * was a claim about the Corps that was false. Reserve it for a limitation
   * someone has verified at the source and recorded as such.
   */
  unsupported?: boolean;
  /** A qualifier that belongs with the value, such as "daily avg". */
  note?: string;
}) {
  // Three-up on a phone leaves each reading about 95px. The 36px icon gutter
  // then took a third of that: labels wrapped, units dropped to their own line,
  // and a seven-digit lake level ran past the card's edge. So below `sm` a
  // dense reading puts a small mark on the label's line and gives the value the
  // whole column; from `sm` up it is the same gutter layout as the two-up band.
  return (
    <div className={`relative min-w-0 ${dense ? 'sm:pl-9' : 'pl-9'}`}>
      <dt className={`text-[13px] font-medium leading-4 text-neutral-700 ${dense ? 'flex items-center gap-1 max-sm:text-xs sm:block' : ''}`}>
        <EddyIcon name={icon} size={28} className={dense ? 'shrink-0 max-sm:!h-5 max-sm:!w-5 sm:absolute sm:left-0 sm:top-0.5' : 'absolute left-0 top-0.5'} />
        {label}
      </dt>
      <dd className={`mt-1 flex flex-wrap items-baseline gap-x-1 text-primary-900 ${metric && readingStaleness(metric.at, now) !== 'fresh' ? 'opacity-60' : ''}`}>
        {value === null ? <span className={unsupported ? 'text-[13px] leading-5 text-neutral-600 sm:text-sm' : 'text-sm'}>{unsupported ? 'Not available in Eddy' : 'Unavailable'}</span> : <>
          <span className={`font-mono font-medium leading-7 tabular-nums tracking-tight ${dense ? 'text-[17px] sm:text-[22px]' : 'text-2xl sm:text-[26px]'}`}>{value}</span>{' '}
          <span className="text-[13px] text-neutral-500">{unit}</span>
          {note && <span className="text-xs text-neutral-600">{note}</span>}
        </>}
      </dd>
    </div>
  );
}

/**
 * ONE age line for the readings band: "Measured 53 min ago" when every
 * reading was observed in the same minute (or only one exists), otherwise
 * "Release 18 min ago · Temp 1 hr ago · Lake 3 hr ago". Still one line, but
 * never one age for observations an hour apart, which would date one wrongly.
 */
function readingAgeLine(readings: { label: string; metric: DamMetricValue | undefined }[], now: number): string | null {
  const present = readings.flatMap(({ label, metric }) => {
    const age = metric ? relativeAgeShort(metric.at, now) : null;
    return metric && age ? [{ label, age, minute: Math.floor(Date.parse(metric.at) / 60_000) }] : [];
  });
  if (present.length === 0) return null;
  if (present.every(entry => entry.minute === present[0].minute)) return `Measured ${present[0].age}`;
  return present.map(entry => `${entry.label} ${entry.age}`).join(' · ');
}

/**
 * Release and water temperature at the dam — and, where asked, the lake level
 * as a third reading with its own mark — with one age line.
 */
export function DamReadings({ dam, now, showLakeLevel = false, unsupported = [] }: {
  dam: DamSnapshot; now: number; showLakeLevel?: boolean;
  /** Readings Eddy has no source for at this dam; see Reading. Unknown on surfaces that do not pass it. */
  unsupported?: readonly DamCardReading[];
}) {
  const flow = dam.metrics.release;
  const temperature = dam.metrics.tailwaterTempF;
  const lake = showLakeLevel ? dam.metrics.poolElevation : undefined;
  const measured = readingAgeLine([
    { label: 'Release', metric: flow },
    { label: 'Temp', metric: temperature },
    ...(showLakeLevel ? [{ label: 'Lake', metric: lake }] : []),
  ], now);
  return (
    <div className="mx-3 rounded-xl bg-secondary-50 px-3 py-3 sm:mx-4 sm:px-4">
      <dl className={`grid gap-x-3 gap-y-3 ${showLakeLevel ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {/* A daily average is always labelled. In the three-up band the label
            has one line, so the qualifier sits with the value instead. */}
        <Reading label={flow?.dailyMean && !showLakeLevel ? 'Release (daily avg)' : 'Release'} note={flow?.dailyMean && showLakeLevel ? 'daily avg' : undefined} value={flow ? Math.round(flow.value).toLocaleString() : null} unit="cfs" metric={flow} now={now} icon="release" dense={showLakeLevel} unsupported={unsupported.includes('release')} />
        <Reading label="Water temp" value={temperature ? temperature.value.toFixed(1) : null} unit="°F" metric={temperature} now={now} icon="waterTemperature" dense={showLakeLevel} unsupported={unsupported.includes('tailwaterTempF')} />
        {showLakeLevel && (
          <Reading label="Lake level" value={lake ? lake.value.toFixed(2) : null} unit="ft" metric={lake} now={now} icon="damGauge" dense unsupported={unsupported.includes('poolElevation')} />
        )}
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
