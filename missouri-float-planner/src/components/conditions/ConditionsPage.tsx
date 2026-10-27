import { unstable_cache } from 'next/cache';
import ConditionsLayout from './ConditionsLayout';
import { pageRivers } from '@/lib/data/public-pages';
import { refreshStaleness, summaryOf } from '@/lib/data/dams';
import { readStoredSnapshots } from '@/lib/data/dam-snapshot-store';
import { USACE_DAMS, hasPowerhouse } from '@/lib/flow-providers/usace-registry';
import type { DamSnapshot } from '@shared/dam-types';
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
  const readings = new Map((damResult.status === 'fulfilled' ? damResult.value : []).map(dam => [dam.id, dam]));
  // Keep searchable identities when an individual feed fails. Missing readings
  // remain absent rather than turning into zero discharge or idle generation.
  const dams: DamSnapshot[] = Object.values(USACE_DAMS).map(dam => readings.get(dam.id) ?? {
    id: dam.id, name: dam.name, lakeName: dam.lakeName, state: dam.state, lat: dam.lat, lon: dam.lon,
    hasTurbines: hasPowerhouse(dam), generating: null, metrics: {}, schedule: [], sources: [],
  });
  return <ConditionsLayout rivers={rivers} dams={dams} renderedAt={Date.now()} defaultKind={defaultKind} damsUnavailable={damResult.status === 'rejected' || readings.size < dams.length} />;
}
