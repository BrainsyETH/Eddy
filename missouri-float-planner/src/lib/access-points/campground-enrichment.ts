import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { NPSCampgroundInfo } from '@/types/api';
import { toNpsCampground } from '@/lib/offline/shapes';

/** Campground enrichment is optional for both full and compact access lists. */
export async function loadCampgroundEnrichment(client: SupabaseClient<Database>, ids: string[], compact: boolean) {
  const result = new Map<string, NPSCampgroundInfo>();
  if (!ids.length) return result;
  try {
    const { data, error } = compact
      ? await client.from('nps_campgrounds').select('id, images').in('id', ids)
      : await client.from('nps_campgrounds').select('*').in('id', ids);
    if (error) throw error;
    for (const row of data ?? []) result.set(row.id, toNpsCampground(row as unknown as Record<string, unknown>));
  } catch (error) {
    console.warn('[access-points] Campground details unavailable:', error);
  }
  return result;
}
