import Card from '@/components/ui/Card';
import { EddyIcon } from '@/components/ui/EddyIcon';
import LakeLevelChart from '@/components/dam/LakeLevelChart';
import type { LakeSection } from '@shared/lake-types';
import { poolPositionSentence } from '@shared/lake-status';
import { lakeReadingIsStale, lakeReadingLabel } from '@/lib/lakes/presentation';
import LakeMovement from './LakeMovement';

export default function LakeConditions({ lake, now }: { lake: LakeSection; now: number }) {
  const pool = lake.pool;
  const stale = pool ? lakeReadingIsStale(pool, now) : false;
  return <Card as="section" variant="framed" className="p-4 sm:p-6" aria-labelledby="lake-level-heading">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="lake-level-heading" className="flex items-center gap-2 font-heading text-xl font-bold text-primary-800"><EddyIcon name="damGauge" size={28} />Lake level</h2>
      {pool && <p className={`text-xs ${stale ? 'font-semibold text-accent-900' : 'text-neutral-600'}`}>{lakeReadingLabel(pool, now)}</p>}
    </div>
    <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div>
        {pool ? <>
          <p className={`font-mono text-4xl text-primary-900 sm:text-5xl ${stale ? 'opacity-70' : ''}`}>{pool.valueFt.toFixed(2)} <span className="font-sans text-base">ft</span></p>
          <p className="mt-1 text-xs text-neutral-500">Elevation · {lake.datum}</p>
          {!stale && <div className="mt-3 flex flex-col items-start gap-1"><LakeMovement delta={lake.change24hFt} hours={24} /><LakeMovement delta={lake.change7dFt} hours={168} /></div>}
          <p className="mt-3 text-sm leading-6 text-neutral-700">{poolPositionSentence(lake.poolPosition ?? null, pool.valueFt, lake.operatingRange ?? null)}</p>
        </> : <p className="text-sm text-neutral-600">Lake level is currently unavailable.</p>}
      </div>
      <div className="min-w-0">
        {lake.history.length > 1 ? <LakeLevelChart history={lake.history} conservationFt={lake.operatingRange?.conservationFt} now={now} timeZone={lake.timeZone} datum={lake.datum} /> : <p className="py-4 text-sm text-neutral-600">Lake-level history is currently unavailable.</p>}
      </div>
    </div>
    {lake.operatingRange && <details className="mt-4 border-t border-neutral-200 pt-3 text-xs text-neutral-600"><summary className="w-fit cursor-pointer py-2 font-medium">About these levels</summary><p className="mt-2 leading-5">{lake.operatingRange.source}. Reference checked {lake.operatingRange.asOf}. These are lake elevations, not water depths.</p></details>}
  </Card>;
}
