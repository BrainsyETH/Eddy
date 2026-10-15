import { useCallback, useEffect, useState } from 'react';
import { fetchBlogPosts } from '@/api/client';
import { selectRiverGuides, type RiverGuideSummary } from '@/lib/riverGuides';

export function useRiverGuides(refreshRevision = 0) {
  const [guides, setGuides] = useState<RiverGuideSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizes the public blog index.
    setLoading(true);
    void fetchBlogPosts(controller.signal).then(posts => {
      if (controller.signal.aborted) return;
      setGuides(selectRiverGuides(posts));
      setError(false);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [revision, refreshRevision]);
  return { guides, error, loading, refresh };
}
