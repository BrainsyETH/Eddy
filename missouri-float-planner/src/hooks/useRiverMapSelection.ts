'use client';

import { useCallback, useMemo, type SetStateAction } from 'react';
import { useSearchParams } from 'next/navigation';
import { type ConditionCode } from '@shared/condition-system';
import { readRiverMapSearch, writeRiverMapSearch, type RiverMapSearch } from '@/lib/navigation/river-map-search';

function replaceSelection(patch: Partial<RiverMapSearch>) {
  const query = writeRiverMapSearch(window.location.search, patch);
  const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  // Next's native-history integration updates useSearchParams without fetching
  // the page again. Read the live URL so consecutive actions cannot lose state.
  window.history.replaceState(null, '', next);
}

/** The URL is the selection source: loading data never overwrites a deep link. */
export function useRiverMapSelection(
  rivers: readonly { id: string; slug: string }[],
  gauges: readonly { site_no: string }[],
) {
  const search = useSearchParams().toString();
  const selection = useMemo(() => readRiverMapSearch(search), [search]);
  const focusedRiverId = rivers.find(river => river.slug === selection.river)?.id ?? null;
  const focusedGaugeId = gauges.some(gauge => gauge.site_no === selection.gauge) ? selection.gauge : null;
  const conditionFilter = useMemo(() => new Set(selection.conditions), [selection]);
  const setFocusedRiverId = useCallback((id: string | null) => {
    replaceSelection({ river: rivers.find(river => river.id === id)?.slug ?? null });
  }, [rivers]);
  const setFocusedGaugeId = useCallback((id: string | null) => replaceSelection({ gauge: id }), []);
  const setConditionFilter = useCallback((action: SetStateAction<Set<ConditionCode>>) => {
    const previous = new Set(readRiverMapSearch(window.location.search).conditions);
    const next = typeof action === 'function' ? action(previous) : action;
    replaceSelection({ conditions: [...next] });
  }, []);
  return { focusedRiverId, setFocusedRiverId, focusedGaugeId, setFocusedGaugeId, conditionFilter, setConditionFilter };
}
