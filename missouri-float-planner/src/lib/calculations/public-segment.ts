import { unstable_cache } from 'next/cache';
import { createPublicReadClient } from '@/lib/supabase/public-read';
import { readRouteSegment } from './route-estimate';

// Ordered endpoint IDs key only public geometry, never a condition or float time.
// Errors reject and are not stored as a successful missing route.
export const publicRouteSegment = unstable_cache(
  (startId: string, endId: string) => readRouteSegment(createPublicReadClient(), startId, endId),
  ['public-route-geometry-v1'],
  { revalidate: 300 },
);
