import type { CampingOverview } from '@eddy/types';

/** Publish a useful first window; its failure must not prevent the full request. */
export async function loadCampingWindow({ nights, hasFullSnapshot, fetchWindow, publish }: {
  nights: 21 | 90;
  hasFullSnapshot: () => boolean;
  fetchWindow: (nights: 21 | 90) => Promise<CampingOverview>;
  publish: (data: CampingOverview) => void;
}) {
  if (nights === 90 && !hasFullSnapshot()) {
    try {
      const initial = await fetchWindow(21);
      // A disk snapshot can arrive while the shorter network request is running.
      if (!hasFullSnapshot()) publish(initial);
    } catch { /* Try the full window, retaining any saved data. */ }
  }
  publish(await fetchWindow(nights));
}
