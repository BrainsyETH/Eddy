// Shared-plan metadata uses the same public share-code RPC as the plan API.
// Preview reads never increment views, and transient failures are not 404s.
import type { Metadata } from 'next';
import { createPublicReadClient } from '@/lib/supabase/public-read';
import { sharedPlanMetadata } from '@/lib/og/shared-plan-metadata';
import { savedPlanLookupStatus } from '@/lib/shared-plan-load';

interface PlanLayoutProps {
  children: React.ReactNode;
  params: Promise<{ shortCode: string }>;
}

export async function generateMetadata({ params }: PlanLayoutProps): Promise<Metadata> {
  const { shortCode } = await params;
  try {
    const supabase = createPublicReadClient();
    // The generated DB types predate this RPC (migration 00184).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase.rpc as any)(
      'get_float_plan_by_code', { p_short_code: shortCode, p_increment_view: false },
    );
    const status = savedPlanLookupStatus(rows, error);
    if (status !== 200) return sharedPlanMetadata(shortCode, status === 404 ? 'not-found' : 'unavailable');
    const plan = rows[0];
    const [river, putIn, takeOut] = await Promise.all([
      supabase.from('rivers').select('name').eq('id', plan.river_id ?? '').single(),
      supabase.from('access_points').select('name').eq('id', plan.start_access_id ?? '').single(),
      supabase.from('access_points').select('name').eq('id', plan.end_access_id ?? '').single(),
    ]);
    if (river.error || putIn.error || takeOut.error) return sharedPlanMetadata(shortCode, 'unavailable');
    return sharedPlanMetadata(shortCode, {
      river: river.data.name, putIn: putIn.data.name, takeOut: takeOut.data.name,
      distance_miles: plan.distance_miles,
      estimated_float_min_minutes: plan.estimated_float_min_minutes,
      estimated_float_max_minutes: plan.estimated_float_max_minutes,
    });
  } catch {
    return sharedPlanMetadata(shortCode, 'unavailable');
  }
}

export default function PlanLayout({ children }: PlanLayoutProps) {
  return children;
}
