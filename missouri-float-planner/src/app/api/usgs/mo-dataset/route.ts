import { NextResponse } from 'next/server';
import { fetchMODataset } from '@/lib/usgs/mo-statewide-data';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function GET() {
  try {
    const data = await fetchMODataset();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
