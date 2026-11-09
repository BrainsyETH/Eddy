import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { EddyIcon } from '@/components/ui/EddyIcon';
import LakeLevelChart from '@/components/dam/LakeLevelChart';
import type { LakeSection } from '@shared/lake-types';
import LakeMovement from './LakeMovement';
import { lakeReadingIsStale } from '@/lib/lakes/presentation';

/** Context below all dam operations. The measurement row already shows the current level. */
export default function LakePreview({ lake, now, href }: { lake: LakeSection; now: number; href?: string }) {
  if (!href && lake.history.length < 2) return null;
  return <Card as="section" variant="panel" className="p-4 sm:p-5" data-lake-section={lake.slug} aria-label={lake.name}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-heading text-xl font-bold text-primary-800"><EddyIcon name="damGauge" size={28} />{lake.name}</h2><p className="mt-1 text-sm text-neutral-600">{href ? 'Lake levels and launch access' : 'Lake level history'}</p></div>
      {href && <Button href={href} variant="outline" size="sm" className="min-h-11">Explore {lake.name} →</Button>}
    </div>
    {lake.history.length > 1 && <LakeLevelChart history={lake.history} conservationFt={lake.operatingRange?.conservationFt} now={now} timeZone={lake.timeZone} datum={lake.datum} compact />}
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">{lake.pool && !lakeReadingIsStale(lake.pool, now) && <LakeMovement delta={lake.change7dFt} hours={168} />}{lake.launches.length > 0 && <span className="flex items-center gap-1.5 text-sm text-neutral-600"><EddyIcon name="boatRamp" size={20} />{lake.launches.length} reviewed {lake.launches.length === 1 ? 'launch' : 'launches'}</span>}</div>
  </Card>;
}
