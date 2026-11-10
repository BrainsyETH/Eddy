import type { NextRequest } from 'next/server';
import {
  getAdminIdentity,
  logAdminAction,
  requireAdminAuth,
  isValidUUID,
} from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
const records: Record<string, { table: string; columns: string }> = {
  'access-points': {
    table: 'access_points',
    columns:
      'id,name,description,image_urls,approved,is_float_endpoint,river_id,river_mile_downstream,location_orig,updated_at',
  },
  pois: {
    table: 'points_of_interest',
    columns: 'id,name,description,type,active,latitude,longitude,river_id',
  },
  hazards: {
    table: 'river_hazards',
    columns: 'id,name,description,type,active',
  },
  reports: {
    table: 'community_reports',
    columns:
      'id,status,description,image_url,image_path,verified_by,verified_at,updated_at',
  },
  rivers: {
    table: 'rivers',
    columns: 'id,name,active,description,float_summary,float_tip',
  },
  gauges: {
    table: 'gauge_stations',
    columns: 'id,name,active,threshold_descriptions,notes',
  },
  'lake-launches': {
    table: 'lake_launches',
    columns:
      'id,name,approved,launch_methods,amenities,access_point_id,review_note,updated_at',
  },
};
/** Request outcomes and bounded record snapshots; credentials and uploads never enter the log. */
export function withAdminMutation<Args extends unknown[]>(
  handler: (request: NextRequest, ...args: Args) => Promise<Response>,
) {
  return async (request: NextRequest, ...args: Args): Promise<Response> => {
    const denied = await requireAdminAuth(request);
    if (denied) return denied;
    const path = request.nextUrl.pathname.split('/');
    const source = records[path[3]];
    const ids: string[] = [];
    if (source && isValidUUID(path[4] ?? '')) ids.push(path[4]);
    else if (
      source &&
      request.headers.get('content-type')?.includes('application/json')
    ) {
      const body = await request
        .clone()
        .json()
        .catch(() => null);
      if (Array.isArray(body?.ids))
        ids.push(
          ...body.ids
            .filter(
              (id: unknown): id is string =>
                typeof id === 'string' && isValidUUID(id),
            )
            .slice(0, 200),
        );
    }
    const snapshot = async () => {
      if (!source || !ids.length) return { state: 'not_applicable' };
      try {
        const { data, error } = await createAdminClient()
          .from(source.table)
          .select(source.columns)
          .in('id', ids)
          .abortSignal(AbortSignal.timeout(2000));
        return error
          ? { state: 'unavailable' }
          : { state: 'ok', records: data };
      } catch {
        return { state: 'unavailable' };
      }
    };
    const before = await snapshot();
    try {
      const response = await handler(request, ...args);
      if (getAdminIdentity(request)) {
        const after = await snapshot();
        const audit = await logAdminAction({
          request,
          action: 'request',
          entityType: 'admin_request',
          entityName: `${request.method} ${request.nextUrl.pathname}`,
          details: {
            outcome:
              response.status === 207
                ? 'partial'
                : response.ok
                  ? 'completed'
                  : response.status === 403
                    ? 'denied'
                    : 'failed',
            httpStatus: response.status,
            before,
            after,
          },
        });
        if (
          !audit.ok ||
          before.state === 'unavailable' ||
          after.state === 'unavailable'
        )
          response.headers.set('X-Admin-Audit', 'unavailable');
      }
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    } catch (error) {
      if (getAdminIdentity(request))
        await logAdminAction({
          request,
          action: 'request',
          entityType: 'admin_request',
          entityName: `${request.method} ${request.nextUrl.pathname}`,
          details: { outcome: 'failed', before },
        });
      throw error;
    }
  };
}
