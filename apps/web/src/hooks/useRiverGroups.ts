// src/hooks/useRiverGroups.ts
// React hook combining useGaugeStations with river grouping utility

import { useMemo } from 'react';
import { useGaugeStations } from '@/hooks/useGaugeStations';
import { groupGaugesByRiver, findRiverGroupBySlug } from '@/lib/river-groups';

export function useRiverGroups() {
  const { data: gauges, isLoading, error } = useGaugeStations();

  const riverGroups = useMemo(
    () => (gauges ? groupGaugesByRiver(gauges) : []),
    [gauges]
  );

  return { riverGroups, isLoading, error };
}

export function useRiverGroup(slug: string | null) {
  const { riverGroups, isLoading, error } = useRiverGroups();

  const riverGroup = useMemo(
    () => (slug ? findRiverGroupBySlug(riverGroups, slug) : null),
    [riverGroups, slug]
  );

  return { riverGroup, isLoading, error };
}
