import ConditionsLayout from './ConditionsLayout';
import { pageDamSummaries, pageRivers } from '@/lib/data/public-pages';
import { conditionsDamCatalogue } from '@/lib/conditions/dam-catalogue';
import type { ConditionsKind } from '@/lib/conditions/directory';

export default async function ConditionsPage({ defaultKind = 'all' }: { defaultKind?: ConditionsKind }) {
  const [riverResult, damResult] = await Promise.allSettled([pageRivers(), pageDamSummaries()]);
  const rivers = riverResult.status === 'fulfilled' ? riverResult.value : [];
  const catalogue = conditionsDamCatalogue(damResult.status === 'fulfilled' ? damResult.value : []);
  return <ConditionsLayout rivers={rivers} {...catalogue} renderedAt={Date.now()} defaultKind={defaultKind} />;
}
