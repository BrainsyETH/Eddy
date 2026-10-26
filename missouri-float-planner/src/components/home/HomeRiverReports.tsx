'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useRiverGroups } from '@/hooks/useRiverGroups';
import { formatRiverLevel } from '@/lib/river-groups';
import { formatAgeFromTimestamp } from '@/lib/utils/reading-age';
import { gaugeFreshness } from '@shared/gauge-freshness';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { optimizeBlogImage } from '@/lib/blog-image';

export interface HomeRiver {
  slug: string;
  name: string;
  path: string;
  photoUrl: string | null;
}

/** Small report cards use the same readings and condition pills as /rivers. */
export default function HomeRiverReports({ rivers }: { rivers: HomeRiver[] }) {
  const { riverGroups, isLoading, error } = useRiverGroups();
  return (
    <div>
      {error && <p role="status" className="mb-4 text-sm text-neutral-600">River levels couldn’t refresh. Open a river report for more details.</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        {rivers.map(river => {
          const live = riverGroups.find(group => group.riverSlug === river.slug);
          const timestamp = live?.primaryGauge.readingTimestamp;
          const fresh = gaugeFreshness(timestamp) === 'live' && !live?.primaryGauge.readingSuspect;
          const level = live ? formatRiverLevel(live) : null;
          const age = timestamp ? formatAgeFromTimestamp(timestamp) : null;
          return (
            <Link key={river.slug} href={river.path} data-ga-event="home_river_report" data-ga-label={river.slug}
              className="group overflow-hidden rounded-xl border border-neutral-200 bg-white no-underline transition-shadow hover:shadow-soft-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600">
              {river.photoUrl && <div className="relative h-28 sm:h-32"><Image src={river.photoUrl} alt="" fill sizes="(min-width: 640px) 33vw, 100vw" className="object-cover" unoptimized={!optimizeBlogImage(river.photoUrl)} /></div>}
              <div className="p-4 md:p-5">
                <h3 className="mb-3 text-xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{river.name}</h3>
                {live ? (
                  <>
                    <ConditionBadge code={fresh ? live.condition.code : 'unknown'} />
                    {level && <p className="mt-3 text-2xl font-bold tabular-nums text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{level}</p>}
                    <p className="mt-1 text-xs text-neutral-500">
                      {age ? `${fresh ? 'Updated' : 'Last reading'} ${age}` : 'Reading time unavailable'}
                    </p>
                  </>
                ) : isLoading ? <p className="text-sm text-neutral-500">Loading river levels…</p> : null}
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700">View River Report <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
              </div>
            </Link>
          );
        })}
      </div>
      {rivers.length === 0 && <p className="text-sm text-neutral-600">River reports are unavailable right now. Please try again shortly.</p>}
    </div>
  );
}
