import type { CampingOverview } from '@eddy/types';

/** Load both windows together so a slow short request cannot delay the schedule. */
export async function loadCampingWindow({ nights, hasFullSnapshot, fetchWindow, publish }: {
  nights: 21 | 90;
  hasFullSnapshot: () => boolean;
  fetchWindow: (nights: 21 | 90) => Promise<CampingOverview>;
  publish: (data: CampingOverview) => void;
}) {
  if (nights === 90 && !hasFullSnapshot()) {
    let fullPublished = false;
    const initial = fetchWindow(21).then(data => {
      // The caller merges with disk data; a late short response must never
      // replace the full network result or hold up its loading state.
      if (!fullPublished) publish(data);
    }).catch(() => {});
    try {
      const full = await fetchWindow(90);
      fullPublished = true;
      publish(full);
    } catch (error) {
      // Keep a usable short result when only the long request fails.
      await initial;
      throw error;
    }
    return;
  }
  publish(await fetchWindow(nights));
}
