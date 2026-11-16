// src/lib/gauges/river-page-cache.ts
// River pages carry the current reading in their server HTML (see
// src/lib/gauge/reading-seed.ts). Their cache only regenerates when someone
// visits, so on a quiet river the first visitor after a long gap — often a
// crawler — would be handed whatever reading was current the last time anyone
// looked. The gauge syncs call this after writing, so the next request for
// any river page renders against the readings they just stored.

import { revalidatePath } from 'next/cache';

export function refreshRiverPages(): void {
  try {
    revalidatePath('/rivers/[state]/[slug]', 'page');
  } catch (error) {
    // Never the sync's problem: the pages still revalidate on their own timer.
    console.warn('[river-page-cache] could not mark river pages for refresh', error);
  }
}
