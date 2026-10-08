// Facts are calculated once, in matching units, before either report writer runs.
// This is deliberately SDK/DB-free so the production failure can be replayed.
import { classifyReading, type ConditionThresholds } from '@shared/condition-ladder';
import { CONDITION_SYSTEM, type ConditionCode } from '@shared/condition-system';
import type { NWSAlert } from '../nws/alerts';
import { parseEddyResponse, type ParsedEddyResponse } from './parse-response';

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
  return [
    '[AUTHORITATIVE GAUGE FACTS — override examples and background knowledge]',
    `Begin your response with exactly this single line: ${reportClaimsLine(f)}`,
    'Then write [SUMMARY], [EDDY_READ], and [FULL] as usual. Whenever you state the current condition, the optimal-range comparison or a gauge measurement, use exactly the facts below.',
    `Reporting gauge: ${f.gaugeName}`,
    'If no alerts are supplied, do not claim that no alerts are active: lookup or matching coverage may be unavailable.',
    ...(f.floodAlerts?.length ? [
      `Active NWS flood alerts for the surrounding river area: ${f.floodAlerts.map(a => `${a.event}${a.areaDesc ? ` (${a.areaDesc})` : ''}`).join('; ')}.`,
      'Lead the summary and the full text with the active flood alert and its affected area. A Good or unavailable gauge rating does not cancel an NWS alert; the alert is not a new gauge condition label.',
    ] : []),
    `Computed condition: ${f.conditionLabel} (${f.conditionCode}). Do not upgrade, downgrade, or reinterpret this label.`,
    `Rating measurement: ${f.unit === 'cfs' ? 'discharge' : 'gauge height'}; value: ${formatReportMeasurement(f.value, f.unit)}.`,
    `Separate measurements: height ${formatReportMeasurement(f.gaugeHeightFt, 'ft')}; discharge ${formatReportMeasurement(f.dischargeCfs, 'cfs')}. These are not interchangeable.`,
    'Use these displayed readings. The condition follows the shared website classifier, including its legacy missing-measurement fallback; the numeric optimal-range comparison always requires the matching unit.',
    'You do not have to name the rating. When you do, use its capitalized label in a natural sentence, for example "the gauge reads Good" or "running Too Low". Never write it as a field such as "condition: Good"; the [CLAIMS] line already carries the structured claim. Ordinary lowercase good or flowing prose is not a rating label.',
    `Optimal range: ${formatBound(f.min)} to ${formatBound(f.max)} ${f.unit}. Computed comparison: ${f.relation}.`,
    ...(plainRelation(f) ? [`In plain words for the reader: ${plainRelation(f)}`] : []),
    'Good and below the optimal range can both be correct. Below optimal does not mean Low. If the comparison is unavailable, do not claim to be inside or outside the range. In prose, always call it the optimal range, never a band.',
    ...(danger == null ? [] : [`Editorial danger threshold: ${danger} ${f.unit}. This is NOT an official closure order. Do not call it a closure level.`]),
    ...(f.thresholds.floodStageFt == null ? [] : [`Official flood stage: ${f.thresholds.floodStageFt} ft, assessed separately from the recreational optimal range.`]),
    `Supported location: ${f.supportedSection ?? f.gaugeName}.`,
    ...(f.requestedSection && !f.supportedSection ? [`The requested section (${f.requestedSection}) has no resolved gauge of its own. This is a fallback station observation, NOT a condition assessment of that section.`] : []),
    'Do not infer current scraping, floatability, depth, or boat suitability at other places from this station. General local knowledge is background, not a current reading for those places.',
    'Say where this reading is taken once in the summary and once in the full text, using the town or landmark from the gauge name (for example "near Van Buren"), not the full station name. Put it wherever it reads naturally; do not open every block with "At Town,". Do not turn a station assessment into a claim about the entire river.',
    'Keep condition and optimal-range claims about this station only. Do not compare raw gauge heights across stations; each uses its own datum. Do not infer a relative trend from two snapshots.',
  ].join('\n');
}

/** What the optimal-range comparison means on the water, for the ratings where
 * it adds anything. Too Low/Low already imply "below" and High/Dangerous
 * "above", so restating the comparison there is noise. */
export function plainRelation(f: ReportFacts): string | null {
  if (f.conditionCode !== 'good' && f.conditionCode !== 'flowing') return null;
  if (f.relation === 'below') return 'floatable, with a reading below the optimal range for this gauge. This comparison alone does not establish shallow water or scraping.';
  if (f.relation === 'above') return 'floatable, with more water and a quicker current than the sweet spot for this gauge.';
  if (f.relation === 'within') return 'right in the sweet spot for this gauge.';
  return null;
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

export function preflightReportFallback(f: ReportFacts): ParsedEddyResponse | null {
  return f.conditionCode === 'unknown' || (f.requestedSection && !f.supportedSection)
    ? factualReportFallback(f) : null;
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
  const reading = !f.gaugeName ? `Gauge assessment unavailable for ${f.locationName ?? 'this river'}.`
    : f.conditionCode === 'unknown' ? `${gauge} has no usable condition reading right now.`
      : `${gauge} reads ${f.conditionLabel}.`;
  const summaryText = [alertLead, reading].filter(Boolean).join(' ');
  const assessment = f.conditionCode === 'unknown'
    ? 'A condition assessment is unavailable from the matching measurement and thresholds.'
    : FALLBACK_MEANING[f.conditionCode];
  const band = f.relation === 'unavailable' || f.conditionCode === 'dangerous' ? '' : `It is at ${formatReportMeasurement(f.value, f.unit)}, ${f.relation} the optimal range of ${formatBound(f.min)} to ${formatBound(f.max)} ${f.unit}.`;
  const scope = !f.gaugeName ? 'No usable reporting gauge is available.' : f.requestedSection && !f.supportedSection
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

/** Only this entry point publishes generated prose. The model's own text is
 * published as written once it passes the contradiction guard; the factual
 * fallback is used only when the guard rejects it. The claims line is
 * optional: a missing one is not a failure, a wrong one is, and it is always
 * removed before parsing so it can never be published. */
export function prepareGeneratedReport(raw: string, f: ReportFacts): { report: ParsedEddyResponse; usedFallback: boolean } {
  const lines = raw.trim().split(/\r?\n/);
  const claims = lines.filter(line => /\[CLAIMS\]/i.test(line));
  if (claims.some(line => line.trim() !== reportClaimsLine(f))) {
    console.warn(`[EddyFacts] Mismatched claims for ${f.gaugeName ?? f.locationName}`);
    return { report: factualReportFallback(f), usedFallback: true };
  }
  const parsed = parseEddyResponse(lines.filter(line => !/\[CLAIMS\]/i.test(line)).join('\n'));
  const checked = guardReport(parsed, f);
  return { report: checked, usedFallback: checked !== parsed };
}
