'use client';

import Image from 'next/image';
import { ArrowRight, Lock } from 'lucide-react';
import type { AppDestination } from '@/lib/app-destination';
import ReadAppLink from '@/components/ReadAppLink';
import { useDamReadWrittenAt } from '@/components/dam/DamEddyRead';
import { formatAgeFromTimestamp } from '@/lib/utils/reading-age';

interface EddyOutlookFooterProps {
  destination: AppDestination;
  readIsGenerated: boolean;
  generatedAt?: string | null;
  sourceName: string;
  damId?: string | null;
}

/** One compact invitation below the forecast, attributed only to its own Read. */
export default function EddyOutlookFooter({
  destination, readIsGenerated, generatedAt, sourceName, damId = null,
}: EddyOutlookFooterProps) {
  const damRead = useDamReadWrittenAt(damId);
  const writtenAt = damId ? damRead.generatedAt : readIsGenerated ? generatedAt : null;
  if (damId ? !damRead.generatedAt : !readIsGenerated) return null;
  const age = writtenAt ? formatAgeFromTimestamp(writtenAt) : null;
  const readDestination: AppDestination = damId ? { kind: 'dam', id: damId } : destination;

  return (
    <div id="eddy-says" data-river-read className="scroll-mt-24 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-secondary-200 bg-secondary-50 px-4 py-2 sm:px-5">
      <Image src="/icons/eddy-wave.png" alt="" width={24} height={28} className="h-7 w-auto shrink-0" />
      <ReadAppLink destination={readDestination} label={`${readDestination.kind}_eddy_read`}
        aria-label={`Eddy’s Read for ${sourceName} in the app with Eddy Premium`}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-800 underline underline-offset-2 hover:text-primary-600">
        <Lock className="size-3.5 shrink-0" aria-hidden="true" />
        Eddy’s Read in the app
        <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
      </ReadAppLink>
      {age && <span className="text-xs text-neutral-600" title={sourceName}>Written {age}</span>}
    </div>
  );
}
