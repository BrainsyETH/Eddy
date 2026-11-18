import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';
import { REPORT_PATH, stations } from '@/lib/condition-days/study';
import { RELEASE_TIMING_PATH } from '@/lib/release-timing/findings';
import type { GuideDirectoryEntry } from './GuideDirectory';

function study(href: string, title: string, description: string, icon: EddyIconName, state: string | null, keywords: string): GuideDirectoryEntry {
  return { slug: href, state, search: ['Research', title, description, keywords].join(' '),
    card: <Link href={href} className="flex h-full items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4 text-primary-900 no-underline hover:border-primary-600">
      <EddyIcon name={icon} size={42}/><div className="flex-1"><h3 className="text-lg font-bold">{title}</h3><p className="mt-1 text-sm">{description}</p></div>
      <ArrowUpRight size={18} aria-hidden="true"/>
    </Link> };
}

export const researchEntries = [
  study(REPORT_PATH, 'Condition Days', 'Explore 20 years of river levels, one stretch at a time.', 'gaugeStation', null,
    stations.map(s => s.river + ' ' + s.gauge).join(' ')),
  study(RELEASE_TIMING_PATH, 'Bull Shoals release timing', 'Follow a release down the White River to the gauge near Norfork.', 'dam', 'AR', 'generation Arkansas dam'),
];
