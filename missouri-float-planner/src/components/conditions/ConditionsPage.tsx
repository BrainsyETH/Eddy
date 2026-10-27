import { unstable_cache } from 'next/cache';
import ConditionsLayout from './ConditionsLayout';
import { pageRivers } from '@/lib/data/public-pages';
import { refreshStaleness, summaryOf } from '@/lib/data/dams';
import { readStoredSnapshots } from '@/lib/data/dam-snapshot-store';
import { conditionsDamCatalogue } from '@/lib/conditions/dam-catalogue';
import type { ConditionsKind } from '@/lib/conditions/directory';

// Separate from the river snapshot's 60-second cache. This affects only these
// web directory pages; /api/dams and its iOS consumers keep their contract.
// Do not make the combined landing page wait for live upstream dam feeds.
// The normal /api/dams client refresh fills gaps after the catalogue renders.
const pageDamSummaries = unstable_cache(async () => {
  const now = Date.now();
  const stored = await readStoredSnapshots({ now });
  return [...stored.values()].flatMap(snapshot => {
    const summary = summaryOf(refreshStaleness(snapshot, now));
    return summary ? [summary] : [];
  });
}, ['conditions-dam-summaries-v1'], { revalidate: 300 });

export default async function ConditionsPage({ defaultKind = 'all' }: { defaultKind?: ConditionsKind }) {
  const [riverResult, damResult] = await Promise.allSettled([pageRivers(), pageDamSummaries()]);
  const rivers = riverResult.status === 'fulfilled' ? riverResult.value : [];
  const catalogue = conditionsDamCatalogue(damResult.status === 'fulfilled' ? damResult.value : []);
  return <ConditionsLayout rivers={rivers} {...catalogue} renderedAt={Date.now()} defaultKind={defaultKind} />;
}
