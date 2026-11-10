// src/app/api/admin/gauges/[id]/route.ts
// GET /api/admin/gauges/[id] - Get single gauge details
// PUT /api/admin/gauges/[id] - Update gauge descriptions and notes

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { toNum } from '@/lib/utils/num';
import { requireAdminAuth, isValidUUID, invalidIdResponse } from '@/lib/admin-auth';

import {
  applyThresholdPatch,
  type ThresholdKey,
  type ThresholdPatch,
  type ThresholdState,
} from '@/lib/gauges/threshold-validation';

const THRESHOLD_COLUMNS: ReadonlyArray<readonly [ThresholdKey, string]> = [
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
];

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Vercel-CDN-Cache-Control': 'no-store',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();
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

    // Get latest reading (stage ft + discharge cfs)
    let latestReading: { gaugeHeightFt: number | null; dischargeCfs: number | null; readingTimestamp: string | null } | null = null;
    const { data: readingRow } = await supabase
      .from('gauge_readings')
      .select('gauge_height_ft, discharge_cfs, reading_timestamp')
      .eq('gauge_station_id', id)
      .order('reading_timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readingRow) {
      latestReading = {
        gaugeHeightFt: toNum(readingRow.gauge_height_ft),
        dischargeCfs: toNum(readingRow.discharge_cfs),
        readingTimestamp: readingRow.reading_timestamp as string | null,
      };
    }

    // Get river associations with thresholds (including alt unit columns)
    const { data: riverGauges, error: rgError } = await supabase
      .from('river_gauges')
      .select(`id, river_id, is_primary, threshold_unit,
        level_too_low, level_low, level_optimal_min, level_optimal_max,
        level_high, level_dangerous,
        alt_level_too_low, alt_level_low, alt_level_optimal_min,
        alt_level_optimal_max, alt_level_high, alt_level_dangerous,
        distance_from_section_miles, accuracy_warning_threshold_miles`)
      .eq('gauge_station_id', id);

    if (rgError) {
      console.error('Error fetching river gauges:', rgError);
      return NextResponse.json(
        { error: 'Could not fetch gauge river associations' },
        { status: 500 }
      );
    }

    // Get river names
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rgList = (riverGauges || []) as any[];
    const riverIds = rgList.map(rg => rg.river_id as string).filter(Boolean);
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
      latestReading,
      riverAssociations: rgList.map(rg => {
        const river = riverMap.get(rg.river_id as string);
        return {
          id: rg.id,
          riverId: rg.river_id,
          riverName: river?.name || 'Unknown',
          riverSlug: river?.slug || '',
          isPrimary: rg.is_primary,
          thresholdUnit: rg.threshold_unit,
          levelTooLow: rg.level_too_low ?? null,
          levelLow: rg.level_low ?? null,
          levelOptimalMin: rg.level_optimal_min ?? null,
          levelOptimalMax: rg.level_optimal_max ?? null,
          levelHigh: rg.level_high ?? null,
          levelDangerous: rg.level_dangerous ?? null,
          altLevelTooLow: rg.alt_level_too_low ?? null,
          altLevelLow: rg.alt_level_low ?? null,
          altLevelOptimalMin: rg.alt_level_optimal_min ?? null,
          altLevelOptimalMax: rg.alt_level_optimal_max ?? null,
          altLevelHigh: rg.alt_level_high ?? null,
          altLevelDangerous: rg.alt_level_dangerous ?? null,
          distanceFromSectionMiles: rg.distance_from_section_miles ?? null,
          accuracyWarningThresholdMiles: rg.accuracy_warning_threshold_miles ?? 0,
        };
      }),
    };

    return NextResponse.json({ gauge: formatted }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error('Error in get gauge endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Accept both PUT and POST to avoid edge/CDN caching of writes
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdate(request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdate(request, params);
}

async function handleUpdate(
  request: NextRequest,
  params: Promise<{ id: string }>
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();
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
      // Validate every association against its stored ladder before writing
      // any of them, so a rejected edit cannot leave the gauge half-saved.
      const planned: Array<{ id: string; riverName: string; update: Record<string, unknown> }> = [];

      for (const assoc of riverAssociations) {
        if (!assoc || typeof assoc.id !== 'string') continue;
        if (!isValidUUID(assoc.id)) return invalidIdResponse();
        const riverName = typeof assoc.riverName === 'string' ? assoc.riverName : 'this river';

        // Scoped to this gauge: an association ID from another gauge is a 404.
        const { data: row, error: rowError } = await supabase
          .from('river_gauges')
          .select(`id, threshold_unit, ${THRESHOLD_COLUMNS.map(([, column]) => column).join(', ')}`)
          .eq('id', assoc.id)
          .eq('gauge_station_id', id)
          .maybeSingle();

        if (rowError) {
          console.error('Error loading river gauge thresholds:', rowError, { assocId: assoc.id });
          return NextResponse.json({ error: `Could not load thresholds for ${riverName}` }, { status: 500 });
        }
        if (!row) {
          return NextResponse.json({ error: `No river gauge found for ${riverName} on this gauge` }, { status: 404 });
        }

        const stored = row as unknown as Record<string, number | string | null>;
        const current = {
          thresholdUnit: stored.threshold_unit === 'cfs' ? 'cfs' : 'ft',
          ...Object.fromEntries(
            THRESHOLD_COLUMNS.map(([key, column]) => [key, stored[column] === null ? null : Number(stored[column])]),
          ),
        } as ThresholdState;

        const result = applyThresholdPatch(current, assoc as ThresholdPatch);
        if (!result.ok) {
          return NextResponse.json({ error: `${riverName}: ${result.error}` }, { status: 400 });
        }
        if (!result.changed) continue;

        const update: Record<string, unknown> = {};
        if (result.next.thresholdUnit !== current.thresholdUnit) update.threshold_unit = result.next.thresholdUnit;
        for (const [key, column] of THRESHOLD_COLUMNS) {
          if (result.next[key] !== current[key]) update[column] = result.next[key];
        }
        if (Object.keys(update).length > 0) planned.push({ id: assoc.id, riverName, update });
      }

      for (const { id: assocId, riverName, update } of planned) {
        const { data: updated, error: thresholdError } = await supabase
          .from('river_gauges')
          .update(update)
          .eq('id', assocId)
          .eq('gauge_station_id', id)
          .select('id')
          .maybeSingle();

        if (thresholdError) {
          console.error('Error updating river gauge thresholds:', thresholdError, { assocId, update });
          return NextResponse.json(
            { error: `Could not update thresholds for ${riverName}: ${thresholdError.message}` },
            { status: 500 }
          );
        }

        if (!updated) {
          console.warn('Gauge threshold update matched 0 rows:', { assocId, update });
          return NextResponse.json(
            { error: `No river gauge found with id ${assocId} for ${riverName}` },
            { status: 404 }
          );
        }

        updatedAssociations.push({ id: assocId, riverName, fieldsUpdated: Object.keys(update).length });
      }
    }

    return NextResponse.json({ success: true, updatedAssociations }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error('Error in update gauge endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
