'use client';

import type { LakeSection } from '@shared/lake-types';
import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ExternalLink, MapPin } from 'lucide-react';
import { useDamPageClock } from '@/components/dam/useDamPageClock';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { EddyIcon } from '@/components/ui/EddyIcon';
import LakeConditions from './LakeConditions';
import LakeLaunches from './LakeLaunches';
import { damPhoto, lakePhoto, LAKE_RECREATION } from '@/lib/lakes/photography';

function LakeFact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return <div><dt>{icon}<span>{label}</span></dt><dd>{children}</dd></div>;
}

export default function LakeDetail({ lake, damId, damName, renderedAt }: { lake: LakeSection; damId: string; damName: string; renderedAt: number }) {
  const { now, refreshing } = useDamPageClock(renderedAt);
  const scenery = lakePhoto(lake.slug);
  const structure = damPhoto(damId);
  const recreation = LAKE_RECREATION[lake.slug];
  return <div className="space-y-6" data-lake-detail={lake.slug}>
    <LakeConditions lake={lake} now={now} />
    <dl className="lake-facts">
      <LakeFact icon={<EddyIcon name="dam" size={28} />} label="Controlling dam"><Link href={`/dams/${damId}`} className="inline-flex min-h-11 items-center gap-2 hover:underline">{damName}<ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Link></LakeFact>
      {lake.operatingRange && <LakeFact icon={<EddyIcon name="damGauge" size={28} />} label="Conservation pool"><span>{lake.operatingRange.conservationFt.toFixed(1)} <span className="font-normal">ft</span></span></LakeFact>}
      <LakeFact icon={<EddyIcon name="boatRamp" size={28} />} label="Reviewed launches"><a href="#boat-launches" className="inline-flex min-h-11 items-center gap-2 hover:underline">{lake.launches.length > 0 ? `${lake.launches.length} locations` : 'Currently unavailable'}<ArrowRight className="size-4 shrink-0" aria-hidden="true" /></a></LakeFact>
      <LakeFact icon={<MapPin className="size-7 shrink-0 text-primary-600" aria-hidden="true" />} label="Location">{lake.states.map(state => state === 'MO' ? 'Missouri' : state === 'AR' ? 'Arkansas' : state).join(' · ')}</LakeFact>
    </dl>
    <LakeLaunches lake={lake} now={now} />
    <div className="grid gap-4 lg:grid-cols-2">
      {recreation && <Card as="section" variant="panel" className="lake-destination" aria-labelledby="lake-recreation-heading">
        {scenery && <div className="lake-destination-photo"><Image src={scenery.src} alt={scenery.alt} fill sizes="(min-width: 768px) 160px, 112px" className="object-cover" /></div>}
        <div className="min-w-0 p-4 sm:p-5"><h2 id="lake-recreation-heading" className="flex items-center gap-2 font-heading text-lg font-bold text-primary-800"><EddyIcon name="campground" size={28} />Recreation &amp; access</h2><p className="mt-2 text-sm leading-relaxed text-neutral-600">Parks, camping and visitor information from {recreation.label}.</p><Button href={recreation.href} variant="outline" size="sm" className="mt-4 min-h-11" target="_blank" rel="noopener noreferrer">Explore recreation <ExternalLink className="size-4" aria-hidden="true" /></Button></div>
      </Card>}
      <Card as="section" variant="panel" className="lake-destination" aria-labelledby="lake-dam-heading">
        {structure && <div className="lake-destination-photo"><Image src={structure.src} alt={structure.alt} fill sizes="(min-width: 768px) 160px, 112px" className="object-cover" /></div>}
        <div className="min-w-0 p-4 sm:p-5"><h2 id="lake-dam-heading" className="flex items-center gap-2 font-heading text-lg font-bold text-primary-800"><EddyIcon name="dam" size={28} />Dam &amp; generation</h2><p className="mt-2 text-sm leading-relaxed text-neutral-600">{damName} schedules, releases and conditions below the dam.</p><Button href={`/dams/${damId}#generation`} variant="outline" size="sm" className="mt-4 min-h-11">View dam conditions <ArrowRight className="size-4" aria-hidden="true" /></Button></div>
      </Card>
    </div>
    <p className="min-h-4 text-right text-xs text-neutral-500" aria-live="polite">{refreshing ? 'Checking for updates…' : null}</p>
  </div>;
}
