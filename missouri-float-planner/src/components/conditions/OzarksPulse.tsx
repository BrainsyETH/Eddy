'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import type { RiverListItem } from '@/types/api';
import { floatableHeadline } from '@shared/floatable-headline';
import { useOzarksPulse } from '@/hooks/useOzarksPulse';
import { gateGlobalProse } from '@/lib/eddy/global-prose-gate';
import { formatAgeFromTimestamp } from '@/lib/utils/reading-age';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { EddyIcon } from '@/components/ui/EddyIcon';

export default function OzarksPulse({ initialRivers, renderedAt, compact = false }: {
  initialRivers: RiverListItem[];
  renderedAt: number;
  compact?: boolean;
}) {
  const { rivers, summary } = useOzarksPulse(initialRivers, renderedAt);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(renderedAt);
  const headingId = useId();
  const bodyId = useId();
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const headline = floatableHeadline((rivers.data ?? []).map(river => river.currentCondition?.code));
  // The API checks changed conditions. Also expire an open tab's prose locally;
  // an old successful response must not survive a failed refresh as current copy.
  const written = summary.data;
  const showProse = headline && !rivers.isError && !summary.isError && written &&
    gateGlobalProse({ generatedAt: written.generatedAt, live: [], now: new Date(now) }).show;
  const count = rivers.isError ? 'River conditions couldn’t refresh.' :
    headline ?? (rivers.isPending ? 'Checking river conditions…' : 'River conditions unavailable.');
  const open = !compact || expanded;

  return <Card as="section" variant="panel" aria-labelledby={headingId} className={compact ? 'mb-5' : 'w-full text-left'}>
    <div className="flex items-center gap-3 p-4 sm:p-5">
      <EddyIcon name="today" size={32} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <h2 id={headingId} className="font-display text-sm font-semibold text-accent-700">Ozarks Pulse</h2>
        <p className={`mt-1 font-display font-semibold leading-snug text-primary-900 ${compact ? 'text-lg' : 'text-2xl'}`}>{count}</p>
      </div>
      {compact && <Button variant="ghost" className="min-h-11 min-w-11 shrink-0 px-2"
        aria-label={expanded ? 'Hide Ozarks summary' : 'Show Ozarks summary'} aria-expanded={expanded} aria-controls={bodyId}
        onClick={() => setExpanded(value => !value)}>
        <ChevronDown className={`size-5 transition-transform duration-fast ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </Button>}
    </div>
    <div id={bodyId} hidden={!open} className="px-4 pb-4 sm:px-5 sm:pb-5">
      {showProse ? <>
        <p className="text-[15px] leading-relaxed text-neutral-700">{written.prose}</p>
        <p className="mt-2 text-xs text-neutral-600"><time dateTime={written.generatedAt}>Written {formatAgeFromTimestamp(written.generatedAt, now)}</time></p>
      </> : <p className="text-sm text-neutral-600">{rivers.isError || !headline ? 'Check individual river reports for available readings.' :
        summary.isPending ? 'Loading Ozarks summary…' : summary.isError ? 'Couldn’t load the Ozarks summary.' : 'Summary unavailable while conditions are changing.'}</p>}
      {(summary.isError || rivers.isError) && <Button variant="ghost" className="mt-1 min-h-11 px-0" onClick={() => {
        if (rivers.isError) void rivers.refetch();
        if (summary.isError) void summary.refetch();
      }}>Retry update</Button>}
      {!compact && <Link href="/rivers" className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded text-sm font-semibold text-primary-700 hover:text-primary-900 focus-visible:outline-2 focus-visible:outline-primary-600">
        View conditions<ArrowRight className="size-4" aria-hidden="true" />
      </Link>}
    </div>
  </Card>;
}
