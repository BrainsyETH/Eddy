import { CONDITION_ORDER, type ConditionCode } from '@shared/condition-system';

export interface RiverMapSearch {
  river: string | null;
  gauge: string | null;
  conditions: ConditionCode[];
}

export function readRiverMapSearch(search: string): RiverMapSearch {
  const params = new URLSearchParams(search);
  const river = params.get('river') || null;
  const codes = new Set((params.get('conditions') ?? '').split(','));
  return {
    river,
    gauge: river ? null : params.get('gauge') || null,
    conditions: CONDITION_ORDER.filter(code => codes.has(code)),
  };
}

/** Keep unrelated query state; a selection owns either a river or a gauge. */
export function writeRiverMapSearch(search: string, patch: Partial<RiverMapSearch>): string {
  const params = new URLSearchParams(search);
  if (patch.river) params.delete('gauge');
  if (patch.gauge) params.delete('river');
  for (const key of ['river', 'gauge'] as const) {
    if (patch[key] === undefined) continue;
    if (patch[key]) params.set(key, patch[key]);
    else params.delete(key);
  }
  if (patch.conditions) {
    const codes = CONDITION_ORDER.filter(code => patch.conditions!.includes(code));
    if (codes.length) params.set('conditions', codes.join(','));
    else params.delete('conditions');
  }
  return params.toString();
}
