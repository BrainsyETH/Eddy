'use client';

import type { LakeSection } from '@shared/lake-types';
import { ExternalLink } from 'lucide-react';
import { useDamPageClock } from '@/components/dam/useDamPageClock';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { EddyIcon } from '@/components/ui/EddyIcon';
import LakeConditions from './LakeConditions';
import LakeLaunches from './LakeLaunches';
import LakeSystem from './LakeSystem';
import LakeWeather from './LakeWeather';
import { LAKE_RECREATION } from '@/lib/lakes/photography';

/**
 * Reading order: the level, the wind, where to launch, then the water the lake
 * belongs to. The first three decide a day on the lake; the last is context,
 * and each of its rows opens the page that already carries the detail.
 */
export default function LakeDetail({ lake, renderedAt }: { lake: LakeSection; renderedAt: number }) {
  const { now, refreshing } = useDamPageClock(renderedAt);
  const recreation = LAKE_RECREATION[lake.slug];
  const system = lake.system ?? [];
  return <div className="space-y-6" data-lake-detail={lake.slug}>
    <LakeConditions lake={lake} now={now} />
    {lake.weather && <LakeWeather weather={lake.weather} now={now} />}
    <LakeLaunches lake={lake} now={now} />
    <div className={`grid items-start gap-4 ${system.length && recreation ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}>
      {system.length > 0 && <LakeSystem rows={system} now={now} />}
      {recreation && <Card as="section" variant="panel" className="lake-destination" aria-labelledby="lake-recreation-heading">
        <div className="min-w-0 p-4 sm:p-5"><h2 id="lake-recreation-heading" className="flex items-center gap-2 font-heading text-lg font-bold text-primary-800"><EddyIcon name="campground" size={28} />Recreation &amp; access</h2><p className="mt-2 text-sm leading-relaxed text-neutral-600">Parks, camping and visitor information from {recreation.label}.</p><Button href={recreation.href} variant="outline" size="sm" className="mt-4 min-h-11" target="_blank" rel="noopener noreferrer">Explore recreation <ExternalLink className="size-4" aria-hidden="true" /></Button></div>
      </Card>}
    </div>
    <p className="min-h-4 text-right text-xs text-neutral-500" aria-live="polite">{refreshing ? 'Checking for updates…' : null}</p>
  </div>;
}
