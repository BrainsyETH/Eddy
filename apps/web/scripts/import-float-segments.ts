#!/usr/bin/env npx tsx
/**
 * Import Float Segments
 *
 * Imports known float times between access points.
 * Data can come from CSV or hardcoded sources.
 *
 * Usage:
 *   npx tsx scripts/import-float-segments.ts
 *   npx tsx scripts/import-float-segments.ts --link  # Also link to access_points
 */

import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
loadEnvConfig(process.cwd());

interface FloatSegment {
  river_slug: string;
  put_in: string;
  take_out: string;
  distance_miles: number;
  canoe_time: string;  // e.g., "3-5 hours" or "4-6 hrs"
  raft_time?: string;
  tube_time?: string;
  trip_type?: 'day' | 'overnight' | 'multi-day';
  notes?: string;
  source?: string;
}

// Parse time string like "3-5 hours" into { min: 180, max: 300 }
function parseTimeRange(timeStr: string | undefined): { min: number; max: number } | null {
  if (!timeStr || timeStr === '-' || timeStr === '') return null;

  // Handle "2 days" format
  if (timeStr.toLowerCase().includes('day')) {
    const dayMatch = timeStr.match(/(\d+)/);
    if (dayMatch) {
      const days = parseInt(dayMatch[1]);
      // Assume 8 hours of paddling per day
      return { min: days * 8 * 60, max: days * 8 * 60 };
    }
  }

  // Handle "3-5 hours" or "3-5 hrs" format
  const rangeMatch = timeStr.match(/(\d+)-(\d+)\s*(hours?|hrs?)/i);
  if (rangeMatch) {
    return {
      min: parseInt(rangeMatch[1]) * 60,
      max: parseInt(rangeMatch[2]) * 60,
    };
  }

  // Handle single value like "4 hours"
  const singleMatch = timeStr.match(/(\d+)\s*(hours?|hrs?)/i);
  if (singleMatch) {
    const hours = parseInt(singleMatch[1]);
    return { min: hours * 60, max: hours * 60 };
  }

  return null;
}

// Determine trip type from time
function getTripType(canoeTime: { min: number; max: number } | null): 'day' | 'overnight' | 'multi-day' {
  if (!canoeTime) return 'day';
  const avgHours = (canoeTime.min + canoeTime.max) / 2 / 60;
  if (avgHours <= 8) return 'day';
  if (avgHours <= 16) return 'overnight';
  return 'multi-day';
}

// ============================================
// SEGMENT DATA
// ============================================

const CURRENT_RIVER_SEGMENTS: FloatSegment[] = [
  // One Day Trips
  { river_slug: 'current', put_in: 'Cedar Grove', take_out: 'Akers', distance_miles: 8, canoe_time: '3-5 hours', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Akers', take_out: 'Pulltite', distance_miles: 12, canoe_time: '4-6 hours', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Baptist Camp', take_out: 'Akers', distance_miles: 16, canoe_time: '6-8 hours', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Cedar Grove', take_out: 'Pulltite', distance_miles: 20, canoe_time: '7-9 hours', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Akers', take_out: 'Round Spring', distance_miles: 22, canoe_time: '7-9 hours', source: 'floatmissouri.org' },

  // Two Day Trips
  { river_slug: 'current', put_in: 'Baptist Camp', take_out: 'Pulltite', distance_miles: 28, canoe_time: '10-14 hours', trip_type: 'overnight', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Cedar Grove', take_out: 'Round Spring', distance_miles: 30, canoe_time: '10-14 hours', trip_type: 'overnight', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Baptist Camp', take_out: 'Round Spring', distance_miles: 38, canoe_time: '13-15 hours', trip_type: 'overnight', source: 'floatmissouri.org' },

  // Three+ Day Trips
  { river_slug: 'current', put_in: 'Akers', take_out: 'Two Rivers', distance_miles: 42, canoe_time: '16-18 hours', trip_type: 'multi-day', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Akers', take_out: 'Powdermill', distance_miles: 48, canoe_time: '18-20 hours', trip_type: 'multi-day', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Cedar Grove', take_out: 'Two Rivers', distance_miles: 50, canoe_time: '19-20 hours', trip_type: 'multi-day', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Cedar Grove', take_out: 'Powdermill', distance_miles: 56, canoe_time: '21-23 hours', trip_type: 'multi-day', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Baptist Camp', take_out: 'Two Rivers', distance_miles: 58, canoe_time: '22-24 hours', trip_type: 'multi-day', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Baptist Camp', take_out: 'Powdermill', distance_miles: 64, canoe_time: '24-26 hours', trip_type: 'multi-day', source: 'floatmissouri.org' },

  // Five+ Day Trips
  { river_slug: 'current', put_in: 'Akers', take_out: 'Big Spring', distance_miles: 78, canoe_time: '35-40 hours', trip_type: 'multi-day', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Cedar Grove', take_out: 'Big Spring', distance_miles: 86, canoe_time: '38-42 hours', trip_type: 'multi-day', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Baptist Camp', take_out: 'Big Spring', distance_miles: 94, canoe_time: '42-46 hours', trip_type: 'multi-day', source: 'floatmissouri.org' },

  // Raft Trips
  { river_slug: 'current', put_in: 'Cedar Grove', take_out: 'Akers', distance_miles: 8, canoe_time: '3-5 hours', raft_time: '6-7 hours', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Akers', take_out: 'Pulltite', distance_miles: 12, canoe_time: '4-6 hours', raft_time: '7-9 hours', source: 'floatmissouri.org' },

  // Tube Trips
  { river_slug: 'current', put_in: 'Welch Landing', take_out: 'Akers', distance_miles: 2.5, canoe_time: '1-2 hours', tube_time: '2-3 hours', source: 'floatmissouri.org' },
  { river_slug: 'current', put_in: 'Cedar Grove', take_out: 'Akers', distance_miles: 8, canoe_time: '3-5 hours', tube_time: '8-10 hours', source: 'floatmissouri.org' },
];

const HUZZAH_SEGMENTS: FloatSegment[] = [
  { river_slug: 'huzzah', put_in: 'Harpers Slab', take_out: 'Huzzah Valley Bridge', distance_miles: 6, canoe_time: '3-4 hours', raft_time: '5-6 hours', source: 'floatmissouri.org' },
  { river_slug: 'huzzah', put_in: 'Harpers Slab', take_out: 'Scotia', distance_miles: 12, canoe_time: '6-8 hours', source: 'floatmissouri.org' },
  { river_slug: 'huzzah', put_in: 'Huzzah Valley', take_out: 'Scotia', distance_miles: 6, canoe_time: '3-4 hours', raft_time: '5-6 hours', source: 'floatmissouri.org' },
  { river_slug: 'huzzah', put_in: 'Huzzah Valley', take_out: 'Onondaga Cave', distance_miles: 10, canoe_time: '6-8 hours', source: 'floatmissouri.org' },
  { river_slug: 'huzzah', put_in: 'Blunts', take_out: 'Butts', distance_miles: 4, canoe_time: '3-5 hours', raft_time: '5-6 hours', source: 'floatmissouri.org' },
  { river_slug: 'huzzah', put_in: 'Blunts', take_out: 'Scotia', distance_miles: 10, canoe_time: '6-8 hours', source: 'floatmissouri.org' },
  { river_slug: 'huzzah', put_in: 'Blunts', take_out: 'Onondaga Cave', distance_miles: 14, canoe_time: '8-10 hours', source: 'floatmissouri.org' },
  { river_slug: 'huzzah', put_in: 'Berryman', take_out: 'Onondaga Cave', distance_miles: 20, canoe_time: '2 days', trip_type: 'overnight', source: 'floatmissouri.org' },
  { river_slug: 'huzzah', put_in: 'Butts', take_out: 'Scotia', distance_miles: 6, canoe_time: '3-5 hours', source: 'floatmissouri.org' },
  { river_slug: 'huzzah', put_in: 'Berryman', take_out: 'Blunts', distance_miles: 6, canoe_time: '3-5 hours', source: 'floatmissouri.org' },
  { river_slug: 'huzzah', put_in: 'Berryman', take_out: 'Butts', distance_miles: 10, canoe_time: '4-6 hours', source: 'floatmissouri.org' },
  { river_slug: 'huzzah', put_in: 'Scotia', take_out: 'Onondaga Cave', distance_miles: 4, canoe_time: '2-3 hours', raft_time: '4-6 hours', source: 'floatmissouri.org' },
];

// Combine all segments
const ALL_SEGMENTS: FloatSegment[] = [
  ...CURRENT_RIVER_SEGMENTS,
  ...HUZZAH_SEGMENTS,
];

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase credentials in environment');
  }

  return createClient(supabaseUrl, serviceKey);
}

async function main() {
  const args = process.argv.slice(2);
  const shouldLink = args.includes('--link');

  console.log('📊 Float Segment Import');
  console.log('='.repeat(50));
  console.log(`Segments to import: ${ALL_SEGMENTS.length}`);
  console.log('');

  const supabase = getSupabaseClient();

  // Get all rivers for slug lookup
  const { data: rivers, error: riverError } = await supabase
    .from('rivers')
    .select('id, slug, name');

  if (riverError || !rivers) {
    console.error('Error fetching rivers:', riverError);
    process.exit(1);
  }

  const riverMap = new Map(rivers.map(r => [r.slug, r]));

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const segment of ALL_SEGMENTS) {
    const river = riverMap.get(segment.river_slug);
    if (!river) {
      console.error(`❌ River not found: ${segment.river_slug}`);
      errors++;
      continue;
    }

    const canoeTime = parseTimeRange(segment.canoe_time);
    const raftTime = parseTimeRange(segment.raft_time);
    const tubeTime = parseTimeRange(segment.tube_time);
    const tripType = segment.trip_type || getTripType(canoeTime);

    // Check if segment already exists
    const { data: existing } = await supabase
      .from('float_segments')
      .select('id')
      .eq('river_id', river.id)
      .eq('put_in_name', segment.put_in)
      .eq('take_out_name', segment.take_out)
      .single();

    if (existing) {
      console.log(`⏭️  Exists: ${segment.put_in} → ${segment.take_out} (${river.name})`);
      skipped++;
      continue;
    }

    // Insert segment
    const { error: insertError } = await supabase
      .from('float_segments')
      .insert({
        river_id: river.id,
        put_in_name: segment.put_in,
        take_out_name: segment.take_out,
        distance_miles: segment.distance_miles,
        canoe_time_min: canoeTime?.min || null,
        canoe_time_max: canoeTime?.max || null,
        raft_time_min: raftTime?.min || null,
        raft_time_max: raftTime?.max || null,
        tube_time_min: tubeTime?.min || null,
        tube_time_max: tubeTime?.max || null,
        trip_type: tripType,
        notes: segment.notes || null,
        source: segment.source || 'manual',
      });

    if (insertError) {
      console.error(`❌ Error: ${segment.put_in} → ${segment.take_out}: ${insertError.message}`);
      errors++;
      continue;
    }

    console.log(`✅ Imported: ${segment.put_in} → ${segment.take_out} (${segment.distance_miles} mi, ${segment.canoe_time})`);
    imported++;
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Import Summary');
  console.log('='.repeat(50));
  console.log(`✅ Imported: ${imported}`);
  console.log(`⏭️  Skipped:  ${skipped}`);
  console.log(`❌ Errors:   ${errors}`);

  if (shouldLink) {
    console.log('\n🔗 Linking segments to access points...');

    const { data: linkResults, error: linkError } = await supabase
      .rpc('link_float_segments');

    if (linkError) {
      console.error('Error linking segments:', linkError);
    } else if (linkResults) {
      let linked = 0;
      let unlinked = 0;

      for (const result of linkResults) {
        if (result.put_in_matched && result.take_out_matched) {
          linked++;
        } else {
          unlinked++;
          console.log(`   ⚠️ Unmatched: ${result.put_in_name} → ${result.take_out_name}`);
          if (!result.put_in_matched) console.log(`      Put-in "${result.put_in_name}" not found`);
          if (!result.take_out_matched) console.log(`      Take-out "${result.take_out_name}" not found`);
        }
      }

      console.log(`\n   ✅ Linked: ${linked}`);
      console.log(`   ⚠️ Unlinked: ${unlinked}`);
    }
  } else {
    console.log('\n💡 Run with --link to match segment names to access_points');
  }
}

main().catch(console.error);
