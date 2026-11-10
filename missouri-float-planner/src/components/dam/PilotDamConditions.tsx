import Card from '@/components/ui/Card';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';
import type { DamSnapshot } from '@/lib/data/dams';
import type { LakeSection } from '@shared/lake-types';
import { readingStaleness, relativeAge, tailwaterMovementLabel } from '@shared/dam-schedule-copy';
import { lakeReadingIsStale, lakeReadingLabel, sharedObservationAt } from '@/lib/lakes/presentation';
import LakeMovement from '@/components/lake/LakeMovement';

export default function PilotDamConditions({ dam, lake, now }: { dam: DamSnapshot; lake: LakeSection; now: number }) {
  const { poolElevation: pool, tailwaterElevation: below, tailwaterTempF: temp, inflow } = dam.metrics;
  const allShared = sharedObservationAt([pool, below, temp]);
  const shared = allShared ?? (below && temp ? sharedObservationAt([below, temp]) : null);
  const belowOnly = !allShared && Boolean(shared);
  const tiles: Array<{ label: string; icon: EddyIconName; value: string; unit: string; at: string; stale: boolean; note?: string; daily?: boolean }> = [];
  if (pool) tiles.push({ label: 'Lake level', icon: 'damGauge', value: pool.value.toFixed(2), unit: 'ft', at: pool.at, stale: lake.pool ? lakeReadingIsStale(lake.pool, now) : readingStaleness(pool.at, now) === 'stale', daily: lake.pool?.daily, note: `Elevation · ${lake.datum}` });
  if (below) tiles.push({ label: 'Below the dam', icon: 'release', value: below.value.toFixed(2), unit: 'ft', at: below.at, stale: readingStaleness(below.at, now) === 'stale', note: 'Elevation' });
  if (temp) tiles.push({ label: 'Water temp', icon: 'waterTemperature', value: temp.value.toFixed(1), unit: '°F', at: temp.at, stale: readingStaleness(temp.at, now) === 'stale', note: 'Below the dam' });
  if (!tiles.length && !inflow && !dam.tailwaterFishery) return null;
  return <Card as="section" variant="panel" className="p-4 sm:p-5" aria-label="Water conditions" data-pilot-conditions>
    <div className="mb-4 flex items-center justify-between gap-2"><h2 className="font-heading text-base font-bold text-primary-800 sm:text-lg">Water conditions</h2>{shared && <p className="max-w-24 shrink-0 text-right text-xs text-neutral-600 sm:max-w-none">{tiles.length === 1 && lake.pool?.daily ? lakeReadingLabel(lake.pool, now) : `${belowOnly ? 'Below dam observed' : 'Observed'} ${relativeAge(shared, now) ?? 'time unavailable'}`}</p>}</div>
    <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, tiles.length)}, minmax(0, 1fr))` }}>
      {tiles.map((tile) => <div key={tile.label} className="min-w-0">
        <h3 className="flex h-12 items-center sm:h-8 gap-1 text-xs font-semibold text-primary-800 sm:text-sm"><EddyIcon name={tile.icon} size={24} className="size-5 shrink-0 sm:size-6" />{tile.label}</h3>
        <p className={`mt-2 whitespace-nowrap font-mono text-sm text-primary-900 min-[390px]:text-base sm:text-2xl ${tile.stale ? 'opacity-70' : ''}`}>{tile.value} <span className="text-xs sm:text-base">{tile.unit}</span></p>
        <p className="mt-1 text-xs text-neutral-500">{tile.note}{tile.daily && tiles.length > 1 && shared === tile.at ? ' · Daily report' : ''}</p>
        {(!shared || Date.parse(tile.at) !== Date.parse(shared)) && <p className="mt-1 text-xs text-neutral-600">{tile.daily && lake.pool ? lakeReadingLabel(lake.pool, now) : `Observed ${relativeAge(tile.at, now) ?? 'time unavailable'}`}</p>}
        {tile.stale && <p className="mt-1 text-xs font-semibold text-accent-900">Outdated reading</p>}
      </div>)}
    </div>
    {(lake.pool && !lakeReadingIsStale(lake.pool, now) && lake.change24hFt !== undefined || below?.trend && readingStaleness(below.at, now) === 'fresh') && <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-200 pt-3">
      {lake.pool && !lakeReadingIsStale(lake.pool, now) && lake.change24hFt !== undefined && <span className="text-sm text-neutral-600">Lake: <LakeMovement delta={lake.change24hFt} hours={24} /></span>}
      {below?.trend && readingStaleness(below.at, now) === 'fresh' && <span className="text-sm text-primary-700">Below the dam: {tailwaterMovementLabel(below.trend)}</span>}
    </div>}
    {(inflow || dam.tailwaterFishery) && <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
      {inflow && <span>Inflow{inflow.dailyMean ? ' (daily avg)' : ''}: {Math.round(inflow.value).toLocaleString()} cfs · {relativeAge(inflow.at, now) ?? 'Reading time unavailable'}</span>}
      {dam.tailwaterFishery && <span>Fishery below dam: {dam.tailwaterFishery === 'trout' ? 'Trout' : 'Warmwater'}</span>}
    </div>}
  </Card>;
}
