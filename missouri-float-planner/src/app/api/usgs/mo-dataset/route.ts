import { NextResponse } from 'next/server';
import { fetchMODataset } from '@/lib/usgs/mo-statewide-data';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const data = await fetchMODataset();

    // ?slim=1 — geometry + gauges only. The interactive map's condition
    // network (and the plan page's float window) need river lines and
    // gauge thresholds, not the per-river access points / POIs /
    // campgrounds the Observatory ships. Stripping them cuts the payload
    // substantially for layers that load on every planner visit.
    const slim = new URL(request.url).searchParams.get('slim') === '1';
    const body = slim
      ? {
          ...data,
          campgrounds: [],
          rivers: data.rivers.map((r) => ({
            ...r,
            access_points: null,
            pois: null,
          })),
        }
      : data;

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' },
    });
  } catch (e) {
    console.error('[usgs/mo-dataset] Error:', e);
    return NextResponse.json(
      { error: 'Failed to load dataset' },
      { status: 500 },
    );
  }
}
