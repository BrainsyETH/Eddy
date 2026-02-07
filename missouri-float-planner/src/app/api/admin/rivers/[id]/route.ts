// src/app/api/admin/rivers/[id]/route.ts
// PUT /api/admin/rivers/[id] - Update river geometry and/or floating info

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    const body = await request.json();
    const { geometry, floatSummary, floatTip } = body;

    const supabase = createAdminClient();

    // If updating geometry
    if (geometry) {
      if (geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
        return NextResponse.json(
          { error: 'Invalid geometry format' },
          { status: 400 }
        );
      }

      // Calculate length and downstream point
      const coordinates = geometry.coordinates;
      if (coordinates.length < 2) {
        return NextResponse.json(
          { error: 'LineString must have at least 2 coordinates' },
          { status: 400 }
        );
      }

      // Calculate length using PostGIS
      const { data: lengthData, error: lengthError } = await supabase.rpc('calculate_line_length', {
        p_geojson: geometry,
      });

      let lengthMiles = 0;
      if (lengthError) {
        console.error('Error calculating length:', lengthError);
        // Fallback: estimate from coordinate count (rough approximation)
        lengthMiles = coordinates.length * 0.1; // Rough estimate
      } else {
        lengthMiles = lengthData || 0;
      }
      const downstreamPoint = {
        type: 'Point',
        coordinates: coordinates[coordinates.length - 1],
      };

      // Update river geometry
      const { data, error } = await supabase
        .from('rivers')
        .update({
          geom: geometry,
          length_miles: lengthMiles,
          downstream_point: downstreamPoint,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id, name, slug, length_miles')
        .single();

      if (error) {
        console.error('Error updating river:', error);
        return NextResponse.json(
          { error: 'Could not update river' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        river: {
          id: data.id,
          name: data.name,
          slug: data.slug,
          lengthMiles: parseFloat(data.length_miles),
          geometry,
        },
      });
    }

    // If updating float summary/tip (without geometry)
    if (floatSummary !== undefined || floatTip !== undefined) {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (floatSummary !== undefined) {
        updateData.float_summary = floatSummary || null;
      }
      if (floatTip !== undefined) {
        updateData.float_tip = floatTip || null;
      }

      const { data, error } = await supabase
        .from('rivers')
        .update(updateData)
        .eq('id', id)
        .select('id, name, slug, float_summary, float_tip')
        .single();

      if (error) {
        console.error('Error updating river:', error);
        return NextResponse.json(
          { error: 'Could not update river' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        river: {
          id: data.id,
          name: data.name,
          slug: data.slug,
          floatSummary: data.float_summary,
          floatTip: data.float_tip,
        },
      });
    }

    return NextResponse.json(
      { error: 'No valid fields to update' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in update river endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
