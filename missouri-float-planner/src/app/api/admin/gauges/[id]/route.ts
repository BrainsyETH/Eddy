// src/app/api/admin/gauges/[id]/route.ts
// GET /api/admin/gauges/[id] - Get single gauge details
// PUT /api/admin/gauges/[id] - Update gauge descriptions and notes

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

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
    // Fall back without alt columns if migration hasn't run yet
    const baseCols = `id, river_id, is_primary, threshold_unit,
        level_too_low, level_low, level_optimal_min, level_optimal_max,
        level_high, level_dangerous,`;
    const altCols = `alt_level_too_low, alt_level_low, alt_level_optimal_min,
        alt_level_optimal_max, alt_level_high, alt_level_dangerous,`;
    const tailCols = `distance_from_section_miles, accuracy_warning_threshold_miles`;

    let riverGauges: Record<string, unknown>[] | null = null;
    {
      const { data, error: err } = await supabase
        .from('river_gauges')
        .select(baseCols + altCols + tailCols)
        .eq('gauge_station_id', id);
      if (err) {
        const { data: fb } = await supabase
          .from('river_gauges')
          .select(baseCols + tailCols)
          .eq('gauge_station_id', id);
        riverGauges = fb as unknown as Record<string, unknown>[] | null;
      } else {
        riverGauges = data as unknown as Record<string, unknown>[] | null;
      }
    }

    // Get river names
    const riverIds = (riverGauges || []).map(rg => rg.river_id as string).filter(Boolean);
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
        const river = riverMap.get(rg.river_id as string);
        return {
          id: rg.id,
          riverId: rg.river_id,
          riverName: river?.name || 'Unknown',
          riverSlug: river?.slug || '',
          isPrimary: rg.is_primary,
          thresholdUnit: rg.threshold_unit,
          levelTooLow: (rg.level_too_low as number) ?? null,
          levelLow: (rg.level_low as number) ?? null,
          levelOptimalMin: (rg.level_optimal_min as number) ?? null,
          levelOptimalMax: (rg.level_optimal_max as number) ?? null,
          levelHigh: (rg.level_high as number) ?? null,
          levelDangerous: (rg.level_dangerous as number) ?? null,
          altLevelTooLow: (rg.alt_level_too_low as number) ?? null,
          altLevelLow: (rg.alt_level_low as number) ?? null,
          altLevelOptimalMin: (rg.alt_level_optimal_min as number) ?? null,
          altLevelOptimalMax: (rg.alt_level_optimal_max as number) ?? null,
          altLevelHigh: (rg.alt_level_high as number) ?? null,
          altLevelDangerous: (rg.alt_level_dangerous as number) ?? null,
          distanceFromSectionMiles: (rg.distance_from_section_miles as number) ?? null,
          accuracyWarningThresholdMiles: (rg.accuracy_warning_threshold_miles as number) ?? 0,
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
    const authError = requireAdminAuth(request);
    if (authError) return authError;

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

      const { data: gaugeUpdated, error: gaugeError } = await supabase
        .from('gauge_stations')
        .update(gaugeUpdate)
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (gaugeError) {
        console.error('Error updating gauge station:', gaugeError, { id, gaugeUpdate });
        return NextResponse.json(
          { error: `Could not update gauge station: ${gaugeError.message}` },
          { status: 500 }
        );
      }

      if (!gaugeUpdated) {
        console.warn('Gauge station update matched 0 rows:', { id, gaugeUpdate });
        return NextResponse.json(
          { error: `No gauge station found with id ${id}` },
          { status: 404 }
        );
      }
    }

    // Update river_gauges (thresholds) if provided
    const updatedAssociations: Array<{ id: string; riverName: string; fieldsUpdated: number }> = [];

    if (riverAssociations && Array.isArray(riverAssociations)) {
      for (const assoc of riverAssociations) {
        if (!assoc.id) continue;

        const thresholdUpdate: Record<string, unknown> = {};

        if (assoc.thresholdUnit !== undefined) {
          thresholdUpdate.threshold_unit = assoc.thresholdUnit;
        }

        // Parse numeric values — handle both string and number inputs
        const numericFields = [
          ['levelTooLow', 'level_too_low'],
          ['levelLow', 'level_low'],
          ['levelOptimalMin', 'level_optimal_min'],
          ['levelOptimalMax', 'level_optimal_max'],
          ['levelHigh', 'level_high'],
          ['levelDangerous', 'level_dangerous'],
          ['altLevelTooLow', 'alt_level_too_low'],
          ['altLevelLow', 'alt_level_low'],
          ['altLevelOptimalMin', 'alt_level_optimal_min'],
          ['altLevelOptimalMax', 'alt_level_optimal_max'],
          ['altLevelHigh', 'alt_level_high'],
          ['altLevelDangerous', 'alt_level_dangerous'],
        ] as const;

        for (const [frontendKey, dbKey] of numericFields) {
          if (assoc[frontendKey] !== undefined) {
            const val = assoc[frontendKey];
            if (val === '' || val === null) {
              thresholdUpdate[dbKey] = null;
            } else {
              const parsed = typeof val === 'number' ? val : parseFloat(val);
              thresholdUpdate[dbKey] = isNaN(parsed) ? null : parsed;
            }
          }
        }

        if (Object.keys(thresholdUpdate).length > 0) {
          // Try update with all fields; if alt columns don't exist, retry without them
          let { data: updated, error: thresholdError } = await supabase
            .from('river_gauges')
            .update(thresholdUpdate)
            .eq('id', assoc.id)
            .select('id')
            .maybeSingle();

          if (thresholdError && thresholdError.message.includes('alt_level_')) {
            console.warn('Alt columns not available, retrying without them:', thresholdError.message);
            // Strip alt fields and retry
            const withoutAlt = Object.fromEntries(
              Object.entries(thresholdUpdate).filter(([k]) => !k.startsWith('alt_level_'))
            );
            if (Object.keys(withoutAlt).length > 0) {
              const retry = await supabase
                .from('river_gauges')
                .update(withoutAlt)
                .eq('id', assoc.id)
                .select('id')
                .maybeSingle();
              updated = retry.data;
              thresholdError = retry.error;
            } else {
              updated = { id: assoc.id }; // nothing to write
              thresholdError = null;
            }
          }

          if (thresholdError) {
            console.error('Error updating river gauge thresholds:', thresholdError, { assocId: assoc.id, thresholdUpdate });
            return NextResponse.json(
              { error: `Could not update thresholds for ${assoc.riverName}: ${thresholdError.message}` },
              { status: 500 }
            );
          }

          if (!updated) {
            console.warn('Gauge threshold update matched 0 rows:', { assocId: assoc.id, thresholdUpdate });
            return NextResponse.json(
              { error: `No river gauge found with id ${assoc.id} for ${assoc.riverName}` },
              { status: 404 }
            );
          }

          updatedAssociations.push({
            id: assoc.id,
            riverName: assoc.riverName || 'Unknown',
            fieldsUpdated: Object.keys(thresholdUpdate).length,
          });
        }
      }
    }

    return NextResponse.json({ success: true, updatedAssociations });
  } catch (error) {
    console.error('Error in update gauge endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
