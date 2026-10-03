import { loadPageAlerts } from './page-alerts';
import { publicRouteSegment } from '@/lib/calculations/public-segment';
import { getActiveRiverContextsStrict } from '@/lib/rivers/context';
import { getRiverAlerts } from '@/lib/alerts/river-alerts';
import { unstable_cache } from 'next/cache';
import { createPublicReadClient } from '@/lib/supabase/public-read';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRivers } from './rivers';
import { fetchDamDetail, fetchRiverDam } from './dams';
import { fetchRiverReaches } from './river-reaches';
import { getAccessPointDetail } from '@/lib/access-points/detail';

// Public HTML snapshots only. API, auth, premium, cron and live readers keep
// their existing policies. Water-bearing snapshots use a short 60s window;
// descriptive catalog reads use 5 minutes. Original observation times survive.
export const pageRivers = unstable_cache(getRivers, ['page-rivers-v1'], { revalidate: 60 });
export const pageDam = unstable_cache(fetchDamDetail, ['page-dam-v1'], { revalidate: 60 });
export const pageRiverDam = unstable_cache(fetchRiverDam, ['page-river-dam-v1'], { revalidate: 60 });
export const pageRiverReaches = unstable_cache(fetchRiverReaches, ['page-river-reaches-v1'], { revalidate: 60 });
export const pageCondition = unstable_cache(async (id: string) => {
  const { data, error } = await createAdminClient().rpc('get_river_condition', { p_river_id: id });
  if (error) throw error;
  return data;
}, ['page-condition-v1'], { revalidate: 60 });
export const pageAccess = unstable_cache(async (river: string, access: string) =>
  getAccessPointDetail(createPublicReadClient(), river, access, { segmentReader: publicRouteSegment }),
['page-access-v2'], { revalidate: 60 });

const pageRiverContexts = unstable_cache(getActiveRiverContextsStrict, ['page-river-contexts-v1'], { revalidate: 60 });

// Cache successful context reads, not the alert providers' failure fallbacks.
export async function pageRiverAlerts(slug: string) {
  return loadPageAlerts(async () => getRiverAlerts(slug, await pageRiverContexts()));
}
