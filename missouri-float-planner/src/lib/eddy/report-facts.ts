// Facts are calculated once, in matching units, before either report writer runs.
// This is deliberately SDK/DB-free so the production failure can be replayed.
import { classifyReading, type ConditionThresholds } from '@shared/condition-ladder';
import { CONDITION_SYSTEM } from '@shared/condition-system';
import type { NWSAlert } from '../nws/alerts';
import type { ParsedEddyResponse } from './parse-response';

export interface ReportFactsInput {
  gaugeName: string;
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

// Qualifiers must govern the assertion, not merely occur somewhere in its
// clause. In particular, trailing weather text such as "with no rain" cannot
// exempt a present rating or band assertion.
function isPresentClaim(text: string, index: number, end: number): boolean {
  const before = text.slice(0, index).split(/(?<!\d)[,.;!?]|[,.;!?](?!\d)|\b(?:but|and|while|whereas)\b/i).at(-1) ?? '';
  const after = text.slice(end);
  const modifiers = '(?:(?:be|become|remain|return|rise|fall|bring|push|put|move|it|back|the|gauge|river|flow|water|level|good|flowing|high|low|dangerous|unknown|to|into|in|at|currently|solidly|well)\\s+)*';
  if (new RegExp(`\\b(?:could|would|should|may|might|will|can|expect|expected|was|were)\\s+${modifiers}$`, 'i').test(before)) return false;
  if (/\b(?:not|never|isn't|isn’t|aren't|aren’t)\s+(?:(?:in|the|currently|solidly|well)\s+)*$/i.test(before)) return false;
  if (/^\s*(?:possible\b|expected\b|tomorrow\b|yesterday\b|next\s+(?:week|month|day)\b|if\b)/i.test(after)) return false;
  return true;
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
  const conditionCode = classifyReading(input.gaugeHeightFt, input.thresholds, input.dischargeCfs);
  return { ...input, unit, value, min, max, relation, conditionCode, conditionLabel: CONDITION_SYSTEM[conditionCode].label };
}
export type ReportFacts = ReturnType<typeof buildReportFacts>;

export function reportFactsPrompt(f: ReportFacts): string {
  const danger = f.thresholds.levelDangerous;
  return [
    '[AUTHORITATIVE GAUGE FACTS — override examples and background knowledge]',
    `Reporting gauge: ${f.gaugeName}`,
    ...(f.floodAlerts?.length ? [
      `Active NWS flood alerts for the surrounding river area: ${f.floodAlerts.map(a => `${a.event}${a.areaDesc ? ` (${a.areaDesc})` : ''}`).join('; ')}.`,
      'Lead with the active flood alert and its affected area. A Good or unavailable gauge rating does not cancel an NWS alert; the alert is not a new gauge condition label.',
    ] : []),
    `Computed condition: ${f.conditionLabel} (${f.conditionCode}). Do not upgrade, downgrade, or reinterpret this label.`,
    `Rating measurement: ${f.unit === 'cfs' ? 'discharge' : 'gauge height'}; value: ${formatReportMeasurement(f.value, f.unit)}.`,
    `Separate measurements: height ${formatReportMeasurement(f.gaugeHeightFt, 'ft')}; discharge ${formatReportMeasurement(f.dischargeCfs, 'cfs')}. These are not interchangeable.`,
    'Use these displayed readings. The condition follows the shared website classifier, including its legacy missing-measurement fallback; the numeric optimal-band comparison always requires the matching unit.',
    'When naming the computed rating, use an explicit label such as condition: Good. Ordinary lowercase good or flowing prose is not a rating label.',
    `Optimal band: ${formatBound(f.min)} to ${formatBound(f.max)} ${f.unit}. Computed comparison: ${f.relation}.`,
    'Good and below the optimal band can both be correct. Below optimal does not mean Low. If the comparison is unavailable, do not claim to be inside or outside the band.',
    ...(danger == null ? [] : [`Editorial danger threshold: ${danger} ${f.unit}. This is NOT an official closure order. Do not call it a closure level.`]),
    ...(f.thresholds.floodStageFt == null ? [] : [`Official flood stage: ${f.thresholds.floodStageFt} ft, assessed separately from the recreational band.`]),
    `Supported location: ${f.supportedSection ?? f.gaugeName}.`,
    ...(f.requestedSection && !f.supportedSection ? [`The requested section (${f.requestedSection}) has no resolved gauge of its own. This is a fallback station observation, NOT a condition assessment of that section.`] : []),
    'Do not infer current scraping, floatability, depth, or boat suitability at other places from this station. General local knowledge is background, not a current reading for those places.',
    'Name the reporting gauge when describing the current assessment. Do not turn a station assessment into a claim about the entire river.',
    'Keep condition and optimal-band claims about this station only. Do not compare raw gauge heights across stations; each uses its own datum. Do not infer a relative trend from two snapshots.',
  ].join('\n');
}

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
      if (!isPresentClaim(text, match.index, match.index + match[0].length)) continue;
      const unit = match[2].toLowerCase() === 'feet' ? 'ft' : match[2].toLowerCase();
      const expected = unit === 'cfs' ? f.dischargeCfs : f.gaugeHeightFt;
      const quoted = Number(match[1].replaceAll(',', ''));
      const allowed = expected == null ? [] : allowedReadingValues(expected, unit);
      if (!allowed.includes(quoted) || (/discharge/i.test(match[0]) && unit !== 'cfs') || (/height/i.test(match[0]) && unit !== 'ft')) errors.add('reading-units');
    }
    // Measurement names have fixed dimensions even in historical references.
    if (/\bdischarge\s*(?:of|is|at|:)?\s*[\d,.]+\s*(?:ft|feet)\b|\bheight\s*(?:of|is|at|:)?\s*[\d,.]+\s*cfs\b/i.test(text)) errors.add('reading-units');
    // Only explicit labels and capitalized canonical condition names count.
    // "flowing at 756 cfs", "good conditions for a float" and NWS "flood
    // conditions" are ordinary prose, not assignments of the Eddy rating.
    const explicit = /\b(?:condition|rating)\s*(?::|is|of)\s*(Too Low|Low|Good|Flowing|High|Dangerous|Unknown)\b/gi;
    const named = /\b(Too Low|Low|Good|Flowing|High|Dangerous|Unknown)\s+(?:conditions?|band|range|zone)\b(?!\s+for\b)/g;
    const predicate = /(?:^|\b(?:river|gauge|water level|flow)\s+(?:is|is running|is rated))\s*(?:currently\s+|solidly\s+)?(Too Low|Low|Good|Flowing|High|Dangerous|Unknown)(?=[.,;!?]|$|\s+(?:at|today|within|with)\b)/g;
    for (const pattern of [explicit, named, predicate]) {
      for (const match of text.matchAll(pattern)) {
        if (!isPresentClaim(text, match.index, match.index + match[0].length)) continue;
        const code = match[1].toLowerCase().replace('too low', 'too_low');
        if (code !== f.conditionCode) errors.add('condition');
      }
    }
    for (const match of text.matchAll(/\b(within|inside|in|below|above|outside)\s+(?:the\s+)?optimal\s+(?:range|band)\b/gi)) {
      if (!isPresentClaim(text, match.index, match.index + match[0].length)) continue;
      const relation = ['within', 'inside', 'in'].includes(match[1].toLowerCase()) ? 'within' : match[1].toLowerCase();
      if (relation === 'outside' ? !['below', 'above'].includes(f.relation) : relation !== f.relation) errors.add('range');
    }
    // Threshold units are not a model decision. Catch a quoted optimal range
    // with the wrong units or endpoints, including the prior 1.19–2.70 ft error.
    for (const match of text.matchAll(/optimal\s+(?:range|band)(?:\s+of|\s+is|:)?\s*([\d,.]+)\s*(ft|feet|cfs)?\s*(?:to|[-–])\s*([\d,.]+)\s*(ft|feet|cfs)\b/gi)) {
      const unit = match[4].toLowerCase() === 'feet' ? 'ft' : match[4].toLowerCase();
      const firstUnit = match[2]?.toLowerCase().replace('feet', 'ft');
      if (unit !== f.unit || (firstUnit && firstUnit !== f.unit) || Number(match[1].replaceAll(',', '')) !== f.min || Number(match[3].replaceAll(',', '')) !== f.max) errors.add('range-units');
    }
    // Bind a comparison to the immediately preceding measurement. Merely
    // mentioning stage and discharge in one sentence is valid.
    for (const match of text.matchAll(/[\d,.]+\s*(ft|feet|cfs)\s*(?:,\s*|\s+)(?:which\s+is\s+|is\s+)?(?:well\s+)?(?:within|inside|in|below|above|outside)\s+(?:the\s+)?optimal\s+(?:range|band)\b/gi)) {
      if (!isPresentClaim(text, match.index, match.index + match[0].length)) continue;
      if (match[1].toLowerCase().replace('feet', 'ft') !== f.unit) errors.add('mixed-unit-comparison');
    }
  }
  return [...errors];
}

export function factualReportFallback(f: ReportFacts): ParsedEddyResponse {
  const alerts = [...(f.floodAlerts ?? [])].sort((a, b) => Number(/Warning/i.test(b.event)) - Number(/Warning/i.test(a.event)));
  const events = [...new Set(alerts.map(a => a.event))];
  const area = alerts.length === 1 && alerts[0].areaDesc.length <= 60 ? ` for ${alerts[0].areaDesc}` : ' for the river area';
  const alertLead = events.length ? `NWS ${events[0]}${area}${events.length > 1 ? `; ${events.length - 1} other flood alert type${events.length > 2 ? 's' : ''}` : ''}. Follow NWS instructions.` : '';
  const summaryText = [alertLead, `${f.conditionLabel} at ${f.gaugeName}.`].filter(Boolean).join(' ');
  const assessment = f.conditionCode === 'unknown'
    ? 'A condition assessment is unavailable from the matching measurement and thresholds.'
    : f.conditionCode === 'dangerous' ? 'Stay off the water.'
      : f.conditionCode === 'high' ? 'High water: use caution.' : '';
  const band = f.relation === 'unavailable' || f.conditionCode === 'dangerous' ? '' : `${formatReportMeasurement(f.value, f.unit)} is ${f.relation} the optimal band of ${formatBound(f.min)} to ${formatBound(f.max)} ${f.unit}.`;
  const scope = f.requestedSection && !f.supportedSection
    ? `This gauge does not establish current conditions for ${f.requestedSection}.`
    : 'Conditions elsewhere on the river may differ.';
  return { summaryText, eddyRead: `${summaryText} ${assessment} ${scope}`.replace(/\s+/g, ' ').trim(), quoteText: [summaryText, assessment, band, scope].filter(Boolean).join(' ') };
}

export function guardReport(report: ParsedEddyResponse, facts: ReportFacts): ParsedEddyResponse {
  const errors = reportContradictions(report, facts);
  if (!errors.length) return report;
  console.warn(`[EddyFacts] Replacing contradictory report for ${facts.gaugeName}: ${errors.join(', ')}`);
  return factualReportFallback(facts);
}
