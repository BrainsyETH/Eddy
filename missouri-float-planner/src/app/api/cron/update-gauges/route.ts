// src/app/api/cron/update-gauges/route.ts
// GET/POST /api/cron/update-gauges - Update gauge readings from USGS
// Vercel Cron uses GET; POST supported for manual testing.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFlowProvider, type GaugeReading } from '@/lib/flow-providers';
import { computeCondition, hasMaterialConditionChange, type ConditionThresholds } from '@/lib/conditions';
import { publishConditionChangeAlert, isElevatedCrossing, publishElevatedCrossings } from '@/lib/social/condition-alerts';
import { regenerateEddyForRiver, type TriggerReason } from '@/lib/eddy/regenerate';
import { toNum } from '@/lib/utils/num';
import { getSecondaryGaugeTargets } from '@/lib/eddy/generate-gauge-update';
import { regenerateGaugeUpdate } from '@/lib/eddy/regenerate-gauge';
import { confirmsGaugeConditionChange, MAX_GAUGE_REGENS_PER_POLL } from '@/lib/eddy/gauge-update-policy';
import { tryCronLock, releaseCronLock } from '@/lib/social/cron-lock';
import { gateReading, type GateRejection } from '@/lib/alerts/gate';
import { logger } from '@/lib/logger';
import { classifyEventKind } from '@/lib/alerts/event-kind';

// Force dynamic rendering (cron endpoint)
export const dynamic = 'force-dynamic';
// The elevated-crossing alerts (storm digest / individual warnings) are AWAITED
// before the response so serverless doesn't kill them mid-publish; Meta Graph
// calls add seconds each, so give the cron real headroom beyond the 10-15s
// default (60s is within both Hobby and Pro limits).
export const maxDuration = 60;

// Rate of change threshold (ft/hour) that triggers high-frequency polling
const RAPID_CHANGE_THRESHOLD = 0.5;

// Cap on awaited event-driven Eddy regenerations per cron pass. Each river can
// mean several sequential Sonnet calls (one per section), so this keeps the
// pass inside maxDuration even on a storm morning when many rivers flip.
const MAX_AWAITED_REGENS = 3;

// A condition-code transition detected during this cron pass, deferred to the
// post-loop publish. Shape matches publishConditionChangeAlert's params.
type Transition = {
  riverSlug: string;
  oldCondition: string;
  newCondition: string;
  gaugeHeightFt: number | null;
};

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

  // Check if this is a high-frequency poll (triggered every 15 minutes). Accept
  // either the header (manual/test) or a query param (Vercel cron can't set headers).
  const isHighFrequencyPoll =
    request.headers.get('x-high-frequency') === 'true' ||
    new URL(request.url).searchParams.get('highFrequency') === '1';

  // Serialize runs. The hourly cron and the 15-minute high-frequency cron BOTH
  // fire at :00, and until now nothing stopped them processing the same
  // stations concurrently. One shared lock name is deliberate — separate names
  // per variant would leave exactly the collision we're removing. The hourly
  // pass covers a superset of the high-frequency stations, so the 15-minute run
  // losing the :00 race is pure duplicate work skipped.
  //
  // The stale window is 2x maxDuration, not the 600s default: a run killed at
  // the ceiling never reaches its finally, so a long window would starve the
  // :15/:30/:45 passes. At 120s the worst case is one skipped cycle.
  const LOCK_JOB = 'update_gauges';
  const LOCK_STALE_SECONDS = 120;
  const gotLock = await tryCronLock(supabase, LOCK_JOB, LOCK_STALE_SECONDS);
  if (!gotLock) {
    console.log('[update-gauges] Skipped: another run holds the lock');
    return NextResponse.json({ skipped: true, reason: 'concurrent run' });
  }

  try {
    // Get gauge stations based on poll type
    let stationsQuery = supabase
      .from('gauge_stations')
      .select('id, usgs_site_id, provider, site_id_external, high_frequency_flag')
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
    const rawStations = stationsData as Array<{
      id: string;
      usgs_site_id: string | null;
      provider: string | null;
      site_id_external: string | null;
      high_frequency_flag: boolean;
    }>;

    // Normalize: provider defaults to usgs; site id prefers the generic
    // column, falling back to the legacy USGS column.
    const stations = rawStations
      .map((s) => ({
        ...s,
        provider: s.provider || 'usgs',
        siteId: s.site_id_external || s.usgs_site_id || '',
      }))
      .filter((s) => s.siteId);

    if (stations.length === 0) {
      return NextResponse.json({
        message: isHighFrequencyPoll 
          ? 'No high-frequency gauge stations found' 
          : 'No active gauge stations found',
        updated: 0,
        highFrequencyUpdated: 0,
      });
    }

    // Fetch readings per flow provider (skip cache to ensure fresh data).
    // Stations are grouped by provider so a failing source can't take down
    // the others.
    const byProvider = new Map<string, typeof stations>();
    for (const station of stations) {
      const group = byProvider.get(station.provider) || [];
      group.push(station);
      byProvider.set(station.provider, group);
    }

    const readings: GaugeReading[] = [];
    for (const [providerId, group] of Array.from(byProvider.entries())) {
      const provider = getFlowProvider(providerId);
      if (!provider) continue;
      try {
        const providerReadings = await provider.fetchLatest(
          group.map((s) => s.siteId),
          { skipCache: true }
        );
        readings.push(...providerReadings);
      } catch (providerErr) {
        console.error(`[Cron] Provider "${providerId}" fetch failed:`, providerErr);
      }
    }

    // Counters (declared up front so both stages can bump them)
    let updated = 0;
    let errors = 0;
    let highFrequencyFlagsSet = 0;
    let highFrequencyFlagsCleared = 0;
    let conditionChanges = 0;
    let flatlined = 0;
    let outboxErrors = 0;
    // Observability for the new gate/outbox: without these, a gate that starts
    // rejecting everything would look identical to a quiet river day.
    const gatedReadings: Partial<Record<GateRejection, number>> = {};
    const outboxOutcomes: Record<string, number> = {};
    // Condition transitions collected during the loop and published after it
    // (elevated ones get the storm-vs-single decision; the rest publish
    // individually).
    const elevatedCrossings: Transition[] = [];
    const otherTransitions: Transition[] = [];

    // Eddy regenerations queued during the loop and AWAITED after it — a
    // fire-and-forget promise gets killed when the serverless runtime freezes
    // after the response is sent, silently dropping the regeneration.
    // condition_change outranks rapid_change for the same river.
    const pendingEddyRegens = new Map<string, TriggerReason>();
    const pendingGaugeRegens = new Set<string>();
    const queueEddyRegen = (slug: string, reason: TriggerReason) => {
      if (reason === 'condition_change' || !pendingEddyRegens.has(slug)) {
        pendingEddyRegens.set(slug, reason);
      }
    };

    // ── Stage 1: land EVERY reading in one batch upsert ─────────────
    // The old per-reading loop did ~4 sequential DB roundtrips × ~250
    // readings — far past maxDuration — so Vercel killed the run mid-loop
    // every hour: only the first ~40% of readings persisted, and the NWS
    // group (appended after all USGS readings) never persisted at all.
    // Persisting everything first makes ingestion immune to enrichment cost.
    const stationBySiteId = new Map(stations.map((s) => [s.siteId, s]));
    type BatchEntry = { reading: GaugeReading; station: (typeof stations)[number] };
    // Postgres rejects two rows with the same conflict key in one
    // INSERT .. ON CONFLICT statement — dedupe on the key, last wins.
    const entryByKey = new Map<string, BatchEntry>();
    for (const reading of readings) {
      const station = stationBySiteId.get(reading.siteId);
      if (!station) continue;
      if (!reading.readingTimestamp) {
        console.warn(`No timestamp for gauge ${reading.siteId}`);
        continue;
      }
      entryByKey.set(`${station.id}|${reading.readingTimestamp}`, { reading, station });
    }
    const entries = Array.from(entryByKey.values());
    const fetchedAt = new Date().toISOString();
    const UPSERT_CHUNK = 500;
    for (let i = 0; i < entries.length; i += UPSERT_CHUNK) {
      const chunk = entries.slice(i, i + UPSERT_CHUNK);
      const { error: upsertError } = await supabase
        .from('gauge_readings')
        .upsert(
          chunk.map(({ reading, station }) => ({
            gauge_station_id: station.id,
            reading_timestamp: reading.readingTimestamp,
            gauge_height_ft: reading.gaugeHeightFt,
            discharge_cfs: reading.dischargeCfs,
            qualifiers: reading.qualifiers?.length ? reading.qualifiers : null,
            fetched_at: fetchedAt,
          })),
          { onConflict: 'gauge_station_id,reading_timestamp' }
        );
      if (upsertError) {
        console.error(`[update-gauges] Batch upsert failed (${chunk.length} rows):`, upsertError.message);
        errors += chunk.length;
      } else {
        updated += chunk.length;
      }
    }

    // ── Stage 2: enrichment, scoped to river-wired stations ─────────
    // Flatline detection, rate-of-change / high-frequency flags, and
    // condition-change alerts only matter for gauges wired to a river via
    // river_gauges — everything user-facing joins through it. Running them
    // for all ~275 stations is what made the old loop unbounded.
    const { data: wiredData, error: wiredError } = await supabase
      .from('river_gauges')
      .select('id, is_primary, gauge_station_id, last_condition_code, level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous, threshold_unit, flood_stage_ft, rivers!inner(slug)');
    if (wiredError) {
      console.error('[update-gauges] river_gauges prefetch failed:', wiredError.message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wiredByStation = new Map<string, any[]>();
    for (const rg of wiredData || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stationId = (rg as any).gauge_station_id as string;
      const group = wiredByStation.get(stationId) || [];
      group.push(rg);
      wiredByStation.set(stationId, group);
    }

    // Secondary gauges do not drive river-wide alerts. Their latest generated
    // condition is the comparison point for deciding whether their own Haiku
    // report needs refreshing.
    const secondaryStationIds = (wiredData || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((rg) => !(rg as any).is_primary)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((rg) => (rg as any).gauge_station_id as string);
    const latestGaugeUpdateByStation = new Map<string, { condition_code: string }>();
    if (secondaryStationIds.length > 0) {
      // Deliberately not filtered on expires_at. An expired report still tells
      // us which condition the stored prose was written for; skipping expired
      // rows left `stored` null, so a gauge whose report had aged out could
      // never trigger an event regeneration and sat on fallback guidance until
      // the next daily baseline run.
      const { data: gaugeUpdateRows } = await supabase
        .from('gauge_updates')
        .select('gauge_station_id, condition_code, generated_at')
        .in('gauge_station_id', secondaryStationIds)
        .order('generated_at', { ascending: false });
      for (const row of gaugeUpdateRows || []) {
        if (!latestGaugeUpdateByStation.has(row.gauge_station_id)) {
          latestGaugeUpdateByStation.set(row.gauge_station_id, { condition_code: row.condition_code });
        }
      }
    }

    // Even scoped, enrichment runs under a time budget: readings are already
    // safe in the DB, so skipping the tail of the checks always beats letting
    // Vercel kill the run before the awaited alerts/regens publish.
    const ENRICH_BUDGET_MS = 30_000;
    const enrichStart = Date.now();
    let enrichmentSkipped = 0;
    const wiredEntries = entries.filter(({ station }) => wiredByStation.has(station.id));

    for (const [index, { reading, station }] of wiredEntries.entries()) {
      if (Date.now() - enrichStart > ENRICH_BUDGET_MS) {
        enrichmentSkipped = wiredEntries.length - index;
        console.warn(
          `[update-gauges] Enrichment budget exhausted after ${index}/${wiredEntries.length} wired stations; ` +
          'skipping the rest (readings already persisted)'
        );
        break;
      }

      // Stuck-sensor / flatline detection: a sensor emitting the identical value across
      // many readings while timestamps advance is likely frozen, not genuinely steady.
      // (A truly stable spring-fed river still jitters at the 0.01 ft / 1 cfs level.)
      try {
        const { data: recent } = await supabase
          .from('gauge_readings')
          .select('gauge_height_ft, discharge_cfs')
          .eq('gauge_station_id', station.id)
          .order('reading_timestamp', { ascending: false })
          .limit(8);
        if (recent && recent.length >= 6) {
          const heights = recent.map(r => r.gauge_height_ft).filter((v): v is number => v !== null);
          const flows = recent.map(r => r.discharge_cfs).filter((v): v is number => v !== null);
          const flatHeight = heights.length >= 6 && new Set(heights).size === 1;
          const flatFlow = flows.length >= 6 && new Set(flows).size === 1;
          if (flatHeight || flatFlow) {
            flatlined++;
            console.warn(
              `[update-gauges] Possible stuck sensor at ${reading.siteId}: ` +
              `${recent.length} identical recent readings (height=${flatHeight}, flow=${flatFlow})`
            );
          }
        }
      } catch (flatErr) {
        console.warn(`[update-gauges] Flatline check failed for ${reading.siteId}:`, flatErr);
      }

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
              `rate=${toNum(rateInfo.rate_ft_per_hour)?.toFixed(2)} ft/hr`
            );

            // Rapid change detected — queue Eddy regeneration for affected
            // rivers (awaited after the loop; slugs come from the Stage-2
            // river_gauges prefetch)
            for (const rawRg of wiredByStation.get(station.id) || []) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const riverSlug = (rawRg as any).rivers?.slug;
              if (riverSlug) {
                queueEddyRegen(riverSlug, 'rapid_change');
              }
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
              `rate=${toNum(rateInfo.rate_ft_per_hour)?.toFixed(2)} ft/hr`
            );
          }
        }
      }

      // --- Condition change detection ---
      // river_gauges rows for this station come from the Stage-2 prefetch
      try {
        const riverGauges = wiredByStation.get(station.id);

        if (riverGauges && riverGauges.length > 0) {
          for (const rawRg of riverGauges) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rg = rawRg as any;
            const riverSlug: string | undefined = rg.rivers?.slug;
            if (!riverSlug) continue;
            const thresholdUnit = (rg.threshold_unit || 'ft') as 'ft' | 'cfs';
            const thresholds: ConditionThresholds = {
              levelTooLow: rg.level_too_low,
              levelLow: rg.level_low,
              levelOptimalMin: rg.level_optimal_min,
              levelOptimalMax: rg.level_optimal_max,
              levelHigh: rg.level_high,
              levelDangerous: rg.level_dangerous,
              thresholdUnit,
              // NWS flood stage, so the alert engine reaches the same verdict as
              // the website's get_river_condition RPC. Without it a river above
              // flood stage but below the editorial dangerous band read
              // "Dangerous" on the site while alerts stayed silent.
              floodStageFt: rg.flood_stage_ft,
            };

            // Refuse to act on untrustworthy data. A stuck or equipment-flagged
            // sensor used to classify exactly like a clean one — and because
            // this path posts publicly, that could put a false DANGEROUS on
            // Facebook.
            const gate = gateReading({
              gaugeHeightFt: reading.gaugeHeightFt,
              dischargeCfs: reading.dischargeCfs,
              thresholdUnit,
              floodStageFt: rg.flood_stage_ft,
              qualifiers: reading.qualifiers,
              readingAt: reading.readingTimestamp,
              provider: station.provider,
            });
            if (!gate.ok) {
              gatedReadings[gate.reason] = (gatedReadings[gate.reason] ?? 0) + 1;
              continue;
            }

            const newCondition = computeCondition(
              reading.gaugeHeightFt,
              thresholds,
              reading.dischargeCfs,
              // Never classify one unit's number against the other's thresholds.
              { strictUnit: true }
            );
            const newCode = newCondition.code;

            if (!rg.is_primary) {
              const stored = latestGaugeUpdateByStation.get(station.id);
              if (!stored || !hasMaterialConditionChange(stored.condition_code, newCode)) continue;

              // Match the primary path's elevated debounce: do not regenerate
              // safety copy from a single high/flood sample.
              let previousCode: string | null = null;
              if (newCode === 'high' || newCode === 'dangerous') {
                const { data: previousRows } = await supabase
                  .from('gauge_readings')
                  .select('gauge_height_ft, discharge_cfs')
                  .eq('gauge_station_id', station.id)
                  .lt('reading_timestamp', reading.readingTimestamp)
                  .order('reading_timestamp', { ascending: false })
                  .limit(1);
                const previous = previousRows?.[0];
                if (!previous) continue;
                const previousCondition = computeCondition(
                  previous.gauge_height_ft,
                  thresholds,
                  previous.discharge_cfs,
                );
                previousCode = previousCondition.code;
              }

              if (!confirmsGaugeConditionChange({
                storedCondition: stored.condition_code,
                liveCondition: newCode,
                previousCondition: previousCode,
              })) continue;

              pendingGaugeRegens.add(station.id);
              continue;
            }

            const oldCode = rg.last_condition_code || 'unknown';
            if (newCondition.code !== oldCode && newCondition.code !== 'unknown') {
              console.log(
                `Condition change for ${riverSlug}: ${oldCode} → ${newCondition.code} ` +
                `(gauge ${reading.siteId}, ${reading.gaugeHeightFt?.toFixed(1)} ft)`
              );

              // `dangerous` fires on the first clean reading; `high` needs two
              // consecutive readings. Safety warnings must not wait an hour,
              // but a one-off spike shouldn't cry wolf either.
              const requiredConfirmations = newCondition.code === 'high' ? 2 : 1;

              // Atomic: compare-and-swap of last_condition_code + the outbox
              // event in one transaction (migration 00189). Replaces a bare
              // UPDATE whose result was discarded — if the run died before the
              // post-loop publish, that transition was lost forever.
              const { data: rpcRows, error: rpcError } = await supabase.rpc(
                'record_condition_transition',
                {
                  p_river_gauge_id: rg.id,
                  p_expected_condition_code: rg.last_condition_code,
                  p_new_condition_code: newCondition.code,
                  p_kind: classifyEventKind(oldCode, newCondition.code),
                  p_reading_value: gate.value,
                  p_reading_unit: thresholdUnit,
                  p_reading_at: reading.readingTimestamp,
                  p_required_confirmations: requiredConfirmations,
                  p_metadata: { site_id: reading.siteId, gauge_height_ft: reading.gaugeHeightFt },
                }
              );

              if (rpcError) {
                // Nothing flipped and no event, so the next pass re-detects
                // naturally. This is exactly what the outbox buys us.
                console.error(`[update-gauges] Outbox RPC failed for ${riverSlug}:`, rpcError.message);
                outboxErrors++;
                continue;
              }

              const outcome = (Array.isArray(rpcRows) ? rpcRows[0]?.outcome : null) ?? 'unknown';
              outboxOutcomes[outcome] = (outboxOutcomes[outcome] ?? 0) + 1;

              // Only a genuine emit feeds the social path and Eddy regeneration.
              // 'pending' (debouncing), 'stale_cas' (another run won) and
              // 'duplicate' must stay silent. This preserves today's coupling:
              // the cron posts iff it advanced the condition.
              if (outcome !== 'emitted') continue;

              conditionChanges++;

              // Defer ALL transitions to the post-loop publish (awaited): the
              // elevated ones get the storm-vs-single decision; the rest
              // (easing etc.) publish individually.
              const transition: Transition = {
                riverSlug,
                oldCondition: oldCode,
                newCondition: newCondition.code,
                gaugeHeightFt: reading.gaugeHeightFt,
              };
              if (isElevatedCrossing(oldCode, newCondition.code)) {
                elevatedCrossings.push(transition);
              } else {
                otherTransitions.push(transition);
              }

              // Queue Eddy regeneration for this river (awaited after the
              // loop; throttled inside regenerateEddyForRiver)
              queueEddyRegen(riverSlug, 'condition_change');
            }
          }
        }
      } catch (condErr) {
        console.error(`Condition check error for station ${station.id}:`, condErr);
      }
    }

    // ── Post-loop alert publishing (awaited) ────────────────────────
    // Elevated crossings run through publishElevatedCrossings, which dedupes per
    // river (multiple gauges → one entry, most severe) and uses a rolling window
    // to prefer ONE storm digest over a barrage of individual reels. Other
    // transitions (easing etc.) publish individually — publishCondition
    // ChangeAlert classifies and no-ops the non-notable ones (incl. drops back
    // to floatable water, which no longer post an all-clear).
    if (elevatedCrossings.length > 0) {
      try {
        const result = await publishElevatedCrossings(elevatedCrossings);
        console.log(`[update-gauges] Elevated crossings (${elevatedCrossings.length}): ${result.mode}, published ${result.published}`);
      } catch (alertErr) {
        console.error('Elevated-crossing alert error:', alertErr);
      }
    }
    for (const t of otherTransitions) {
      try {
        await publishConditionChangeAlert(t);
      } catch (alertErr) {
        console.error(`Condition alert publish error for ${t.riverSlug}:`, alertErr);
      }
    }

    // ── Event-driven Eddy regeneration (awaited) ────────────────────
    // condition_change regens run first; capped so a storm morning with many
    // flips can't blow past maxDuration. Skipped rivers keep their morning
    // report and the live-condition overlay suppresses any stale prose.
    let eddyRegensGenerated = 0;
    let eddyRegensSkipped = 0;
    if (pendingEddyRegens.size > 0) {
      const prioritized = Array.from(pendingEddyRegens.entries()).sort(
        ([, a], [, b]) => Number(b === 'condition_change') - Number(a === 'condition_change'),
      );
      const toRun = prioritized.slice(0, MAX_AWAITED_REGENS);
      eddyRegensSkipped = prioritized.length - toRun.length;
      if (eddyRegensSkipped > 0) {
        console.warn(
          `[update-gauges] Skipping ${eddyRegensSkipped} Eddy regen(s) this pass (cap ${MAX_AWAITED_REGENS}): ` +
          prioritized.slice(MAX_AWAITED_REGENS).map(([slug]) => slug).join(', ')
        );
      }

      const regenResults = await Promise.allSettled(
        toRun.map(([slug, reason]) => regenerateEddyForRiver(slug, reason)),
      );
      for (let i = 0; i < regenResults.length; i++) {
        const r = regenResults[i];
        if (r.status === 'fulfilled') {
          eddyRegensGenerated += r.value;
        } else {
          console.error(`Eddy regen error for ${toRun[i][0]}:`, r.reason);
        }
      }
    }

    // Secondary reports refresh independently and never emit river alerts or
    // change the primary river condition. A capped tail retries naturally on
    // the next poll because the stored report remains mismatched.
    let gaugeRegensGenerated = 0;
    let gaugeRegensSkipped = 0;
    if (pendingGaugeRegens.size > 0) {
      const targets = await getSecondaryGaugeTargets();
      const targetByStation = new Map(targets.map((target) => [target.gaugeStationId, target]));
      const queuedTargets = Array.from(pendingGaugeRegens)
        .map((stationId) => targetByStation.get(stationId))
        .filter((target): target is NonNullable<typeof target> => Boolean(target));
      const toRun = queuedTargets.slice(0, MAX_GAUGE_REGENS_PER_POLL);
      gaugeRegensSkipped = queuedTargets.length - toRun.length;
      const regenResults = await Promise.allSettled(toRun.map((target) => regenerateGaugeUpdate(target)));
      for (const result of regenResults) {
        if (result.status === 'fulfilled') gaugeRegensGenerated += result.value;
        else console.error('[GaugeRegen] Event regeneration failed:', result.reason);
      }
    }

    const executionTime = new Date().toISOString();

    // ── Alert-pipeline observability ────────────────────────────────
    // Vercel does not store cron responses, so the counters below would
    // otherwise be invisible: a gate rejecting every reading looks exactly like
    // a quiet river day. One structured line per run makes it greppable, and
    // genuine anomalies go through the logger chokepoint so they reach whatever
    // reporter instrumentation.ts registered (ERROR_WEBHOOK_URL today).
    const gatedTotal = Object.values(gatedReadings).reduce((sum, n) => sum + (n ?? 0), 0);
    logger.info('[update-gauges] alert pipeline', {
      wiredStations: wiredEntries.length,
      conditionChanges,
      gatedTotal,
      gatedReadings,
      outboxOutcomes,
      outboxErrors,
      isHighFrequencyPoll,
    });

    if (outboxErrors > 0) {
      // The outbox is the durability guarantee — failures here mean transitions
      // are being re-detected rather than recorded, and must not stay silent.
      logger.error(
        '[update-gauges] outbox writes failed',
        new Error(`record_condition_transition failed ${outboxErrors}x`),
        { outboxErrors, outboxOutcomes }
      );
    } else if (wiredEntries.length > 0 && gatedTotal >= wiredEntries.length) {
      // Every wired gauge rejected: far more likely a provider/format change or
      // an over-tight gate than every sensor failing at once.
      logger.error(
        '[update-gauges] every wired reading was gated',
        new Error(`all ${gatedTotal} wired readings rejected by the quality gate`),
        { gatedReadings, wiredStations: wiredEntries.length }
      );
    }

    return NextResponse.json({
      message: 'Gauge update complete',
      updated,
      errors,
      total: readings.length,
      isHighFrequencyPoll,
      highFrequencyFlagsSet,
      highFrequencyFlagsCleared,
      conditionChanges,
      gaugeRegensGenerated,
      gaugeRegensSkipped,
      flatlined,
      wiredStations: wiredEntries.length,
      gatedReadings,
      outboxOutcomes,
      outboxErrors,
      enrichmentSkipped,
      eddyRegensGenerated,
      eddyRegensSkipped,
      executionTime,
      stationsProcessed: stations.length,
    });
  } catch (error) {
    console.error('Error in gauge update cron:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    // Best-effort: if the lambda is killed at maxDuration this never runs, which
    // is why LOCK_STALE_SECONDS is deliberately short.
    await releaseCronLock(supabase, LOCK_JOB);
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
