// src/app/api/rivers/[slug]/services/route.ts
// GET /api/rivers/[slug]/services - Get nearby services directory for a river

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
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
          status, display_order
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
          isPrimary: link.is_primary,
          sectionDescription: link.section_description,
        };
      });

    return NextResponse.json({ services });
  } catch (error) {
    console.error('Error in services endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
