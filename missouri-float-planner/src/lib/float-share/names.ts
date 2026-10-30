// src/lib/float-share/names.ts
// The names a float share image draws, resolved from the ids in its query.
//
// The query never carries free text (shared/float-share.ts), so every word on
// the image about the river and its access points comes from here: the river
// by slug, and each access point by id, only if it is approved and on that
// river. Anything that does not resolve is the caller's 400, never a guess.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FloatShareState } from '@shared/float-share';
import { riverPath } from '@/lib/navigation/river-path';

export interface FloatShareNames {
  /** The river's row id, for the condition check (verify.ts). */
  riverId: string;
  riverName: string;
  /** The river's eddy.guide page, the link that travels with the image. */
  riverPath: string;
  putInName: string | null;
  takeOutName: string;
}

/** Thrown for a failed read, which is a 503, not a bad link. */
export class FloatShareReadError extends Error {}

export async function loadFloatShareNames(db: SupabaseClient, state: FloatShareState): Promise<FloatShareNames | null> {
  const { data: river, error: riverError } = await db
    .from('rivers')
    .select('id,name,slug,state')
    .eq('slug', state.riverSlug)
    .maybeSingle();
  if (riverError) throw new FloatShareReadError('Could not read the river');
  if (!river) return null;

  const ids = state.putInId ? [state.putInId, state.takeOutId] : [state.takeOutId];
  const { data: points, error: pointError } = await db
    .from('access_points')
    .select('id,name,river_id,approved')
    .in('id', ids);
  if (pointError) throw new FloatShareReadError('Could not read the access points');
  const named = (id: string) => {
    const point = (points ?? []).find((p: { id: string }) => p.id === id) as
      | { name: string; river_id: string | null; approved: boolean | null }
      | undefined;
    return point && point.approved === true && point.river_id === river.id && point.name ? point.name : null;
  };
  const takeOutName = named(state.takeOutId);
  const putInName = state.putInId ? named(state.putInId) : null;
  if (!takeOutName || (state.putInId && !putInName)) return null;
  return {
    riverId: river.id,
    riverName: river.name,
    riverPath: riverPath(river.state || 'MO', river.slug),
    putInName,
    takeOutName,
  };
}
