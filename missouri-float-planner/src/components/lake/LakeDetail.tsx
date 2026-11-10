'use client';

import type { LakeSection } from '@shared/lake-types';
import { useDamPageClock } from '@/components/dam/useDamPageClock';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { EddyIcon } from '@/components/ui/EddyIcon';
import LakeConditions from './LakeConditions';
import LakeLaunches from './LakeLaunches';

export default function LakeDetail({ lake, damId, damName, renderedAt }: { lake: LakeSection; damId: string; damName: string; renderedAt: number }) {
  const { now, refreshing } = useDamPageClock(renderedAt);
  return <div className="space-y-6" data-lake-detail={lake.slug}>
    <LakeConditions lake={lake} now={now} />
    <LakeLaunches lake={lake} now={now} />
    <Card as="section" variant="panel" className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5" aria-labelledby="lake-dam-heading">
      <div><h2 id="lake-dam-heading" className="flex items-center gap-2 font-heading text-lg font-bold text-primary-800"><EddyIcon name="release" size={28} />{damName}</h2><p className="mt-1 text-sm text-neutral-600">Generation schedules, releases and conditions below the dam.</p></div>
      <Button href={`/dams/${damId}#generation`} variant="outline" size="sm" className="min-h-11">View dam conditions →</Button>
    </Card>
    <p className="min-h-4 text-right text-xs text-neutral-500" aria-live="polite">{refreshing ? 'Checking for updates…' : null}</p>
  </div>;
}
