// src/lib/embed/dam-data.ts
// Server-side read for the dam embed: the hourly-assembled snapshot the API
// and the iOS widget read, re-banded against the request clock. Nothing here
// is computed that shared/dam-widget.ts and shared/dam-generation.ts do not
// already compute for the phone — the web widget is the same packet drawn in
// HTML, so a schedule bar can never disagree between the two.

import 'server-only';
import { unstable_cache } from 'next/cache';
import { getUsaceDam, hasPowerhouse } from '@/lib/flow-providers/usace-registry';
import { refreshStaleness } from '@/lib/data/dams';
import { pageDam } from '@/lib/data/public-pages';
import { readStoredSnapshot } from '@/lib/data/dam-snapshot-store';
import type { DamSnapshot } from '@shared/dam-types';

const readDam = unstable_cache(
  async (damId: string): Promise<DamSnapshot | null> => {
    const stored = await readStoredSnapshot(damId, { now: Date.now() });
    if (stored) return stored;
    return (await pageDam(damId)) ?? null;
  },
  ['embed-dam-v1'],
  { revalidate: 60 },
);

export interface DamEmbedData {
  dam: DamSnapshot;
  /** Registry truth, not the row: a flood-control project has no widget. */
  powerhouse: boolean;
  tailwaterFishery: 'trout' | 'warmwater' | null;
  assembledAt: number;
}

export async function loadDamEmbed(damId: string): Promise<DamEmbedData | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(damId)) return null;
  const registry = getUsaceDam(damId);
  if (!registry) return null;
  const snapshot = await readDam(damId);
  if (!snapshot) return null;
  const now = Date.now();
  return {
    dam: refreshStaleness(snapshot, now),
    powerhouse: hasPowerhouse(registry),
    tailwaterFishery: registry.tailwaterFishery ?? null,
    assembledAt: now,
  };
}
