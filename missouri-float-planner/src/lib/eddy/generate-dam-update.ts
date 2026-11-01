// src/lib/eddy/generate-dam-update.ts
// Eddy's Read for a dam: facts computed in dam-read-facts.ts, prose by the
// gauge-update model (Haiku), checked, and replaced by deterministic text when
// the check fails or the model is unavailable.
//
// The gauge generator excludes USACE stations with "Revisit when dam context is
// deliberately added to the prompt." This is that prompt, kept separate rather
// than bolted onto the gauge one, because a dam's water is an operator's
// decision and the questions a reader brings are different: when do the units
// come on, and how much can the posted plan be trusted.
//
// Unlike the gauge generator, a failed model call does not skip the dam. The
// fallback is written from the same facts and passes the same checks, so a
// Read always exists when there is something to say.

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
  damReadFactsPrompt,
  damReadFallback,
  damReadHasSubstance,
  prepareDamRead,
  type DamReadFacts,
  type ObservedHourRow,
  type ScheduleVersion,
  type WaterQualityFact,
} from './dam-read-facts';

const DAY_MS = 86_400_000;
const CORPS_TEMP_SOURCE = 'Corps tailwater sensor';

export interface GeneratedDamUpdate {
  damId: string;
  summaryText: string;
  eddyRead: string | null;
  quoteText: string;
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
    schedule: snapshot.schedule,
    observed,
    scheduleVersions: versions,
    waterTempF: water.temp,
    dissolvedOxygenMgL: water.oxygen,
    generatingNow: snapshot.generating,
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
  const base = { damId, facts, scheduleHash: scheduleHashOf(snapshot), sourcesUsed };

  const fallback = (): GeneratedDamUpdate => {
    const report = damReadFallback(facts);
    return { ...base, summaryText: report.summaryText!, eddyRead: report.eddyRead, quoteText: report.quoteText, usedFallback: true, usage: null };
  };

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

    const { report, usedFallback, problems } = prepareDamRead(raw, facts);
    if (usedFallback) logger.warn('generate-dam-update: prose failed checks', { damId, problems });
    return {
      ...base,
      summaryText: stripEddyMarkers(report.summaryText!),
      eddyRead: report.eddyRead ? stripEddyMarkers(report.eddyRead) : null,
      quoteText: stripEddyMarkers(report.quoteText),
      usedFallback,
      usage: extractUsage(model.id, message.usage),
    };
  } catch (err) {
    logger.warn('generate-dam-update: model call failed', { damId, error: err instanceof Error ? err.message : String(err) });
    return fallback();
  }
}

export const DAM_SYSTEM_PROMPT = `You are Eddy, the otter guide in a float and fishing trip app. You write a short Read for a hydropower dam on a trout tailwater, for an angler or floater deciding when to be on the water below it.

WHO READS THIS: someone who wants to know when the water is likely to come up. The page beside your text already shows the measured hourly chart and the posted schedule, so say what those cannot: what the plan and the recent pattern mean together.

VOICE: A local guide who knows this tailwater. Warm, plain, direct about anything that affects wading. No forced jokes, puns or catchphrases.

THE THREE KINDS OF FACT, never blurred:
- POSTED SCHEDULE: what SWPA has planned. It always outranks the pattern. Call it scheduled or posted.
- RECENT PATTERN: what the units actually did lately. Say usually, lately, or over the last two weeks. It is never a promise.
- HOW THE SCHEDULE HAS HELD UP: how closely recent posted plans matched what ran.

OUTPUT FORMAT (strict):
Begin with the exact [CLAIMS] line from the facts. Then three blocks, each starting with its marker on its own line: [SUMMARY], [EDDY_READ], [FULL]. Use each marker once. Output nothing else.

[SUMMARY]
One sentence, under 140 characters: the most useful thing about today. If a schedule is posted, lead with it.

[EDDY_READ]
One or two sentences, under 260 characters: the pattern insight a reader could not get from today's schedule alone, such as how weekends differ from weekdays, or how early the units have started on odd days. When there is no consistent pattern, say so plainly.

[FULL]
3 to 5 sentences. Cover today's posted schedule (and tomorrow's when given), the recent pattern for today's kind of day, how the schedule has held up when given, and the water readings when given. It must say the times are at the dam and that water downstream rises later.

RULES:
- Use only clock times that appear in the facts, written like "3 PM", "noon" or "midnight". Never add minutes, never invent a time, never shift one.
- Never say the units will start, rise, run or generate. Plans are "scheduled"; patterns are "usually" or "lately". Never call the dam predictable or reliable.
- When the earliest recent start is well before the usual one, mention it: early is the direction that catches someone in rising water.
- All times are at the dam. Do not estimate when water reaches any place downstream.
- Copy water temperature and dissolved oxygen exactly as given, with the station named; attach no verdict about fish.
- No em dashes, emojis, hashtags or exclamation marks. No greeting, sign-off or "I".`;
