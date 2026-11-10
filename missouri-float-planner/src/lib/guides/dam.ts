import { USACE_DAMS, hasPowerhouse } from '@/lib/flow-providers/usace-registry';

export interface GuideDam { id: string; name: string; hydro: boolean }

/** The dam whose releases control this river, read from the static registry.
 * No fetch: a guide page must render the same whether or not dam data loads. */
export function guideDam(riverSlug: string): GuideDam | null {
  const dam = Object.values(USACE_DAMS).find(entry => entry.tailwater?.riverSlug === riverSlug);
  return dam ? { id: dam.id, name: dam.name, hydro: hasPowerhouse(dam) } : null;
}
