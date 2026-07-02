import { NextResponse } from 'next/server';
import { fetchMODataset } from '@/lib/usgs/mo-statewide-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await fetchMODataset();
    return NextResponse.json(data, {
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
