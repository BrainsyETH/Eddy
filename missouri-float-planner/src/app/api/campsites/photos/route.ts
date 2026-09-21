import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { fetchFacilityPhotos, type CampsitePhoto } from '@/lib/camping/photos';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = await rateLimit(`campsite-photos:${getClientIp(request)}`, 30, 60_000);
  if (limited) return limited;
  const facilityId = request.nextUrl.searchParams.get('facility');
  if (!facilityId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(facilityId)) {
    return NextResponse.json({ error: 'facility must be an id' }, { status: 400 });
  }
  try {
    const db = await createClient();
    const { data: facility, error } = await db.from('campsite_facilities')
      .select('source, source_facility_id').eq('id', facilityId).eq('enabled', true).maybeSingle();
    if (error) throw error;
    if (!facility) return NextResponse.json({ error: 'Unknown facility' }, { status: 404 });
    const photos: Record<string, CampsitePhoto[]> = {};
    if (facility.source === 'recreation_gov') {
      const key = process.env.RIDB_API_KEY;
      if (!key) return NextResponse.json({ error: 'Photos unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
      const upstream = await fetchFacilityPhotos(facility.source_facility_id, key);
      // Join only verified provider IDs to Eddy IDs; never match names/numbers.
      for (let offset = 0; ; offset += 900) {
        const { data: sites, error: siteError } = await db.from('campsite_sites')
          .select('id, source_site_id').eq('facility_id', facilityId).order('id').range(offset, offset + 899);
        if (siteError) throw siteError;
        for (const site of sites ?? []) {
          if (upstream[site.source_site_id]) photos[site.id] = upstream[site.source_site_id];
        }
        if (!sites || sites.length < 900) break;
      }
    }
    return NextResponse.json({ facilityId, photos }, { headers: cdnCacheHeaders(3600, 86400) });
  } catch {
    // Avoid logging provider request objects (which contain the API credential).
    console.warn('[api/campsites/photos] media unavailable');
    return NextResponse.json({ error: 'Photos unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
