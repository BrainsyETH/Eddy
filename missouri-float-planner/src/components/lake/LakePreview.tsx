import Card from '@/components/ui/Card';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import { EddyIcon } from '@/components/ui/EddyIcon';
import LakeLevelChart from '@/components/dam/LakeLevelChart';
import type { LakeSection } from '@shared/lake-types';
import LakeMovement from './LakeMovement';
import { lakeReadingIsStale, lakeReadingLabel } from '@/lib/lakes/presentation';
import { poolPositionSentence } from '@shared/lake-status';
import { lakePhoto } from '@/lib/lakes/photography';

/** Context below all dam operations. The measurement row already shows the current level. */
export default function LakePreview({ lake, now, href }: { lake: LakeSection; now: number; href?: string }) {
  if (!href && lake.history.length < 2) return null;
  const photo = lakePhoto(lake.slug);
  const stale = lake.pool ? lakeReadingIsStale(lake.pool, now) : false;
  return <Card as="section" variant="panel" className="overflow-hidden" data-lake-section={lake.slug} aria-label={lake.name}>
    <div className="lake-preview-main">
      {photo && <div className="lake-preview-photo"><Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 768px) 200px, 100vw" className="object-cover" /></div>}
      <div className="min-w-0 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-heading text-xl font-bold text-primary-800"><EddyIcon name="damGauge" size={28} />{lake.name}</h2>
        {lake.pool ? <>
          <p className="mt-3 text-xs font-medium text-neutral-600">Lake level</p>
          <p className={`mt-1 font-mono text-3xl font-semibold text-primary-900 ${stale ? 'opacity-70' : ''}`}>{lake.pool.valueFt.toFixed(2)} <span className="font-sans text-sm font-normal">ft</span></p>
          <p className={`mt-1 text-xs ${stale ? 'font-semibold text-accent-900' : 'text-neutral-500'}`}>{lakeReadingLabel(lake.pool, now)}</p>
          {!stale && <div className="mt-2"><LakeMovement delta={lake.change7dFt} hours={168} /></div>}
          <p className="mt-2 text-xs leading-relaxed text-neutral-600">{poolPositionSentence(lake.poolPosition ?? null, lake.pool.valueFt, lake.operatingRange ?? null)}</p>
        </> : <p className="mt-3 text-sm text-neutral-600">Lake level is currently unavailable.</p>}
      </div>
      <div className="min-w-0 px-4 pb-4 md:self-center md:p-5">{lake.history.length > 1 ? <LakeLevelChart history={lake.history} conservationFt={lake.operatingRange?.conservationFt} now={now} timeZone={lake.timeZone} datum={lake.datum} compact /> : <p className="text-sm text-neutral-500">Lake-level history is currently unavailable.</p>}</div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-neutral-200 bg-secondary-50 px-4 py-3 sm:px-5">
      <span className="flex items-center gap-2 text-sm text-neutral-700"><EddyIcon name="boatRamp" size={24} />{lake.launches.length > 0 ? `${lake.launches.length} reviewed ${lake.launches.length === 1 ? 'launch' : 'launches'}` : 'Lake levels and launch access'}</span>
      {href && <Button href={href} variant="ghost" size="sm" className="min-h-11">Explore {lake.name} <ArrowRight className="size-4" aria-hidden="true" /></Button>}
    </div>
  </Card>;
}
