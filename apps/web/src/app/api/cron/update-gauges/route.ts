// src/app/api/cron/update-gauges/route.ts
// GET/POST /api/cron/update-gauges - Update gauge readings from USGS
// Vercel Cron uses GET; POST supported for manual testing.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';
import { computeCondition, type ConditionThresholds } from '@/lib/conditions';
import { publishConditionChangeAlert } from '@/lib/social/condition-alerts';
import { regenerateEddyForRiver } from '@/lib/eddy/regenerate';

// Force dynamic rendering (cron endpoint)
export const dynamic = 'force-dynamic';

// Rate of change threshold (ft/hour) that triggers high-frequency polling
const RAPID_CHANGE_THRESHOLD = 0.5;

async function runUpdate(request: NextRequest) {
  // Verify cron secret — always required, including in development.
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET not configured');
    return NextResponse.json(
      { error: 'Cron secret not configured' },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const supabase = createAdminClient();

  // Check if this is a high-frequency poll (triggered every 15 minutes)
  const isHighFrequencyPoll = request.headers.get('x-high-frequency') === 'true';

  try {
    // Get gauge stations based on poll type
    let stationsQuery = supabase
      .from('gauge_stations')
      .select('id, usgs_site_id, high_frequency_flag')
      .eq('active', true);

    // For high-frequency polls, only fetch gauges with the flag set
    if (isHighFrequencyPoll) {
      stationsQuery = stationsQuery.eq('high_frequency_flag', true);
    }

    const { data: stationsData, error: stationsError } = await stationsQuery;

    if (stationsError || !stationsData) {
      console.error('Error fetching gauge stations:', stationsError);
      return NextResponse.json(
        { error: 'Could not fetch gauge stations' },
        { status: 500 }
      );
    }

    // Type assertion for stations
    const stations = stationsData as Array<{ 
      id: string; 
      usgs_site_id: string; 
      high_frequency_flag: boolean;
    }>;

    if (stations.length === 0) {
      return NextResponse.json({
        message: isHighFrequencyPoll 
          ? 'No high-frequency gauge stations found' 
          : 'No active gauge stations found',
        updated: 0,
        highFrequencyUpdated: 0,
      });
    }

    // Fetch readings from USGS (skip cache to ensure fresh data)
    const siteIds = stations.map(s => s.usgs_site_id);
    const readings = await fetchGaugeReadings(siteIds, { skipCache: true });

    // Update database and calculate rate of change
    let updated = 0;
    let errors = 0;
    let highFrequencyFlagsSet = 0;
    let highFrequencyFlagsCleared = 0;
    let conditionChanges = 0;

    for (const reading of readings) {
      const station = stations.find(s => s.usgs_site_id === reading.siteId);
      if (!station) continue;

      if (!reading.readingTimestamp) {
        console.warn(`No timestamp for gauge ${reading.siteId}`);
        continue;
      }

      // Insert or update reading
      const { error: insertError } = await supabase
        .from('gauge_readings')
        .upsert(
          {
            gauge_station_id: station.id,
            reading_timestamp: reading.readingTimestamp,
            gauge_height_ft: reading.gaugeHeightFt,
            discharge_cfs: reading.dischargeCfs,
            fetched_at: new Date().toISOString(),
          },
          {
            onConflict: 'gauge_station_id,reading_timestamp',
          }
        );

      if (insertError) {
        console.error(`Error updating gauge ${reading.siteId}:`, insertError);
        errors++;
        continue;
      }

      updated++;

      // Calculate rate of change using database function
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rateData } = await (supabase.rpc as any)('get_gauge_rate_of_change', {
        p_gauge_station_id: station.id,
        p_hours_lookback: 1,
      });

      const rateInfo = rateData?.[0];
      
      if (rateInfo) {
        const isRapidChange = rateInfo.rate_ft_per_hour !== null && 
          Math.abs(rateInfo.rate_ft_per_hour) > RAPID_CHANGE_THRESHOLD;
        
        // Update high_frequency_flag if needed
        if (isRapidChange && !station.high_frequency_flag) {
          // Water level changing rapidly - enable high-frequency polling
          const { error: flagError } = await supabase
            .from('gauge_stations')
            .update({ high_frequency_flag: true })
            .eq('id', station.id);

          if (!flagError) {
            highFrequencyFlagsSet++;
            console.log(
              `High-frequency polling enabled for ${reading.siteId}: ` +
              `rate=${rateInfo.rate_ft_per_hour?.toFixed(2)} ft/hr`
            );

            // Rapid change detected — regenerate Eddy report for affected rivers
            try {
              const { data: affectedRivers } = await supabase
                .from('river_gauges')
                .select('rivers!inner(slug)')
                .eq('gauge_station_id', station.id);

              if (affectedRivers) {
                for (const rawRg of affectedRivers) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const riverSlug = (rawRg as any).rivers?.slug;
                  if (riverSlug) {
                    regenerateEddyForRiver(riverSlug, 'rapid_change').catch((err) => {
                      console.error(`Eddy regen error for ${riverSlug} (rapid):`, err);
                    });
                  }
                }
              }
            } catch (regenErr) {
              console.error(`Rapid-change regen lookup error for station ${station.id}:`, regenErr);
            }
          }
        } else if (!isRapidChange && station.high_frequency_flag) {
          // Water level stabilized - disable high-frequency polling
          const { error: flagError } = await supabase
            .from('gauge_stations')
            .update({ high_frequency_flag: false })
            .eq('id', station.id);

          if (!flagError) {
            highFrequencyFlagsCleared++;
            console.log(
              `High-frequency polling disabled for ${reading.siteId}: ` +
              `rate=${rateInfo.rate_ft_per_hour?.toFixed(2)} ft/hr`
            );
          }
        }
      }

      // --- Condition change detection ---
      // Look up river_gauges rows for this station to check for condition changes
      try {
        // Join to rivers to get slug for social posting
        const { data: riverGauges } = await supabase
          .from('river_gauges')
          .select('id, last_condition_code, level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous, threshold_unit, rivers!inner(slug)')
          .eq('gauge_station_id', station.id);

        if (riverGauges && riverGauges.length > 0) {
          for (const rawRg of riverGauges) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rg = rawRg as any;
            const riverSlug: string | undefined = rg.rivers?.slug;
            if (!riverSlug) continue;

            const thresholds: ConditionThresholds = {
              levelTooLow: rg.level_too_low,
              levelLow: rg.level_low,
              levelOptimalMin: rg.level_optimal_min,
              levelOptimalMax: rg.level_optimal_max,
              levelHigh: rg.level_high,
              levelDangerous: rg.level_dangerous,
              thresholdUnit: (rg.threshold_unit || 'ft') as 'ft' | 'cfs',
            };

            const newCondition = computeCondition(
              reading.gaugeHeightFt,
              thresholds,
              reading.dischargeCfs
            );

            const oldCode = rg.last_condition_code || 'unknown';
            if (newCondition.code !== oldCode && newCondition.code !== 'unknown') {
              console.log(
                `Condition change for ${riverSlug}: ${oldCode} → ${newCondition.code} ` +
                `(gauge ${reading.siteId}, ${reading.gaugeHeightFt?.toFixed(1)} ft)`
              );

              // Update last_condition_code
              await supabase
                .from('river_gauges')
                .update({ last_condition_code: newCondition.code })
                .eq('id', rg.id);

              conditionChanges++;

              // Publish alert (async, don't block cron)
              publishConditionChangeAlert({
                riverSlug,
                oldCondition: oldCode,
                newCondition: newCondition.code,
                gaugeHeightFt: reading.gaugeHeightFt,
              }).catch((err) => {
                console.error(`Condition alert publish error for ${riverSlug}:`, err);
              });

              // Regenerate Eddy report for this river (async, throttled internally)
              regenerateEddyForRiver(riverSlug, 'condition_change').catch((err) => {
                console.error(`Eddy regen error for ${riverSlug}:`, err);
              });
            }
          }
        }
      } catch (condErr) {
        console.error(`Condition check error for station ${station.id}:`, condErr);
      }
    }

    const executionTime = new Date().toISOString();
    
    return NextResponse.json({
      message: 'Gauge update complete',
      updated,
      errors,
      total: readings.length,
      isHighFrequencyPoll,
      highFrequencyFlagsSet,
      highFrequencyFlagsCleared,
      conditionChanges,
      executionTime,
      stationsProcessed: stations.length,
    });
  } catch (error) {
    console.error('Error in gauge update cron:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/** Vercel Cron uses GET. */
export async function GET(request: NextRequest) {
  return runUpdate(request);
}

/** For manual testing: curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/update-gauges */
export async function POST(request: NextRequest) {
  return runUpdate(request);
}
