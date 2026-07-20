// src/hooks/useFloatPlan.ts
// React Query hook for calculating float plans
// vesselTypeId is included in queryKey for native caching of different vessel types

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PlanResponse } from '@/types/api';
import {
  readLastValidPlan,
  samePlanIdentity,
  writeLastValidPlan,
  type CachedFloatPlan,
} from '@/lib/plan-cache';

interface PlanParams {
  riverId: string;
  startId: string;
  endId: string;
  vesselTypeId?: string;
  tripDurationDays?: number;
}

export function useFloatPlan(params: PlanParams | null) {
  const riverId = params?.riverId;
  const startId = params?.startId;
  const endId = params?.endId;
  const vesselTypeId = params?.vesselTypeId;
  const tripDurationDays = params?.tripDurationDays;
  const identity = useMemo(
    () => riverId && startId && endId
      ? { riverId, startId, endId, vesselTypeId, tripDurationDays }
      : null,
    [riverId, startId, endId, vesselTypeId, tripDurationDays]
  );
  const [cached, setCached] = useState<CachedFloatPlan | null>(null);

  useEffect(() => {
    if (!identity) {
      setCached(null);
      return;
    }
    setCached(readLastValidPlan(window.localStorage, identity));
  }, [identity]);

  const query = useQuery({
    // Include vesselTypeId explicitly in queryKey for instant vessel switching
    // TanStack Query will cache each vessel type separately
    queryKey: [
      'float-plan',
      params?.riverId,
      params?.startId,
      params?.endId,
      params?.vesselTypeId,
      params?.tripDurationDays,
    ],
    queryFn: async () => {
      if (!params) return null;
      const searchParams = new URLSearchParams({
        riverId: params.riverId,
        startId: params.startId,
        endId: params.endId,
      });
      if (params.vesselTypeId) {
        searchParams.set('vesselTypeId', params.vesselTypeId);
      }
      if (params.tripDurationDays && params.tripDurationDays > 1) {
        searchParams.set('tripDurationDays', params.tripDurationDays.toString());
      }
      const response = await fetch(`/api/plan?${searchParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to calculate float plan');
      }
      const data = (await response.json()) as PlanResponse;
      return data.plan;
    },
    enabled: !!params && !!params.riverId && !!params.startId && !!params.endId,
    // Only keep previous data if the route (startId/endId) hasn't changed
    // This prevents stale data from showing when user selects a new route
    placeholderData: (previousData, previousQuery) => {
      // Check if route changed by comparing startId and endId in queryKey
      const prevKey = previousQuery?.queryKey;
      if (!prevKey || !params) return undefined;
      const prevStartId = prevKey[2];
      const prevEndId = prevKey[3];
      // Only use placeholder if same route (different vessel type is ok)
      if (prevStartId === params.startId && prevEndId === params.endId) {
        return previousData;
      }
      return undefined;
    },
    // Stale time of 5 minutes - conditions don't change that fast
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!identity || !query.data || query.isFetching || query.isError) return;
    const saved = writeLastValidPlan(window.localStorage, identity, query.data);
    if (saved) setCached(saved);
  }, [identity, query.data, query.isFetching, query.isError]);

  const matchingCache = identity && cached && samePlanIdentity(identity, cached.identity)
    ? cached
    : null;
  // React Query can retain an earlier in-memory result when a refresh fails.
  // Treat that state as saved/fallback too; an error must never leave old
  // conditions looking like a successful live response.
  const isLastValidFallback = !!matchingCache && (!query.data || query.isError);
  const displayData = query.isError
    ? matchingCache?.plan ?? null
    : query.data ?? matchingCache?.plan ?? null;

  return {
    ...query,
    data: displayData,
    isLastValidFallback,
    lastValidAt: isLastValidFallback ? matchingCache?.savedAt ?? null : null,
  };
}
