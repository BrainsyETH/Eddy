import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import Card from '@/components/ui/Card';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';
import DamInfoTip from '@/components/dam/DamInfoTip';
import type { DamSnapshot } from '@/lib/data/dams';
import type { LakeSection } from '@shared/lake-types';
import { readingStaleness, relativeAge, tailwaterMovementLabel } from '@shared/dam-schedule-copy';
import { levelChangeLabel } from '@shared/lake-status';
import { lakeReadingIsStale, lakeReadingLabel, sharedObservationAt } from '@/lib/lakes/presentation';

type ConditionTile = {
  label: string;
  icon: EddyIconName;
  value: string;
  unit: string;
  at: string;
  stale: boolean;
  note: string;
  daily?: boolean;
  movement?: { label: string; direction: 'up' | 'down' | 'unchanged' };
};

function Movement({ label, direction }: NonNullable<ConditionTile['movement']>) {
  const Icon = direction === 'unchanged' ? ArrowRight : direction === 'up' ? ArrowUp : ArrowDown;
  const color = direction === 'unchanged' ? 'text-neutral-600' : direction === 'up' ? 'text-accent-800' : 'text-primary-700';
  const [change, period] = label.split(/ (?=(?:in|over) )/);
  return <p className={`mt-2 flex items-start gap-1 text-xs font-semibold sm:text-sm ${color}`}>
    <Icon className="size-4 shrink-0 sm:mt-0.5" aria-hidden="true" />
    <span><span className="whitespace-nowrap">{change}</span><span className="block font-normal sm:inline sm:font-semibold"> {period}</span></span>
  </p>;
}

export default function PilotDamConditions({ dam, lake, now }: { dam: DamSnapshot; lake: LakeSection; now: number }) {
  const { poolElevation: pool, tailwaterElevation: below, tailwaterTempF: temp, inflow } = dam.metrics;
  const allShared = sharedObservationAt([pool, below, temp]);
  const shared = allShared ?? (below && temp ? sharedObservationAt([below, temp]) : null);
  const belowOnly = !allShared && Boolean(shared);
  const tiles: ConditionTile[] = [];

  if (below) {
    const movement = readingStaleness(below.at, now) === 'fresh' ? tailwaterMovementLabel(below.trend) : null;
    tiles.push({
      label: 'Below the dam', icon: 'release', value: below.value.toFixed(2), unit: 'ft', at: below.at,
      stale: readingStaleness(below.at, now) === 'stale', note: 'Elevation',
      movement: movement && below.trend ? { label: movement, direction: below.trend.delta > 0 ? 'up' : 'down' } : undefined,
    });
  }
  if (pool) {
    const stale = lake.pool ? lakeReadingIsStale(lake.pool, now) : readingStaleness(pool.at, now) === 'stale';
    const movement = lake.pool && !stale ? levelChangeLabel(lake.change24hFt ?? null, 24) : null;
    tiles.push({
      label: 'Lake level', icon: 'damGauge', value: pool.value.toFixed(2), unit: 'ft', at: pool.at,
      stale, daily: lake.pool?.daily, note: 'Elevation',
      movement: movement && lake.change24hFt !== undefined ? {
        label: movement,
        direction: Math.abs(lake.change24hFt) < 0.05 ? 'unchanged' : lake.change24hFt > 0 ? 'up' : 'down',
      } : undefined,
    });
  }
  if (temp) tiles.push({
    label: 'Water temp', icon: 'waterTemperature', value: temp.value.toFixed(1), unit: '°F', at: temp.at,
    stale: readingStaleness(temp.at, now) === 'stale', note: 'Below the dam',
  });
  if (!tiles.length && !inflow) return null;

  const inflowSharesObservation = Boolean(inflow && shared && sharedObservationAt([inflow, { at: shared }]));

  return <Card as="section" variant="panel" className="p-4 sm:p-5" aria-label="Water conditions" data-pilot-conditions>
    <div className="mb-5 flex items-center justify-between gap-2">
      <h2 className="font-heading text-base font-bold text-primary-800 sm:text-lg">Water conditions</h2>
      {shared && <p className="max-w-24 shrink-0 text-right text-xs text-neutral-600 sm:max-w-none">
        {tiles.length === 1 && tiles[0].daily && lake.pool
          ? lakeReadingLabel(lake.pool, now)
          : `${belowOnly ? 'Below dam observed' : 'Observed'} ${relativeAge(shared, now) ?? 'time unavailable'}`}
      </p>}
    </div>
    <div className="grid gap-3 sm:gap-6" style={{ gridTemplateColumns: `repeat(${Math.max(1, tiles.length)}, minmax(0, 1fr))` }}>
      {tiles.map((tile) => <div key={tile.label} className="min-w-0">
        <h3 className="flex min-h-[4.5rem] flex-col items-start justify-start gap-2 text-xs font-semibold text-primary-800 sm:min-h-8 sm:flex-row sm:items-center sm:gap-2 sm:text-sm">
          <EddyIcon name={tile.icon} size={28} className="shrink-0" />
          <span>{tile.label}</span>
        </h3>
        <p className={`mt-3 whitespace-nowrap font-mono text-base font-medium leading-tight tracking-tight text-primary-800 min-[390px]:text-xl sm:text-3xl ${tile.stale ? 'opacity-70' : ''}`}>
          {tile.value}<span className="ml-1 font-body text-xs font-normal tracking-normal text-neutral-600 sm:ml-2 sm:text-base">{tile.unit}</span>
        </p>
        <p className="mt-1.5 text-xs text-neutral-600">{tile.note}{tile.daily && tiles.length > 1 && shared && Date.parse(shared) === Date.parse(tile.at) ? ' · Daily report' : ''}</p>
        {tile.movement && <Movement {...tile.movement} />}
        {(!shared || Date.parse(tile.at) !== Date.parse(shared)) && <p className="mt-2 text-xs text-neutral-600">
          {tile.daily && lake.pool ? lakeReadingLabel(lake.pool, now) : `Observed ${relativeAge(tile.at, now) ?? 'time unavailable'}`}
        </p>}
        {tile.stale && <p className="mt-1 text-xs font-semibold text-accent-900">Outdated reading</p>}
      </div>)}
    </div>
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
      <p>{inflow ? <>
        Inflow{inflow.dailyMean ? ' (daily avg)' : ''}: <span className="font-medium text-primary-800">{Math.round(inflow.value).toLocaleString()} cfs</span>
        {!inflowSharesObservation && <> · {relativeAge(inflow.at, now) ?? 'Reading time unavailable'}</>}
      </> : 'About these readings'}</p>
      <div className="-my-2 -mr-2 shrink-0">
        <DamInfoTip title="Water conditions">
          <p>Elevation is height relative to a survey reference, not water depth. Lake level uses {lake.datum}.</p>
          <p>Arrows show the measured change over the stated time span. Water temperature is measured below the dam.</p>
          {inflow && <p>Inflow is water entering the lake{inflow.dailyMean ? ', reported as a daily average' : ''}.</p>}
        </DamInfoTip>
      </div>
    </div>
  </Card>;
}
