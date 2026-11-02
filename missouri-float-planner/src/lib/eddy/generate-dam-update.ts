// src/lib/eddy/generate-dam-update.ts
// Gathers what a dam's Eddy's Read is computed from: the current snapshot,
// two weeks of observed turbine flow, and the schedule versions Eddy stored.
//
// No model. The Read is written in code from conclusions the facts support
// (dam-read-facts.ts, ADR 0017): two earlier versions let a model write part
// of it, and review showed no check could keep its claims tied to the facts.
// The cron stores the facts; the route renders them against the schedule
// posted when the Read is served.

import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import type { DamSnapshot, DamScheduleDay } from '@shared/dam-types';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import { fetchDamDetail, markMinimumFlowHours } from '@/lib/data/dams';
import { readStoredSnapshot } from '@/lib/data/dam-snapshot-store';
import { forecastHistoryRows } from '@/lib/data/dam-forecast-history';
import {
  PATTERN_WINDOW_DAYS,
  buildDamReadFacts,
  damReadHasSubstance,
  damReadHeadline,
  damReadStory,
  type DamReadFacts,
  type ObservedHourRow,
  type ScheduleVersion,
} from './dam-read-facts';

const DAY_MS = 86_400_000;

export interface GeneratedDamUpdate {
  damId: string;
  /** As written, for the record; the route re-renders from `facts`. */
  headline: string;
  story: string;
  facts: DamReadFacts;
  scheduleHash: string | null;
  sourcesUsed: string[];
}

/**
 * The hash of the posted schedule a snapshot carries: the same canonical form
 * dam_forecast_history versions on, so "the schedule changed" means the same
 * thing in both places.
 */
export function scheduleHashOf(snapshot: DamSnapshot): string | null {
  return forecastHistoryRows(snapshot).find((r) => r.source === 'swpa_schedule')?.content_hash ?? null;
}

/** The current snapshot: the stored one, else a live assembly. Null when neither exists. */
export async function currentDamSnapshot(damId: string, now = Date.now()): Promise<DamSnapshot | null> {
  return (await readStoredSnapshot(damId, { now })) ?? (await fetchDamDetail(damId));
}

async function readObserved(damId: string, now: number): Promise<ObservedHourRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('dam_metric_readings')
    .select('observed_hour, value_cfs')
    .eq('dam_id', damId)
    .eq('metric', 'generationFlow')
    .gte('observed_hour', new Date(now - (PATTERN_WINDOW_DAYS + 2) * DAY_MS).toISOString())
    .order('observed_hour', { ascending: true })
    .limit(1000);
  if (error) throw new Error(`dam_metric_readings: ${error.message}`);
  return (data ?? []).map((r: { observed_hour: string; value_cfs: number }) => ({
    observedHour: r.observed_hour,
    valueCfs: Number(r.value_cfs),
  }));
}

async function readScheduleVersions(damId: string, now: number): Promise<ScheduleVersion[]> {
  const dam = getUsaceDam(damId);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('dam_forecast_history')
    .select('first_seen_at, payload')
    .eq('dam_id', damId)
    .eq('source', 'swpa_schedule')
    .gte('last_seen_at', new Date(now - (PATTERN_WINDOW_DAYS + 2) * DAY_MS).toISOString())
    .order('first_seen_at', { ascending: true })
    .limit(300);
  if (error) throw new Error(`dam_forecast_history: ${error.message}`);
  return (data ?? [])
    .filter((r: { payload: unknown }) => Array.isArray(r.payload))
    .map((r: { first_seen_at: string; payload: DamScheduleDay[] }) => ({
      firstSeenAt: r.first_seen_at,
      // Re-marked on read: versions stored before the minimum-flow flag existed
      // carry Bull Shoals' minimum flow as generation. See scheduleReliability.
      days: r.payload.map((d) => ({ ...d, hours: dam ? markMinimumFlowHours(dam, d.hours) : d.hours })),
    }));
}

/** Gather, compute, and write. Null when the dam is unknown or there is nothing to say. */
export async function generateDamUpdate(damId: string, now = Date.now()): Promise<GeneratedDamUpdate | null> {
  const dam = getUsaceDam(damId);
  if (!dam || typeof dam.generationOnCfs !== 'number') return null;
  const snapshot = await currentDamSnapshot(damId, now);
  if (!snapshot) return null;

  const [observed, versions] = await Promise.all([
    readObserved(damId, now),
    readScheduleVersions(damId, now).catch((err) => {
      // The track record is optional; the rest of the Read is not held hostage to it.
      logger.warn('generate-dam-update: schedule history unavailable', { damId, error: String(err) });
      return [] as ScheduleVersion[];
    }),
  ]);

  const facts = buildDamReadFacts({
    damId,
    damName: snapshot.name,
    floorCfs: dam.generationOnCfs,
    reference: snapshot.generationReference
      ? { units: snapshot.generationReference.units, fullGenerationCfs: snapshot.generationReference.fullGenerationCfs }
      : null,
    schedule: snapshot.schedule,
    observed,
    scheduleVersions: versions,
    now,
  });
  if (!damReadHasSubstance(facts)) return null;

  const sourcesUsed = ['USACE turbine history'];
  if (facts.posted) sourcesUsed.push('SWPA schedule');
  if (facts.reliability) sourcesUsed.push('Eddy schedule history');

  return {
    damId,
    headline: damReadHeadline(facts),
    story: damReadStory(facts).join(' '),
    facts,
    scheduleHash: scheduleHashOf(snapshot),
    sourcesUsed,
  };
}
