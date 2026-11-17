'use client';

import { useQuery } from '@tanstack/react-query';
import type { DamSnapshot } from '@shared/dam-types';
import RiverDamPanel from './RiverDamPanel';
import Skeleton from '@/components/ui/Skeleton';
import Button from '@/components/ui/Button';
import CurrentReadingCard from '@/components/gauge/CurrentReadingCard';

interface SelectedRiverDamPanelProps {
  damId: string;
  damName: string;
  dischargeCfs: number | null;
  readingAgeHours: number | null;
  readingSuspect: boolean;
}

/** Fetch only a selected release that has no server-rendered panel. */
export default function SelectedRiverDamPanel({ damId, damName, dischargeCfs, readingAgeHours, readingSuspect }: SelectedRiverDamPanelProps) {
  const { data: dam, isPending, refetch } = useQuery({
    queryKey: ['river-selected-dam', damId],
    queryFn: async ({ signal }): Promise<DamSnapshot> => {
      const response = await fetch(`/api/dams/${encodeURIComponent(damId)}`, { signal });
      if (!response.ok) throw new Error('Dam report unavailable');
      const snapshot: DamSnapshot = await response.json();
      if (snapshot.id !== damId) throw new Error('Dam report does not match selection');
      return snapshot;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  // Query identity prevents a late response from replacing a different dam.
  if (dam?.id === damId) return <RiverDamPanel context={{ dam, tailwaterGaugeSiteId: damId, forecast: [], forecastIsDaily: true }} position="lead" />;
  return <div className="p-4 sm:p-5" aria-busy={isPending}>
    <h3 id="river-dam-heading" className="font-heading text-lg font-bold text-neutral-900">{damName}</h3>
    <p className="mb-2 mt-1 text-xs text-neutral-600">Release at the dam</p>
    <CurrentReadingCard siteId={damId} dischargeCfs={dischargeCfs} gaugeHeightFt={null}
      thresholdUnit="cfs" readingAgeHours={readingAgeHours} readingSuspect={readingSuspect} embedded />
    {isPending ? <><p role="status" className="mt-3 text-sm text-neutral-600">Loading dam details…</p><Skeleton className="mt-2 h-8" /></> : <>
      <p role="status" className="mt-3 text-sm text-neutral-600">Dam details are unavailable right now.</p>
      <Button variant="outline" className="mt-3" onClick={() => void refetch()}>Try again</Button>
    </>}
  </div>;
}
