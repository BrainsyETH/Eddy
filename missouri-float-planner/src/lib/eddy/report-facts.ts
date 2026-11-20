// Facts are calculated once, in matching units, before either report writer runs.
// This is deliberately SDK/DB-free so the production failure can be replayed.
import { classifyReading, type ConditionThresholds } from '@shared/condition-ladder';
import { CONDITION_SYSTEM, type ConditionCode } from '@shared/condition-system';
import type { NWSAlert } from '../nws/alerts';
import { parseEddyResponse, stripEddyMarkers, type ParsedEddyResponse } from './parse-response';

export interface ReportFactsInput {
  gaugeName: string | null;
  locationName?: string;
  /** The river loader already classified this snapshot. Secondary gauges classify once here. */
  conditionCode?: ConditionCode;
  /** Relevant active NWS flood alerts, independently of the gauge rating. */
  floodAlerts?: readonly Pick<NWSAlert, 'event' | 'areaDesc'>[];
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholds: ConditionThresholds;
  /** Set only when the section's database-resolved or explicitly assigned station was loaded. */
  supportedSection?: string | null;
  requestedSection?: string | null;
}

/** Input comes from the active-alert endpoint and the river-area filter.
 * Recheck expiry because cached alerts can expire between requests. */
export function activeReportFloodAlerts(alerts: readonly NWSAlert[], now = Date.now()) {
  return alerts.filter(alert => /\bflood\b/i.test(alert.event)
    && (!alert.expires || Date.parse(alert.expires) > now));
}

export function formatReportMeasurement(value: number | null, unit: 'ft' | 'cfs'): string {
  if (value == null) return 'unavailable';
  return `${value.toLocaleString('en-US', { maximumFractionDigits: unit === 'ft' ? 2 : 0 })} ${unit}`;
}

function formatBound(value: number | null): string {
  return value == null ? 'unknown' : value.toLocaleString('en-US', { maximumFractionDigits: 20 });
}

function allowedReadingValues(value: number, unit: string): number[] {
  // Accept the raw value and explicit display conventions, not arbitrary
  // near values: stage to one/two decimals, flow to whole cfs or nearest ten.
  return unit === 'ft' ? [value, ...[1, 2].map(digits => Number(value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: digits })))]
    : [value, Math.round(value), Math.round(value / 10) * 10];
}

export function buildReportFacts(input: ReportFactsInput) {
  const unit = input.thresholds.thresholdUnit ?? 'ft';
  const value = unit === 'cfs' ? input.dischargeCfs : input.gaugeHeightFt;
  const min = input.thresholds.levelOptimalMin;
  const max = input.thresholds.levelOptimalMax;
  const relation = value == null || !Number.isFinite(value) || min == null || max == null || min > max
    ? 'unavailable'
    : value < min ? 'below' : value > max ? 'above' : 'within';
  const conditionCode = input.conditionCode ?? classifyReading(input.gaugeHeightFt, input.thresholds, input.dischargeCfs);
  return { ...input, unit, value, min, max, relation, conditionCode, conditionLabel: CONDITION_SYSTEM[conditionCode].label };
}
export type ReportFacts = ReturnType<typeof buildReportFacts>;

export function reportFactsPrompt(f: ReportFacts): string {
  const danger = f.thresholds.levelDangerous;
  const ladder = ladderLines(f);
  const position = ladderPosition(f);
  return [
    '[AUTHORITATIVE GAUGE FACTS — override examples and background knowledge]',
    `Begin your response with exactly this single line: ${reportClaimsLine(f)}`,
    'Then write [SUMMARY], [EDDY_READ], and [FULL]. Whenever you state the current condition, the optimal-range comparison or a gauge measurement, use exactly the facts below.',
    `Reporting gauge: ${f.gaugeName}`,
    'If no alerts are supplied, do not claim that no alerts are active: lookup or matching coverage may be unavailable.',
    ...(f.floodAlerts?.length ? [
      `Active NWS flood alerts for the surrounding river area: ${f.floodAlerts.map(a => `${a.event}${a.areaDesc ? ` (${a.areaDesc})` : ''}`).join('; ')}.`,
      'Lead the summary and the full text with the active flood alert and its affected area. A Good or unavailable gauge rating does not cancel an NWS alert; the alert is not a new gauge condition label.',
    ] : []),
    `Computed condition: ${f.conditionLabel} (${f.conditionCode}). Do not upgrade, downgrade, or reinterpret this label.`,
    `Rating measurement: ${f.unit === 'cfs' ? 'discharge' : 'gauge height'}; value: ${formatReportMeasurement(f.value, f.unit)}.`,
    `Separate measurements: height ${formatReportMeasurement(f.gaugeHeightFt, 'ft')}; discharge ${formatReportMeasurement(f.dischargeCfs, 'cfs')}. These are not interchangeable.`,
    'If you name the rating, use its capitalized label in a natural sentence. Never write it as a field such as "condition: Good"; the [CLAIMS] line already carries the structured claim.',
    // The whole ladder, not only the optimal range. Until 2026-11-19 a Too Low
    // Read was told where floating is best and nothing about where floating
    // starts, so it could not say how far off the river was.
    ...(ladder.length ? ["This gauge's float levels (Eddy's own levels, not official limits, except where flood stage is named):", ...ladder] : []),
    // Both ends or neither: a one-ended "400 to unknown cfs" had Reads telling
    // people the comparison "is not fully resolved at this reading".
    ...(f.relation === 'unavailable' ? [] : [`Optimal range: ${formatBound(f.min)} to ${formatBound(f.max)} ${f.unit}. Computed comparison: ${f.relation}.`]),
    ...(plainRelation(f) ? [`In plain words for the reader: ${plainRelation(f)}`] : []),
    ...(position ? [`How far today is from the next level: ${position}`] : []),
    ...(f.relation === 'below' && (f.conditionCode === 'good' || f.conditionCode === 'flowing')
      ? [`(For you, not the reader: ${BELOW_OPTIMAL_NOTE})`] : []),
    ...(danger == null ? [] : [`Editorial danger threshold: ${danger} ${f.unit}. This is NOT an official closure order. Do not call it a closure level.`]),
    ...(f.thresholds.floodStageFt == null ? [] : [`Official flood stage: ${f.thresholds.floodStageFt} ft, assessed separately from the recreational optimal range.`]),
    `Supported location: ${f.supportedSection ?? f.gaugeName}.`,
    ...(f.requestedSection && !f.supportedSection ? [`The requested section (${f.requestedSection}) has no resolved gauge of its own. This is a fallback station observation, NOT a condition assessment of that section.`] : []),
    'This reading is for this gauge\'s water only. General local knowledge is background, not a current reading for other places.',
    'Name where this reading is taken once in the summary and once in the full text, using the town or landmark from the gauge name, not the full station name. Do not turn a station assessment into a claim about the entire river.',
  ].join('\n');
}

/** Kept out of the reader-facing sentence: Reads were repeating it to people
 * ("that gap does not by itself mean scraping or dragging"). */
export const BELOW_OPTIMAL_NOTE = 'this comparison alone does not establish shallow water or scraping. Say those only when the notes for this stretch support them.';

/** What the optimal-range comparison means on the water, for the ratings where
 * it adds anything. Too Low/Low already imply "below" and High/Dangerous
 * "above", so restating the comparison there is noise. */
export function plainRelation(f: ReportFacts): string | null {
  if (f.conditionCode !== 'good' && f.conditionCode !== 'flowing') return null;
  if (f.relation === 'below') return 'floatable, with a reading below the optimal range for this gauge.';
  if (f.relation === 'above') return 'floatable, with more water and a quicker current than the sweet spot for this gauge.';
  if (f.relation === 'within') return 'right in the sweet spot for this gauge.';
  return null;
}

/**
 * Where Dangerous starts, as the shared classifier applies it. Two lines can
 * make a reading Dangerous: Eddy's own danger level, in the gauge's rating
 * unit, and official flood stage, which is always a gauge height in feet and
 * wins whatever the flow (classifyReading checks it first).
 *
 * `inUnit` is the nearer of the two when both can be compared: always for a
 * gauge rated in feet. For a gauge rated in cfs they cannot be compared, so
 * `inUnit` is Eddy's level alone and `floodStageFt` has to be said beside it.
 * A Read told only the first was told "3,800 cfs below Dangerous" on water
 * 0.6 ft under flood stage.
 */
export function dangerLine(f: ReportFacts): { inUnit: number | null; floodStageFt: number | null; inUnitIsFloodStage: boolean } {
  const own = f.thresholds.levelDangerous;
  const flood = f.thresholds.floodStageFt ?? null;
  if (f.unit === 'ft' && flood != null && (own == null || flood <= own)) {
    return { inUnit: flood, floodStageFt: null, inUnitIsFloodStage: true };
  }
  // In feet with a nearer danger level of its own, flood stage adds nothing.
  return { inUnit: own, floodStageFt: f.unit === 'cfs' ? flood : null, inUnitIsFloodStage: false };
}

/**
 * The gauge's ladder as the shared classifier applies it (classifyReading in
 * shared/condition-ladder.ts), one level per line. Only levels the ladder
 * defines are listed, so a partial ladder gives a partial list and never an
 * "unknown". Every number carries its unit, so a Read that quotes one can be
 * checked against the inputs (read-checks.ts).
 */
export function ladderLines(f: ReportFacts): string[] {
  const t = f.thresholds;
  const n = (value: number | null) => `${formatBound(value)} ${f.unit}`;
  const flowing = t.levelOptimalMin != null && t.levelOptimalMax != null;
  // Mirrors the classifier: Good starts at level_low, or at optimal_min when a
  // partial ladder has no level_low; High starts above optimal_max.
  const goodFloor = t.levelLow ?? t.levelOptimalMin;
  const highStart = t.levelOptimalMax ?? t.levelHigh;
  const floatFloor = t.levelTooLow ?? goodFloor;
  const goodTop = flowing ? t.levelOptimalMin : highStart;
  const danger = dangerLine(f);
  // "or flood stage", for a gauge rated in cfs whose flood stage is in feet.
  const floodStage = danger.floodStageFt == null ? null : `a gauge height of ${formatBound(danger.floodStageFt)} ft (official flood stage)`;
  const orFlood = floodStage ? `, or ${floodStage}, whichever comes first` : '';
  const lines: string[] = [];
  if (floatFloor != null) lines.push(`- Too Low (not worth floating): below ${n(floatFloor)}`);
  if (t.levelTooLow != null && (goodFloor == null || t.levelTooLow < goodFloor)) {
    // No "with some dragging": what low water means differs by river and by
    // stretch (speed on big water, a walk on a small creek), and the message's
    // LOW WATER GUIDANCE says which. A generic label here is the Meramec at
    // Eureka again, described as riffles on the wide lower river.
    lines.push(`- Low (floatable; LOW WATER GUIDANCE says what low water means here): ${n(t.levelTooLow)}${goodFloor == null ? ' and up' : ` up to ${n(goodFloor)}`}`);
  }
  if (goodFloor != null && (goodTop == null || goodFloor < goodTop)) {
    lines.push(`- Good (floats fine): ${n(goodFloor)}${goodTop == null ? ' and up' : ` up to ${n(goodTop)}`}`);
  }
  if (flowing) lines.push(`- Flowing (floats at its best, the optimal range): ${n(t.levelOptimalMin)} to ${n(t.levelOptimalMax)}`);
  if (highStart != null && (danger.inUnit == null || danger.inUnit > highStart)) {
    const top = danger.inUnit != null ? `, up to ${n(danger.inUnit)}${orFlood}` : floodStage ? `, until ${floodStage}` : '';
    lines.push(`- High: above ${n(highStart)}${top}`);
  }
  if (danger.inUnit != null) {
    lines.push(`- Dangerous: ${n(danger.inUnit)} and up${danger.inUnitIsFloodStage ? ' (official flood stage)' : ''}${orFlood}`);
  } else if (floodStage) {
    lines.push(`- Dangerous: ${floodStage} and up`);
  }
  return lines;
}

/** "about half of that": a flow as a share of the flow it is short of. Flow
 * only. A stage in feet is measured from an arbitrary zero, so half the feet
 * is not half the water. */
function shareOf(value: number, target: number): string {
  const share = value / target;
  if (!(share > 0)) return 'nowhere near that';
  if (share < 0.15) return 'a small fraction of that';
  if (share < 0.3) return 'about a quarter of that';
  if (share < 0.42) return 'about a third of that';
  if (share < 0.58) return 'about half of that';
  if (share < 0.71) return 'about two thirds of that';
  if (share < 0.88) return 'about three quarters of that';
  return 'just short of that';
}

/**
 * How far today's reading is from the next level up the ladder, in words a
 * Read can use. Null where the ladder has no such level or the rating has
 * nothing useful above it (Flowing is already the best of it).
 */
export function ladderPosition(f: ReportFacts): string | null {
  const v = f.value;
  if (v == null || !Number.isFinite(v)) return null;
  const t = f.thresholds;
  const goodFloor = t.levelLow ?? t.levelOptimalMin;
  const floatFloor = t.levelTooLow ?? goodFloor;
  const short = (target: number) => f.unit === 'cfs'
    ? shareOf(v, target)
    : `${formatReportMeasurement(Math.round((target - v) * 100) / 100, 'ft')} short of that`;
  const today = `Today's ${formatReportMeasurement(v, f.unit)} is`;
  switch (f.conditionCode) {
    case 'too_low':
      return floatFloor == null || v >= floatFloor ? null : `this gauge starts to float at ${formatBound(floatFloor)} ${f.unit}. ${today} ${short(floatFloor)}.`;
    case 'low':
      return goodFloor == null || v >= goodFloor ? null : `it floats fine (Good) from ${formatBound(goodFloor)} ${f.unit}. ${today} ${short(goodFloor)}.`;
    case 'good':
      return f.relation !== 'below' || f.min == null ? null : `it floats at its best from ${formatBound(f.min)} ${f.unit}. ${today} ${short(f.min)}.`;
    case 'high': {
      // The nearer line, never Eddy's own level when flood stage comes first.
      const danger = dangerLine(f);
      const below = (line: number, at: number, unit: 'ft' | 'cfs') => formatReportMeasurement(Math.round((line - at) * 100) / 100, unit);
      const own = danger.inUnit == null || v >= danger.inUnit ? null
        : `Dangerous starts at ${formatBound(danger.inUnit)} ${f.unit}${danger.inUnitIsFloodStage ? ' (official flood stage)' : ''}. ${today} ${below(danger.inUnit, v, f.unit)} below that.`;
      if (danger.floodStageFt == null) return own;
      // Rated in cfs with a flood stage in feet: two lines that cannot be
      // compared, so the distance to each is given and neither is called THE
      // distance to Dangerous.
      const height = f.gaugeHeightFt;
      const flood = height == null || !Number.isFinite(height)
        ? `Official flood stage is ${formatBound(danger.floodStageFt)} ft and is Dangerous whatever the flow. Today's gauge height is not available, so do not say how far the river is from Dangerous.`
        : height >= danger.floodStageFt ? null
          : `Official flood stage is ${formatBound(danger.floodStageFt)} ft and is Dangerous whatever the flow. Today's gauge height of ${formatReportMeasurement(height, 'ft')} is ${below(danger.floodStageFt, height, 'ft')} below it.`;
      if (!flood) return own;
      return own ? `${flood} Eddy's own danger level is separate: ${own} Either one makes it Dangerous. Never give the distance in cfs without the distance to flood stage.` : flood;
    }
    default:
      return null;
  }
}

/** "near Big Piney, MO" from "Big Piney River near Big Piney, MO": the last
 * place phrase, so "Crooked Creek at Kelly Crossing at Yellville, AR" gives
 * "at Yellville, AR". Null when the name has no such phrase. */
export function gaugePlace(gaugeName: string | null): string | null {
  const match = gaugeName?.match(/.*\b(near|at|above|below)\s+(.+)$/i);
  return match ? `${match[1].toLowerCase()} ${match[2].trim()}` : null;
}

const FALLBACK_MEANING: Record<ConditionCode, string> = {
  too_low: 'That is too low to float comfortably.',
  low: 'Floatable, but expect shallow riffles.',
  good: 'Floatable.',
  flowing: 'A good level for floating.',
  high: 'High water: use caution.',
  dangerous: 'Stay off the water.',
  unknown: '',
};

/**
 * Why a report was written by code instead of by the model.
 *
 * The first four are decided before the model is called, and they are four
 * different situations that publish similar sentences:
 *
 *   no_gauge             no reporting station resolved for this target at all
 *   no_reading           a station, but neither a height nor a discharge
 *   no_rating            a reading, but nothing to rate it against (no
 *                        thresholds, or none in the measurement's unit)
 *   unsupported_section  a rated reading, from a station that does not sit on
 *                        the requested stretch
 *
 * The last two are decided after it: the model's [CLAIMS] line disagreed with
 * the computed facts, or its prose tripped the contradiction guard.
 *
 * Recorded so the fallback rate can be read by cause. "Eddy has a reading but
 * no calibrated rating" and "Eddy has no reading" are separate problems with
 * separate fixes, and until this existed both were just rows with no model.
 */
export type PreflightFallbackReason = 'no_gauge' | 'no_reading' | 'no_rating' | 'unsupported_section';
export type GuardFallbackReason = 'claims_mismatch' | 'contradiction' | 'incomplete';
/** Every model was asked and none returned a report the guard could judge
 * (each call failed, came back empty, or was refused as incomplete while
 * another model waited). The generator publishes the code-written report from
 * the facts it already gathered, so an outage leaves readers a dated, factual
 * Read rather than none once the previous row expires. */
export type OutageFallbackReason = 'no_model_response';

/**
 * Why a report is not a whole report.
 * - `cut_off`: the model did not finish. It hit its output cap, was stopped,
 *   or refused; whatever text arrived may end anywhere.
 * - `missing_blocks`: it finished, but without all three of [SUMMARY],
 *   [EDDY_READ] and [FULL] holding text.
 */
export type IncompleteReason = 'cut_off' | 'missing_blocks';

/**
 * Null when `parsed` is a whole report from a response that finished.
 *
 * A response that did not finish is incomplete whatever it contains: a report
 * cut mid-sentence parses into three tidy blocks and reads as a report until
 * its last line. That is why the stop reason is asked first and the text is
 * not trusted to show it.
 */
export function reportIncompleteness(parsed: ParsedEddyResponse, finished: boolean, requireAllBlocks = true): IncompleteReason | null {
  if (!finished) return 'cut_off';
  if (!requireAllBlocks) return null;
  // Judge the prose readers receive. Repeated markers can look like content
  // to the parser, then disappear during the final cleanup before publishing.
  return [parsed.summaryText, parsed.eddyRead, parsed.quoteText].every(
    (text) => text != null && stripEddyMarkers(text).length > 0,
  ) ? null : 'missing_blocks';
}
export type ReportFallbackReason = PreflightFallbackReason | GuardFallbackReason | OutageFallbackReason;

/** Null when the model may write this report. */
export function preflightFallbackReason(f: ReportFacts): PreflightFallbackReason | null {
  if (f.conditionCode === 'unknown') {
    if (!f.gaugeName) return 'no_gauge';
    return f.gaugeHeightFt == null && f.dischargeCfs == null ? 'no_reading' : 'no_rating';
  }
  // An unrated station is the more basic gap, so it is named first when a
  // section is also unsupported.
  if (f.requestedSection && !f.supportedSection) return 'unsupported_section';
  return null;
}

export function preflightReportFallback(f: ReportFacts): ParsedEddyResponse | null {
  return preflightFallbackReason(f) ? factualReportFallback(f) : null;
}

/** Narrow contradiction guard, not a general natural-language fact checker.
 * Checks explicit rating and band assertions in ALL saved prose fields. A
 * rejected response is replaced as a whole so its short version cannot leak.
 */
export function reportContradictions(report: ParsedEddyResponse, f: ReportFacts): string[] {
  const errors = new Set<string>();
  // Without a usable rating, or with an unassigned section gauge, do not let
  // plausible prose fill the evidence gap. Publish the bounded fallback.
  if (f.conditionCode === 'unknown') errors.add('unavailable-assessment');
  if (f.requestedSection && !f.supportedSection) errors.add('unsupported-section');
  for (const text of [report.summaryText, report.eddyRead, report.quoteText]) {
    if (!text) continue;
    // Only compare explicit present readings with today's snapshot. Historical
    // peaks and flood-stage references may legitimately contain other values.
    const currentReading = /\b(?:the\s+)?(?:(?:gauge\s+(?:currently\s+)?)?reads|(?:current|latest)\s+(?:reading|discharge|height|gauge height|flow)(?:\s+of)?|(?:discharge|gauge height)\s+is(?:\s+currently)?)\s*(?:is|at|:)?\s*([\d,.]+)\s*(ft|feet|cfs)\b/gi;
    for (const match of text.matchAll(currentReading)) {
      const unit = match[2].toLowerCase() === 'feet' ? 'ft' : match[2].toLowerCase();
      const expected = unit === 'cfs' ? f.dischargeCfs : f.gaugeHeightFt;
      const quoted = Number(match[1].replaceAll(',', ''));
      const allowed = expected == null ? [] : allowedReadingValues(expected, unit);
      if (!allowed.includes(quoted) || (/discharge/i.test(match[0]) && unit !== 'cfs') || (/height/i.test(match[0]) && unit !== 'ft')) errors.add('reading-units');
    }
    // Measurement names have fixed dimensions even in historical references.
    if (/\bdischarge\s*(?:of|is|at|:)?\s*[\d,.]+\s*(?:ft|feet)\b|\bheight\s*(?:of|is|at|:)?\s*[\d,.]+\s*cfs\b/i.test(text)) errors.add('reading-units');
    // Narrow backstop for explicit labels and blatant present assertions.
    // No general English tense inference or verb whitelist. Forecast prose
    // such as "could climb" and "if it drops" does not match these forms.
    const labels = [
      /^(Too Low|Low|Good|Flowing|High|Dangerous|Unknown|Flood) at [\d,.]+ (?:ft|feet|cfs)[.!]?$/g,
      /(?:^|[.!?]\s+|[,;]\s*(?:but\s+)?)(?:the\s+)?(?:condition|rating)\s*(?::|is)\s*(Too Low|Low|Good|Flowing|High|Dangerous|Unknown|Flood)\b/gi,
      /(?:^|[.!?]\s+|[,;]\s*(?:but\s+)?)(?:The |the )?(?:river|gauge|water level|flow) is (Too Low|Low|Good|Flowing|High|Dangerous|Unknown|Flood)(?=[.,;!?]|$|\s+(?:at|today|within|with)\b)/g,
      /\bgauge reads [\d,.]+ (?:ft|feet|cfs),[^.!?]*?in the (Too Low|Low|Good|Flowing|High|Dangerous|Unknown) condition\b/g,
      // The prompt's suggested phrasings ("reads Good", "running Too Low").
      // Capitalized labels only; modal or negated forms are not present claims.
      /(?<!(?:\b(?:could|may|might|would|will|should|not|never)|n't)\s+(?:be\s+)?)\b(?:reads|reading|running) (Too Low|Low|Good|Flowing|High|Dangerous)\b(?!\s+(?:tomorrow|later|next|by|if|again)\b)/g,
    ];
    for (const pattern of labels) for (const match of text.matchAll(pattern)) {
      const label = match[1].toLowerCase().replace('too low', 'too_low');
      const code = label === 'flood' ? 'dangerous' : label;
      if (code !== f.conditionCode) errors.add('condition');
    }
    const comparisons = [
      /\breads [\d,.]+ (?:ft|feet|cfs)\s+(not\s+)?(within|inside|in|below|above|outside)\s+(?:the\s+)?optimal (?:range|band)\b/gi,
      /(?:^|[.!?]\s+|[,;]\s*(?:but\s+)?)(?:the\s+)?(?:gauge|river|flow|discharge|reading|[\d,.]+\s*(?:ft|feet|cfs))\s+is\s+(not\s+)?(?:well\s+)?(within|inside|in|below|above|outside)\s+(?:the\s+)?(?:optimal\s+)?(?:range|band)\b/gi,
      /\bgauge reads [\d,.]+ (?:ft|feet|cfs),[^.!?]*?\b(not\s+)?(within|inside|below|above|outside) the optimal (?:range|band)\b/gi,
    ];
    for (const pattern of comparisons) for (const match of text.matchAll(pattern)) {
      const relation = ['within', 'inside', 'in'].includes(match[2].toLowerCase()) ? 'within' : match[2].toLowerCase();
      const agrees = relation === 'outside' ? ['below', 'above'].includes(f.relation) : relation === f.relation;
      if (f.relation === 'unavailable' || (match[1] ? agrees : !agrees)) errors.add('range');
    }
    for (const match of text.matchAll(/[\d,.]+\s*(ft|feet|cfs)\s*(?:,\s*|\s+)(?:which\s+is\s+|is\s+)?(?:well\s+)?(?:within|inside|in|below|above|outside)\s+(?:the\s+)?optimal\s+(?:range|band)\b/gi)) {
      if (match[1].toLowerCase().replace('feet', 'ft') !== f.unit) errors.add('mixed-unit-comparison');
    }
    // Threshold units are not a model decision. Catch a quoted optimal range
    // with the wrong units or endpoints, including the prior 1.19–2.70 ft error.
    for (const match of text.matchAll(/optimal\s+(?:range|band)(?:\s+of|\s+is|:)?\s*([\d,.]+)\s*(ft|feet|cfs)?\s*(?:to|[-–])\s*([\d,.]+)\s*(ft|feet|cfs)\b/gi)) {
      const unit = match[4].toLowerCase() === 'feet' ? 'ft' : match[4].toLowerCase();
      const firstUnit = match[2]?.toLowerCase().replace('feet', 'ft');
      if (unit !== f.unit || (firstUnit && firstUnit !== f.unit) || Number(match[1].replaceAll(',', '')) !== f.min || Number(match[3].replaceAll(',', '')) !== f.max) errors.add('range-units');
    }

  }
  return [...errors];
}

export function factualReportFallback(f: ReportFacts): ParsedEddyResponse {
  const alerts = [...(f.floodAlerts ?? [])].sort((a, b) => Number(/Warning/i.test(b.event)) - Number(/Warning/i.test(a.event)));
  const events = [...new Set(alerts.map(a => a.event))];
  const area = alerts.length === 1 && alerts[0].areaDesc.length <= 60 ? ` for ${alerts[0].areaDesc}` : ' for the river area';
  const alertLead = events.length ? `NWS ${events[0]}${area}${events.length > 1 ? `; ${events.length - 1} other flood alert type${events.length > 2 ? 's' : ''}` : ''}. Follow NWS instructions.` : '';
  // Code-written, so it must stay strictly factual, but it is still read by
  // people: one plain sentence per fact, the station named by its town.
  const place = gaugePlace(f.gaugeName);
  const gauge = place ? `The gauge ${place}` : `The ${f.gaugeName} gauge`;
  // An unrated gauge with a reading still has something to tell: the reading.
  // "A condition assessment is unavailable from the matching measurement and
  // thresholds" was true and was what four rivers showed their readers.
  const measured = f.gaugeHeightFt != null ? formatReportMeasurement(f.gaugeHeightFt, 'ft')
    : f.dischargeCfs != null ? formatReportMeasurement(f.dischargeCfs, 'cfs') : null;
  const unknown = f.conditionCode === 'unknown';
  const reading = !f.gaugeName ? `No gauge rating for ${f.locationName ?? 'this river'} today.`
    : unknown ? (measured ? `${gauge} is at ${measured}. Eddy has no float rating for it.` : `${gauge} is not reporting right now.`)
      : `${gauge} reads ${f.conditionLabel}.`;
  const summaryText = [alertLead, reading].filter(Boolean).join(' ');
  const assessment = !f.gaugeName ? 'Eddy has no gauge it can rate this water from.'
    : unknown ? (measured ? '' : 'Without a reading there is no rating.')
      : FALLBACK_MEANING[f.conditionCode];
  const band = f.relation === 'unavailable' || f.conditionCode === 'dangerous' ? '' : `It is at ${formatReportMeasurement(f.value, f.unit)}, ${f.relation} the optimal range of ${formatBound(f.min)} to ${formatBound(f.max)} ${f.unit}.`;
  const scope = !f.gaugeName || unknown ? '' : f.requestedSection && !f.supportedSection
    ? `Eddy has no gauge reading for ${f.requestedSection} itself, so conditions on that stretch may differ.`
    : 'Conditions elsewhere on the river may differ.';
  return { summaryText, eddyRead: `${summaryText} ${assessment} ${scope}`.replace(/\s+/g, ' ').trim(), quoteText: [summaryText, assessment, band, scope].filter(Boolean).join(' ') };
}

export function guardReport(report: ParsedEddyResponse, facts: ReportFacts): ParsedEddyResponse {
  const errors = reportContradictions(report, facts);
  if (!errors.length) return report;
  console.warn(`[EddyFacts] Replacing contradictory report for ${facts.gaugeName}: ${errors.join(', ')}`);
  return factualReportFallback(facts);
}

export function reportClaimsLine(f: ReportFacts): string {
  return `[CLAIMS] condition=${f.conditionCode} relation=${f.relation}`;
}

export interface PreparedReport {
  report: ParsedEddyResponse;
  usedFallback: boolean;
  /** Set exactly when usedFallback is. */
  fallbackReason: GuardFallbackReason | null;
  /** The guard's error codes when fallbackReason is 'contradiction'. */
  contradictions: string[];
  /** Set exactly when fallbackReason is 'incomplete'. */
  incomplete: IncompleteReason | null;
  /**
   * The model's own text, parsed into its blocks, whatever the guard decided.
   * `report` is what is published; this is what was written. They are the same
   * object unless the guard replaced the report. Null when the claims line was
   * wrong, which is decided before anything is parsed.
   */
  written: ParsedEddyResponse | null;
}

export interface PrepareOptions {
  /**
   * Whether the model finished its response. Passing it turns on the
   * completeness check: the response must have finished AND (unless
   * `requireAllBlocks` is false) hold all three blocks, or it is replaced as
   * `incomplete`.
   *
   * The block rule is not true of every caller. River and section reports
   * have always carried all three blocks; secondary-gauge updates have not
   * (about three in ten stored rows lack one), and requiring them there would
   * replace reports that are published today. Unfinished text is never a
   * report, from any caller: it can end anywhere.
   */
  finished?: boolean;
  /**
   * With `finished`, whether a finished response must also hold all three
   * blocks. Default true. Secondary-gauge updates pass false: a cut-off
   * response is still replaced, but a finished one missing a block is
   * published as it has been, until the gauge replays show whether requiring
   * every block would replace Reads that serve readers well (ADR 0009).
   */
  requireAllBlocks?: boolean;
}

/** Only this entry point publishes generated prose. The model's own text is
 * published as written once it passes the contradiction guard; the factual
 * fallback is used only when the guard rejects it. The claims line is
 * optional: a missing one is not a failure, a wrong one is, and it is always
 * removed before parsing so it can never be published. */
export function prepareGeneratedReport(raw: string, f: ReportFacts, options: PrepareOptions = {}): PreparedReport {
  const lines = raw.trim().split(/\r?\n/);
  const claims = lines.filter(line => /\[CLAIMS\]/i.test(line));
  if (claims.some(line => line.trim() !== reportClaimsLine(f))) {
    console.warn(`[EddyFacts] Mismatched claims for ${f.gaugeName ?? f.locationName}`);
    return { report: factualReportFallback(f), usedFallback: true, fallbackReason: 'claims_mismatch', contradictions: [], incomplete: null, written: null };
  }
  const parsed = parseEddyResponse(lines.filter(line => !/\[CLAIMS\]/i.test(line)).join('\n'));
  // Before the contradiction guard: half a report has nothing to contradict,
  // and "no contradictions found" in one is not a pass.
  const incomplete = options.finished === undefined ? null : reportIncompleteness(parsed, options.finished, options.requireAllBlocks ?? true);
  if (incomplete) {
    console.warn(`[EddyFacts] Replacing incomplete report for ${f.gaugeName ?? f.locationName}: ${incomplete}`);
    return { report: factualReportFallback(f), usedFallback: true, fallbackReason: 'incomplete', contradictions: [], incomplete, written: parsed };
  }
  const contradictions = reportContradictions(parsed, f);
  if (contradictions.length) {
    console.warn(`[EddyFacts] Replacing contradictory report for ${f.gaugeName}: ${contradictions.join(', ')}`);
    return { report: factualReportFallback(f), usedFallback: true, fallbackReason: 'contradiction', contradictions, incomplete: null, written: parsed };
  }
  return { report: parsed, usedFallback: false, fallbackReason: null, contradictions: [], incomplete: null, written: parsed };
}
