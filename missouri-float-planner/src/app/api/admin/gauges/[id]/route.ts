// src/app/api/admin/gauges/[id]/route.ts
// GET /api/admin/gauges/[id] - Get single gauge details
// PUT /api/admin/gauges/[id] - Update gauge descriptions and notes

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: gauge, error } = await supabase
      .from('gauge_stations')
      .select('id, usgs_site_id, name, active, threshold_descriptions, notes')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching gauge:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Gauge not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: 'Could not fetch gauge' },
        { status: 500 }
      );
    }

    // Get river associations with thresholds
    const { data: riverGauges, error: rgError } = await supabase
      .from('river_gauges')
      .select(`
        id,
        river_id,
        is_primary,
        threshold_unit,
        level_too_low,
        level_low,
        level_optimal_min,
        level_optimal_max,
        level_high,
        level_dangerous,
        distance_from_section_miles,
        accuracy_warning_threshold_miles
      `)
      .eq('gauge_station_id', id);

    if (rgError) {
      console.error('Error fetching river gauges:', rgError);
    }

    // Get river names
    const riverIds = (riverGauges || []).map(rg => rg.river_id).filter(Boolean);
    let rivers: Array<{ id: string; name: string; slug: string }> = [];

    if (riverIds.length > 0) {
      const { data: riverData } = await supabase
        .from('rivers')
        .select('id, name, slug')
        .in('id', riverIds);
      rivers = riverData || [];
    }

    const riverMap = new Map(rivers.map(r => [r.id, r]));

    const formatted = {
      id: gauge.id,
      usgsSiteId: gauge.usgs_site_id,
      name: gauge.name,
      active: gauge.active,
      thresholdDescriptions: gauge.threshold_descriptions,
      notes: gauge.notes,
      riverAssociations: (riverGauges || []).map(rg => {
        const river = riverMap.get(rg.river_id);
        return {
          id: rg.id,
          riverId: rg.river_id,
          riverName: river?.name || 'Unknown',
          riverSlug: river?.slug || '',
          isPrimary: rg.is_primary,
          thresholdUnit: rg.threshold_unit,
          levelTooLow: rg.level_too_low,
          levelLow: rg.level_low,
          levelOptimalMin: rg.level_optimal_min,
          levelOptimalMax: rg.level_optimal_max,
          levelHigh: rg.level_high,
          levelDangerous: rg.level_dangerous,
          distanceFromSectionMiles: rg.distance_from_section_miles,
          accuracyWarningThresholdMiles: rg.accuracy_warning_threshold_miles,
        };
      }),
    };

    return NextResponse.json({ gauge: formatted });
  } catch (error) {
    console.error('Error in get gauge endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { thresholdDescriptions, notes, riverAssociations } = body;

    const supabase = createAdminClient();

    // Update gauge station (descriptions and notes)
    if (thresholdDescriptions !== undefined || notes !== undefined) {
      const gaugeUpdate: Record<string, unknown> = {};

      if (thresholdDescriptions !== undefined) {
        gaugeUpdate.threshold_descriptions = thresholdDescriptions;
      }
      if (notes !== undefined) {
        gaugeUpdate.notes = notes || null;
      }

      const { error: gaugeError } = await supabase
        .from('gauge_stations')
        .update(gaugeUpdate)
        .eq('id', id);

      if (gaugeError) {
        console.error('Error updating gauge station:', gaugeError);
        return NextResponse.json(
          { error: 'Could not update gauge station' },
          { status: 500 }
        );
      }
    }

    // Update river_gauges (thresholds) if provided
    if (riverAssociations && Array.isArray(riverAssociations)) {
      for (const assoc of riverAssociations) {
        if (!assoc.id) continue;

        const thresholdUpdate: Record<string, unknown> = {};

        if (assoc.thresholdUnit !== undefined) {
          thresholdUpdate.threshold_unit = assoc.thresholdUnit;
        }
        if (assoc.levelTooLow !== undefined) {
          thresholdUpdate.level_too_low = assoc.levelTooLow === '' ? null : parseFloat(assoc.levelTooLow);
        }
        if (assoc.levelLow !== undefined) {
          thresholdUpdate.level_low = assoc.levelLow === '' ? null : parseFloat(assoc.levelLow);
        }
        if (assoc.levelOptimalMin !== undefined) {
          thresholdUpdate.level_optimal_min = assoc.levelOptimalMin === '' ? null : parseFloat(assoc.levelOptimalMin);
        }
        if (assoc.levelOptimalMax !== undefined) {
          thresholdUpdate.level_optimal_max = assoc.levelOptimalMax === '' ? null : parseFloat(assoc.levelOptimalMax);
        }
        if (assoc.levelHigh !== undefined) {
          thresholdUpdate.level_high = assoc.levelHigh === '' ? null : parseFloat(assoc.levelHigh);
        }
        if (assoc.levelDangerous !== undefined) {
          thresholdUpdate.level_dangerous = assoc.levelDangerous === '' ? null : parseFloat(assoc.levelDangerous);
        }

        if (Object.keys(thresholdUpdate).length > 0) {
          const { error: thresholdError } = await supabase
            .from('river_gauges')
            .update(thresholdUpdate)
            .eq('id', assoc.id);

          if (thresholdError) {
            console.error('Error updating river gauge thresholds:', thresholdError);
            return NextResponse.json(
              { error: `Could not update thresholds for ${assoc.riverName}` },
              { status: 500 }
            );
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in update gauge endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
