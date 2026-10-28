import { useEffect, useMemo, useState } from 'react';
import type { MapAccessPoint, RiverListItem } from '@eddy/types';
import { fetchRiverAccessPoints, fetchRivers } from '@/api/client';
import { agedIndex, readBestIndex, readRiver } from '@/lib/riverCache';
import { useStarredRivers } from './useStarredRivers';
import { floatableRank } from '@/theme/conditions';
import { loadPlannerResource } from '@/lib/plannerResource';

const NO_POINTS: MapAccessPoint[] = [];

/** A standalone planner needs the river index and endpoints, not map layers or geometry. */
export function usePlannerData(initialRiver?: string) {
  const [slug, setSlug] = useState<string | null>(initialRiver ?? null);
  const [revision, setRevision] = useState(0);
  const [index, setIndex] = useState<{ rows: RiverListItem[]; loading: boolean; error: string | null }>({
    rows: [],
    loading: true,
    error: null,
  });
  const [access, setAccess] = useState<{
    slug: string;
    points: MapAccessPoint[];
    error: string | null;
    settled: boolean;
  } | null>(null);
  const { isStarred } = useStarredRivers();
  useEffect(() => {
    const controller = new AbortController();
    void loadPlannerResource({
      readCached: async () => {
        const cached = await readBestIndex();
        return cached ? agedIndex(cached, Date.now()) : null;
      },
      fetchFresh: fetchRivers,
      signal: controller.signal,
      publish: (rows, error) => setIndex({ rows: rows ?? [], loading: false, error }),
      errorMessage: 'Could not load rivers.',
    });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    void loadPlannerResource({
      readCached: async () => (await readRiver(slug))?.payload.accessPoints,
      fetchFresh: (signal) => fetchRiverAccessPoints(slug, signal),
      signal: controller.signal,
      publish: (points, error, settled) => setAccess({ slug, points: points ?? [], error, settled }),
      errorMessage: 'Could not load access points. Check your connection and try again.',
    });
    return () => controller.abort();
  }, [slug, revision]);
  const rivers = useMemo(
    () =>
      [...index.rows].sort(
        (a, b) =>
          Number(isStarred('river', b.id)) - Number(isStarred('river', a.id)) ||
          floatableRank(a.currentCondition?.code ?? 'unknown') -
            floatableRank(b.currentCondition?.code ?? 'unknown') ||
          a.name.localeCompare(b.name),
      ),
    [index.rows, isStarred],
  );
  return {
    slug,
    setSlug,
    rivers,
    river: rivers.find((river) => river.slug === slug) ?? null,
    riversLoading: index.loading,
    riversError: index.error,
    accessPoints: access?.slug === slug ? access.points : NO_POINTS,
    accessLoading: !!slug && access?.slug !== slug,
    accessError: access?.slug === slug ? access.error : null,
    /** No newer access list is coming for this river (see loadPlannerResource). */
    accessSettled: access?.slug === slug && access.settled,
    retry: () => {
      setIndex((current) => ({ ...current, loading: current.rows.length === 0, error: null }));
      setAccess(null);
      setRevision((value) => value + 1);
    },
  };
}
