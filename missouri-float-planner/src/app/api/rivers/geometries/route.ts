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
      .select('id, name, slug, smoothed_geometries')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching rivers list:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // PostGIS geometry columns don't auto-serialize to GeoJSON — use the same
    // RPC the per-river endpoint uses. Fan out across rivers in parallel.
    const enriched = await Promise.all(
      (rivers || []).map(async (r) => {
        let geometry: GeoJSON.LineString = EMPTY_LINE;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: geomData } = await (supabase.rpc as any)('get_river_geometry_json', {
            p_slug: r.slug,
          });
          if (geomData) {
            const parsed = typeof geomData === 'string' ? JSON.parse(geomData) : geomData;
            if (parsed?.type === 'LineString' && Array.isArray(parsed.coordinates)) {
              geometry = parsed as GeoJSON.LineString;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch geometry for ${r.slug}:`, err);
        }

        let conditionCode: ConditionCode = 'unknown';
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: condData } = await (supabase.rpc as any)('get_river_condition', {
            p_river_id: r.id,
          });
          const raw = condData?.[0]?.condition_code as string | undefined;
          if (raw) conditionCode = mapConditionCode(raw);
        } catch {
          // leave as 'unknown'
        }

        const smoothed = (r.smoothed_geometries && typeof r.smoothed_geometries === 'object' && 'type' in (r.smoothed_geometries as object))
          ? (r.smoothed_geometries as unknown as GeoJSON.LineString)
          : null;

        return {
          id: r.id,
          slug: r.slug,
          name: r.name,
          geometry,
          smoothedGeometry: smoothed,
          conditionCode,
        };
      }),
    );

    const items: RiverGeometryItem[] = enriched;

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
