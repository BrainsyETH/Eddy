// src/app/api/rivers/[slug]/hazards/route.ts
// GET /api/rivers/[slug]/hazards - Get hazards for a river

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { HazardsResponse } from '@/types/api';

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

    // Get active hazards
    const { data: hazards, error: hazardsError } = await supabase
      .from('river_hazards')
      .select('*')
      .eq('river_id', river.id)
      .eq('active', true)
      .order('river_mile_downstream', { ascending: false });

    if (hazardsError) {
      console.error('Error fetching hazards:', hazardsError);
      return NextResponse.json(
        { error: 'Could not fetch hazards' },
        { status: 500 }
      );
    }

    const formattedHazards = (hazards || []).map((h) => ({
      id: h.id,
      riverId: h.river_id,
      name: h.name,
      type: h.type,
      riverMile: parseFloat(h.river_mile_downstream),
      description: h.description,
      severity: h.severity,
      portageRequired: h.portage_required,
      portageSide: h.portage_side,
      seasonalNotes: h.seasonal_notes,
      coordinates: {
        lng: h.location?.coordinates?.[0] || 0,
        lat: h.location?.coordinates?.[1] || 0,
      },
    }));

    const response: HazardsResponse = {
      hazards: formattedHazards,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in hazards endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
    }
}
