// src/lib/eddy/generate-dam-update.ts
// Eddy's Read for a dam: facts and rows computed in dam-read-facts.ts, an
// interpretation by the gauge-update model (Haiku), checked, and replaced by
// deterministic text when the check fails or the model is unavailable.
//
// The gauge generator excludes USACE stations with "Revisit when dam context is
// deliberately added to the prompt." This is that prompt, kept separate rather
// than bolted onto the gauge one, because a dam's water is an operator's
// decision and the questions a reader brings are different: when do the units
// come on, and how much can the posted plan be trusted.
//
// Code renders every fact (damReadRows); the model writes only the
// interpretation beside them, and anything in it that looks like a fact is
// rejected (damProseProblems). Unlike the gauge generator, a failed model call
// does not skip the dam: the fallback interpretation is written from the same
// facts and passes the same checks, so a Read exists whenever there is
// something to say.

import Anthropic from '@anthropic-ai/sdk';
import { trackedAnthropic } from '@/lib/telemetry/upstream';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import type { DamSnapshot, DamScheduleDay } from '@shared/dam-types';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import { fetchDamDetail, markMinimumFlowHours } from '@/lib/data/dams';
import { readStoredSnapshot } from '@/lib/data/dam-snapshot-store';
import { forecastHistoryRows } from '@/lib/data/dam-forecast-history';
import { getRiverContext } from '@/lib/rivers/context';
import { fetchWaterTemperature } from '@/lib/usgs/water-temperature';
import { fetchDissolvedOxygen } from '@/lib/usgs/dissolved-oxygen';
import { extractUsage, type UsageStats } from '@/lib/eddy/generate-update';
import { replaceEmDashes, stripEddyMarkers } from '@/lib/eddy/parse-response';
import type { ResolvedModel } from '@/lib/ai/resolve-models';
import {
  PATTERN_WINDOW_DAYS,
  buildDamReadFacts,
  damProseFallback,
  damReadFactsPrompt,
  damReadHasSubstance,
  damReadHeadline,
  prepareDamProse,
  type DamReadFacts,
  type ObservedHourRow,
  type ScheduleVersion,
  type WaterQualityFact,
} from './dam-read-facts';

const DAY_MS = 86_400_000;
const CORPS_TEMP_SOURCE = 'Corps tailwater sensor';

export interface GeneratedDamUpdate {
  damId: string;
  /** From the posted schedule at write time; re-rendered when served. */
  headline: string;
  /** Eddy's interpretation, checked by damProseProblems or the fallback. */
  prose: string;
  facts: DamReadFacts;
  scheduleHash: string | null;
  usedFallback: boolean;
  sourcesUsed: string[];
  usage: UsageStats | null;
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

async function waterQuality(snapshot: DamSnapshot): Promise<{ temp: WaterQualityFact | null; oxygen: WaterQualityFact | null }> {
  const site = snapshot.tailwater?.waterQualitySiteId;
  const siteName = snapshot.tailwater?.waterQualitySiteName ?? 'USGS monitor below the dam';
  const corpsTemp = snapshot.metrics.tailwaterTempF;

  const [usgsTemp, oxygen] = await Promise.all([
    !corpsTemp && site ? fetchWaterTemperature(site).catch(() => null) : Promise.resolve(null),
    site ? fetchDissolvedOxygen(site).catch(() => null) : Promise.resolve(null),
  ]);

  const temp: WaterQualityFact | null = corpsTemp
    ? { value: corpsTemp.value, observedAt: corpsTemp.at, where: CORPS_TEMP_SOURCE }
    : usgsTemp ? { value: usgsTemp.valueF, observedAt: usgsTemp.observedAt, where: siteName } : null;
  return {
    temp,
    oxygen: oxygen ? { value: oxygen.valueMgL, observedAt: oxygen.observedAt, where: siteName } : null,
  };
}

/** Gather and compute. Null when the dam is unknown or there is nothing to say. */
export async function loadDamReadFacts(
  damId: string,
  now = Date.now(),
): Promise<{ facts: DamReadFacts; snapshot: DamSnapshot; sourcesUsed: string[] } | null> {
  const dam = getUsaceDam(damId);
  if (!dam || typeof dam.generationOnCfs !== 'number') return null;
  const snapshot = await currentDamSnapshot(damId, now);
  if (!snapshot) return null;

  const [observed, versions, water, river] = await Promise.all([
    readObserved(damId, now),
    readScheduleVersions(damId, now).catch((err) => {
      // Reliability is optional; the rest of the Read is not held hostage to it.
      logger.warn('generate-dam-update: schedule history unavailable', { damId, error: String(err) });
      return [] as ScheduleVersion[];
    }),
    waterQuality(snapshot),
    snapshot.tailwater?.riverSlug ? getRiverContext(snapshot.tailwater.riverSlug).catch(() => null) : Promise.resolve(null),
  ]);

  const facts = buildDamReadFacts({
    damId,
    damName: snapshot.name,
    riverName: river?.name ?? null,
    tailwaterFishery: snapshot.tailwaterFishery ?? null,
    floorCfs: dam.generationOnCfs,
    reference: snapshot.generationReference
      ? { units: snapshot.generationReference.units, fullGenerationCfs: snapshot.generationReference.fullGenerationCfs }
      : null,
    schedule: snapshot.schedule,
    observed,
    scheduleVersions: versions,
    waterTempF: water.temp,
    dissolvedOxygenMgL: water.oxygen,
    now,
  });
  if (!damReadHasSubstance(facts)) return null;

  const sourcesUsed = ['USACE turbine history'];
  if (facts.posted) sourcesUsed.push('SWPA schedule');
  if (facts.reliability) sourcesUsed.push('Eddy schedule history');
  const corpsTemp = facts.waterTempF?.where === CORPS_TEMP_SOURCE;
  if (corpsTemp) sourcesUsed.push('USACE water temperature');
  if (facts.dissolvedOxygenMgL || (facts.waterTempF && !corpsTemp)) sourcesUsed.push('USGS water quality');
  return { facts, snapshot, sourcesUsed };
}

export async function generateDamUpdate(
  damId: string,
  model: ResolvedModel,
  now = Date.now(),
): Promise<GeneratedDamUpdate | null> {
  const loaded = await loadDamReadFacts(damId, now);
  if (!loaded) return null;
  const { facts, snapshot, sourcesUsed } = loaded;
  const base = { damId, facts, headline: damReadHeadline(facts), scheduleHash: scheduleHashOf(snapshot), sourcesUsed };

  const fallback = (): GeneratedDamUpdate => ({ ...base, prose: damProseFallback(facts), usedFallback: true, usage: null });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback();

  try {
    const client = new Anthropic({ apiKey });
    const message = await trackedAnthropic('dam_update', model.id, () => client.messages.create({
      model: model.id,
      max_tokens: model.maxTokens,
      ...(model.thinking ? { thinking: model.thinking } : {}),
      system: DAM_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: damReadFactsPrompt(facts) }],
    }));
    const text = message.content.find((b) => b.type === 'text');
    const raw = text?.text ? replaceEmDashes(text.text.trim()) : '';
    if (!raw) return fallback();

    const { prose, usedFallback, problems } = prepareDamProse(raw, facts);
    if (usedFallback) logger.warn('generate-dam-update: prose failed checks', { damId, problems });
    return { ...base, prose: stripEddyMarkers(prose), usedFallback, usage: extractUsage(model.id, message.usage) };
  } catch (err) {
    logger.warn('generate-dam-update: model call failed', { damId, error: err instanceof Error ? err.message : String(err) });
    return fallback();
  }
}

/**
 * The model's whole job is interpretation. Every fact it might be tempted to
 * restate is a row rendered by code beside its text, and damProseProblems
 * rejects digits, clock words, schedule claims, "today", live-state claims and
 * measurements outright, so the rules below are instructions the check
 * enforces rather than hopes.
 */
export const DAM_SYSTEM_PROMPT = `You are Eddy, the otter guide in a float and fishing trip app. You write the short interpretive part of a Read for a hydropower dam on a trout tailwater.

WHO READS THIS: an angler or floater deciding when to be on the water below the dam. Beside your text the app shows rows with the posted schedule, the usual and earliest start times, how the mornings have gone, how long runs last, how big they are, how the posted schedule has held, and the water readings. Do not repeat any of them. Say what they add up to: the character of this dam lately.

VOICE: A local guide who knows this tailwater. Warm, plain, direct about anything that affects wading. No forced jokes, puns or catchphrases.

OUTPUT FORMAT (strict): the marker [READ] on its own line, then two or three sentences, under 400 characters in all. Output nothing else.

WHAT TO WRITE: the shape of recent days in words. For example whether generation has come in the morning, the afternoon or the evening, whether mornings have stayed quiet, whether runs have been short peaking runs or long releases, whether weekends differ from weekdays, and whether the units have sometimes come on well before the usual time. When there is no consistent pattern, say so plainly.

RULES (text that breaks any of them is discarded):
- No numbers of any kind, written as digits or as words. No clock times, no "noon" or "midnight".
- Do not mention today, tonight, tomorrow or this morning, and do not describe the schedule or the plan. The rows do that.
- Do not say what the dam is doing now. No "right now", "currently", "is generating".
- Describe the past only: "lately", "usually", "on recent weekdays". Never say the units will do anything. Never call the dam predictable or reliable.
- No measurements: no flows, temperatures or oxygen.
- No em dashes, emojis, hashtags or exclamation marks. No greeting, sign-off or "I".`;
