// src/app/api/rivers/[slug]/services/route.ts
// GET /api/rivers/[slug]/services - Get nearby services directory for a river

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // Rate limit: 60 requests per IP per minute
    const rateLimitResult = rateLimit(`services:${getClientIp(request)}`, 60, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const { slug } = await params;
    const supabase = await createClient();

    // Get river ID
    const { data: river, error: riverError } = await supabase
      .from('rivers')
      .select('id')
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
          latitude, longitude,
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
        .select('id, name, nps_url, reservation_url, latitude, longitude, total_sites, sites_reservable, sites_first_come, fees, amenities, classification')
        .in('id', npsIds);

      for (const cg of campgrounds || []) {
        // Skip if already represented in nearby_services by name
        const alreadyListed = services.some(
          (s: { name: string }) => s.name.toLowerCase().includes(cg.name.toLowerCase().replace(/ campground$/i, ''))
        );
        if (alreadyListed) continue;

        const feesData = typeof cg.fees === 'string' ? JSON.parse(cg.fees) : cg.fees || [];
        const firstFee = feesData[0];
        const feeNote = firstFee ? `$${firstFee.cost}/night` : null;

        // Build amenities list from NPS data
        const amenitiesObj = typeof cg.amenities === 'string' ? JSON.parse(cg.amenities) : cg.amenities || {};
        const offeredServices: string[] = ['camping_primitive'];
        if (amenitiesObj.potableWater?.some((v: string) => v !== 'No')) offeredServices.push('showers');

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
          state: 'MO',
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
          details: {},
          isPrimary: false,
          sectionDescription: null,
          isNpsCampground: true,
          totalSites: cg.total_sites,
          sitesReservable: cg.sites_reservable,
          sitesFirstCome: cg.sites_first_come,
        });
      }
    }

    return NextResponse.json({ services: [...services, ...npsCampgrounds] });
  } catch (error) {
    console.error('Error in services endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route<{ params: Promise<{ slug: string }> }>(_GET, '$0.01', 'River services data');
