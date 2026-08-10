// src/app/api/rivers/[slug]/services/route.ts
// GET /api/rivers/[slug]/services - Get nearby services directory for a river

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';
import { parseNpsImages, parseJsonish } from '@/lib/services/npsCampground';
import { loadAvailability } from '@/lib/camping/read';

export const dynamic = 'force-dynamic';

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // Rate limit: 60 requests per IP per minute
    const rateLimitResult = await rateLimit(`services:${getClientIp(request)}`, 60, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const { slug } = await params;
    const supabase = await createClient();

    // Get river ID
    // `state` is selected for the synthetic NPS campground rows below, which
    // used to hardcode 'MO' — see the comment there.
    const { data: river, error: riverError } = await supabase
      .from('rivers')
      .select('id, state')
      .eq('slug', slug)
      .single();

    if (riverError || !river) {
      return NextResponse.json(
        { error: 'River not found' },
        { status: 404 }
      );
    }

    // Get services linked to this river via service_rivers join table
    const { data: links, error: linksError } = await supabase
      .from('service_rivers')
      .select(`
        is_primary,
        section_description,
        nearby_services (
          id, name, slug, type,
          phone, phone_toll_free, email, website,
          address_line1, city, state, zip,
          latitude, longitude, geocode_precision,
          description, services_offered, seasonal_notes,
          nps_authorized, usfs_authorized,
          status, display_order,
          managing_agency, reservation_url, booking_platform,
          tent_sites, rv_sites, cabin_count, max_guests,
          fee_range, season_open_month, season_close_month, details
        )
      `)
      .eq('river_id', river.id)
      .order('is_primary', { ascending: false });

    if (linksError) {
      console.error('Error fetching nearby services:', linksError);
      return NextResponse.json(
        { error: 'Could not fetch nearby services' },
        { status: 500 }
      );
    }

    // One read for the whole page. Cached rows only — a river page render never
    // reaches an upstream booking system, which is what keeps Eddy's outbound
    // traffic bounded by the nightly cron rather than by its own popularity.
    const availability = await loadAvailability(supabase);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const services = (links || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((link: any) => link.nearby_services !== null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => {
        const orderA = a.nearby_services?.display_order ?? 999;
        const orderB = b.nearby_services?.display_order ?? 999;
        return orderA - orderB;
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((link: any) => {
        const s = link.nearby_services;
        return {
          id: s.id,
          name: s.name,
          slug: s.slug,
          type: s.type,
          phone: s.phone,
          phoneTollFree: s.phone_toll_free,
          email: s.email,
          website: s.website,
          addressLine1: s.address_line1,
          city: s.city,
          state: s.state,
          zip: s.zip,
          // How much to trust the coordinates, so a surface can decide for
          // itself. A map pin must be right to a few hundred metres; a
          // ten-mile "stays nearby" box does not care which end of town it
          // starts from. Null pre-dates the column and stays trusted, so the
          // thirteen services already on the map do not silently vanish.
          geocodePrecision: (s as { geocode_precision?: string }).geocode_precision ?? null,
          latitude: s.latitude,
          longitude: s.longitude,
          description: s.description,
          servicesOffered: s.services_offered || [],
          seasonalNotes: s.seasonal_notes,
          npsAuthorized: s.nps_authorized,
          usfsAuthorized: s.usfs_authorized,
          status: s.status,
          displayOrder: s.display_order,
          managingAgency: s.managing_agency || null,
          reservationUrl: s.reservation_url || null,
          bookingPlatform: s.booking_platform || null,
          tentSites: s.tent_sites || null,
          rvSites: s.rv_sites || null,
          cabinCount: s.cabin_count || null,
          maxGuests: s.max_guests || null,
          feeRange: s.fee_range || null,
          seasonOpenMonth: s.season_open_month || null,
          seasonCloseMonth: s.season_close_month || null,
          details: s.details || {},
          isPrimary: link.is_primary,
          sectionDescription: link.section_description,
          availability: availability.byNearbyServiceId.get(s.id) ?? null,
        };
      });

    // Also fetch NPS campgrounds linked via access_points for this river
    const { data: npsAccessPoints } = await supabase
      .from('access_points')
      .select('nps_campground_id')
      .eq('river_id', river.id)
      .not('nps_campground_id', 'is', null);

    const npsIds = (npsAccessPoints || [])
      .map(ap => ap.nps_campground_id)
      .filter((id): id is string => !!id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const npsCampgrounds: any[] = [];
    if (npsIds.length > 0) {
      const { data: campgrounds } = await supabase
        .from('nps_campgrounds')
        .select('id, name, nps_url, reservation_url, latitude, longitude, total_sites, sites_reservable, sites_first_come, fees, amenities, classification, images')
        .in('id', npsIds);

      for (const cg of campgrounds || []) {
        // Skip if already represented in nearby_services by name
        const alreadyListed = services.some(
          (s: { name: string }) => s.name.toLowerCase().includes(cg.name.toLowerCase().replace(/ campground$/i, ''))
        );
        if (alreadyListed) continue;

        const feesData = parseJsonish<Array<{ cost?: string | number }>>(cg.fees) ?? [];
        const firstFee = feesData[0];
        const feeNote = firstFee ? `$${firstFee.cost}/night` : null;

        // Build amenities list from NPS data
        const amenitiesObj = parseJsonish<{ potableWater?: string[] }>(cg.amenities) ?? {};
        const offeredServices: string[] = ['camping_primitive'];
        if (Array.isArray(amenitiesObj.potableWater) && amenitiesObj.potableWater.some((v) => v !== 'No')) {
          offeredServices.push('showers');
        }

        npsCampgrounds.push({
          id: cg.id,
          name: cg.name,
          slug: cg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
          type: 'campground',
          phone: null,
          phoneTollFree: null,
          email: null,
          website: cg.reservation_url || cg.nps_url || null,
          addressLine1: null,
          city: null,
          // The river's state, not 'MO'. Eddy carried only Missouri rivers when
          // this block was written; it now carries Arkansas ones, and eleven
          // Buffalo National River campgrounds were reaching the directory
          // labelled Missouri. A campground has no town of its own here — that
          // is why city is null — but the state is knowable and was being
          // asserted rather than read.
          state: river.state ?? null,
          zip: null,
          latitude: cg.latitude,
          longitude: cg.longitude,
          description: null,
          servicesOffered: offeredServices,
          seasonalNotes: feeNote ? `${cg.total_sites || 0} sites \u00B7 ${feeNote}` : `${cg.total_sites || 0} sites`,
          npsAuthorized: true,
          usfsAuthorized: false,
          status: 'active',
          displayOrder: 900,
          managingAgency: 'NPS',
          reservationUrl: cg.reservation_url || null,
          bookingPlatform: 'recreation_gov',
          tentSites: null,
          rvSites: null,
          cabinCount: null,
          maxGuests: null,
          feeRange: null,
          seasonOpenMonth: null,
          seasonCloseMonth: null,
          details: {
            images: parseNpsImages(cg.images),
          },
          isPrimary: false,
          sectionDescription: null,
          availability: availability.byNpsCampgroundId.get(cg.id) ?? null,
          isNpsCampground: true,
          totalSites: cg.total_sites,
          sitesReservable: cg.sites_reservable,
          sitesFirstCome: cg.sites_first_come,
        });
      }
    }

    return NextResponse.json({ services: [...services, ...npsCampgrounds] }, { headers: cdnCacheHeaders(300, 3600) });
  } catch (error) {
    console.error('Error in services endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route<{ params: Promise<{ slug: string }> }>(_GET, '/api/rivers/:slug/services');
