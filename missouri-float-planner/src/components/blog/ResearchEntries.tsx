import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';
import { REPORT_PATH, REPORT_TITLE, stations } from '@/lib/condition-days/study';
import { RELEASE_TIMING_PATH } from '@/lib/release-timing/findings';
import type { GuideDirectoryEntry } from './GuideDirectory';

function study(href: string, title: string, description: string, icon: EddyIconName, state: string | null, keywords: string): GuideDirectoryEntry {
  return { slug: href, state, search: ['Research', title, description, keywords].join(' '),
    card: <Link href={href} className="group flex h-full items-center gap-3 rounded-xl border border-neutral-300 bg-surface p-4 text-text-primary no-underline hover:border-accent-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-secondary-100"><EddyIcon name={icon} size={32}/></span><div className="flex-1"><h3 className="text-lg font-bold">{title}</h3><p className="mt-1 text-sm text-text-secondary">{description}</p></div>
      <ChevronRight size={18} className="shrink-0 text-text-secondary group-hover:text-accent-700" aria-hidden="true"/>
    </Link> };
}

export const researchEntries = [
  study(REPORT_PATH, REPORT_TITLE, 'Find the months your stretch most often ran Good or Flowing.', 'gaugeStation', null,
    'Condition Days ' + stations.map(s => s.river + ' ' + s.gauge).join(' ')),
  study(RELEASE_TIMING_PATH, 'Bull Shoals release timing', 'Follow a release down the White River to the gauge near Norfork.', 'dam', 'AR', 'generation Arkansas dam'),
];
