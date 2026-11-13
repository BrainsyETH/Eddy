import { NextRequest, NextResponse } from 'next/server';
import { createPublicReadClient } from '@/lib/supabase/public-read';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { fetchRecreationSiteDetails } from '@/lib/camping/site-details';
import type { CampsiteDetailsResponse } from '../../../../../shared/campsite-details';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const limited = await rateLimit(`campsite-details:${getClientIp(request)}`, 60, 60_000, { failClosed: true });
  if (limited) return limited;
  const facilityId = request.nextUrl.searchParams.get('facility'), siteId = request.nextUrl.searchParams.get('site');
  if (!facilityId || !siteId || !uuid.test(facilityId) || !uuid.test(siteId)) {
    return NextResponse.json({ error: 'facility and site must be ids' }, { status: 400, headers: noStore });
  }
  try {
    // Public RLS reads only. A caller cannot use this endpoint to proxy arbitrary
    // provider IDs, disabled facilities, or a site from a different campground.
    const db = createPublicReadClient(), signal = AbortSignal.timeout(8000);
    const { data: facility, error } = await db.from('campsite_facilities')
      .select('source, source_facility_id').eq('id', facilityId).eq('enabled', true).abortSignal(signal).maybeSingle();
    if (error) throw error;
    if (!facility) return NextResponse.json({ error: 'Unknown facility' }, { status: 404, headers: noStore });
    const { data: site, error: siteError } = await db.from('campsite_sites')
      .select('source_site_id').eq('facility_id', facilityId).eq('id', siteId).abortSignal(signal).maybeSingle();
    if (siteError) throw siteError;
    if (!site) return NextResponse.json({ error: 'Unknown site' }, { status: 404, headers: noStore });
    const response: CampsiteDetailsResponse = { facilityId, siteId, details: facility.source === 'recreation_gov'
      ? await fetchRecreationSiteDetails(facility.source_facility_id, site.source_site_id) : null };
    return NextResponse.json(response, { headers: cdnCacheHeaders(3600, 86400) });
  } catch {
    console.warn('[api/campsites/details] details unavailable');
    return NextResponse.json({ error: 'Site details unavailable' }, { status: 503, headers: noStore });
  }
}
