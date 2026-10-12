import { NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { jsonPrivate } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;
  try {
    const page = Math.max(0, Math.min(10000, Number(request.nextUrl.searchParams.get('page')) || 0));
    const { data, error, count } = await createAdminClient()
      .from('float_archive')
      .select('payload,updated_at', { count: 'exact' })
      .eq('kind', 'completed')
      .eq('contributing', true)
      .eq('deleted', false)
      .order('updated_at', { ascending: false })
      .order('user_id')
      .order('id')
      .range(page * 50, page * 50 + 49);
    if (error) throw new Error('Review unavailable');
    return jsonPrivate({ trips: data ?? [], count: count ?? 0 });
  } catch {
    return jsonPrivate({ error: 'Could not load contributed floats' }, { status: 503 });
  }
}
