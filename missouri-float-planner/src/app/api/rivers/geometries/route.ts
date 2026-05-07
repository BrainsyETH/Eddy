// src/app/api/rivers/geometries/route.ts
// GET /api/rivers/geometries — every river's geometry + current condition,
// in a single batch. Used by the /plan overview map to render all rivers at once.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';
import { mapConditionCode } from '@/lib/conditions';
import type { ConditionCode } from '@/types/api';

export const dynamic = 'force-dynamic';

interface RiverGeometryItem {
  id: string;
  slug: string;
  name: string;
  geometry: GeoJSON.LineString;
  smoothedGeometry: GeoJSON.LineString | null;
  conditionCode: ConditionCode;
}

export interface RiverGeometriesResponse {
  rivers: RiverGeometryItem[];
}

const EMPTY_LINE: GeoJSON.LineString = { type: 'LineString', coordinates: [] };

async function _GET(request: NextRequest) {
  try {
    const rl = rateLimit(`rivers-geometries:${getClientIp(request)}`, 60, 60 * 1000);
    if (rl) return rl;

    const supabase = createAdminClient();

    const { data: rivers, error } = await supabase
      .from('rivers')
      .select('id, name, slug, geom, smoothed_geometries')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching river geometries:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Fetch current condition per river in parallel via the existing RPC
    const conditions = await Promise.all(
      (rivers || []).map(async (r) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase.rpc as any)('get_river_condition', {
            p_river_id: r.id,
          });
          const raw = data?.[0]?.condition_code as string | undefined;
          return raw ? mapConditionCode(raw) : ('unknown' as ConditionCode);
        } catch {
          return 'unknown' as ConditionCode;
        }
      }),
    );

    const items: RiverGeometryItem[] = (rivers || []).map((r, i) => {
      const geom = (r.geom && typeof r.geom === 'object' && 'type' in r.geom)
        ? (r.geom as GeoJSON.LineString)
        : EMPTY_LINE;
      const smoothed = (r.smoothed_geometries && typeof r.smoothed_geometries === 'object' && 'type' in (r.smoothed_geometries as object))
        ? (r.smoothed_geometries as unknown as GeoJSON.LineString)
        : null;
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        geometry: geom,
        smoothedGeometry: smoothed,
        conditionCode: conditions[i],
      };
    });

    const response: RiverGeometriesResponse = { rivers: items };
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    console.error('Error in /api/rivers/geometries:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withX402Route(_GET, '$0.005', 'All-river geometries with current conditions');
