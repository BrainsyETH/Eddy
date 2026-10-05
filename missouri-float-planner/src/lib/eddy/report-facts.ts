// Facts are calculated once, in matching units, before either report writer runs.
// This is deliberately SDK/DB-free so the production failure can be replayed.
import { classifyReading, type ConditionThresholds } from '@shared/condition-ladder';
import { CONDITION_SYSTEM } from '@shared/condition-system';
import type { ParsedEddyResponse } from './parse-response';

export interface ReportFactsInput {
  gaugeName: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholds: ConditionThresholds;
  /** Set only when the lookup actually resolved the section's assigned station. */
  supportedSection?: string | null;
  requestedSection?: string | null;
}

export function buildReportFacts(input: ReportFactsInput) {
  const unit = input.thresholds.thresholdUnit ?? 'ft';
  const value = unit === 'cfs' ? input.dischargeCfs : input.gaugeHeightFt;
  const min = input.thresholds.levelOptimalMin;
  const max = input.thresholds.levelOptimalMax;
  const relation = value == null || !Number.isFinite(value) || min == null || max == null || min > max
    ? 'unavailable'
    : value < min ? 'below' : value > max ? 'above' : 'within';
  const conditionCode = classifyReading(input.gaugeHeightFt, input.thresholds, input.dischargeCfs, { strictUnit: true });
  return { ...input, unit, value, min, max, relation, conditionCode, conditionLabel: CONDITION_SYSTEM[conditionCode].label };
}
export type ReportFacts = ReturnType<typeof buildReportFacts>;

export function reportFactsPrompt(f: ReportFacts): string {
  const danger = f.thresholds.levelDangerous;
  return [
    '[AUTHORITATIVE GAUGE FACTS — override examples and background knowledge]',
    `Reporting gauge: ${f.gaugeName}`,
    `Computed condition: ${f.conditionLabel} (${f.conditionCode}). Do not upgrade, downgrade, or reinterpret this label.`,
    `Rating measurement: ${f.unit === 'cfs' ? 'discharge' : 'gauge height'}; value: ${f.value ?? 'unavailable'} ${f.unit}.`,
    `Separate measurements: height ${f.gaugeHeightFt ?? 'unavailable'} ft; discharge ${f.dischargeCfs ?? 'unavailable'} cfs. These are not interchangeable.`,
    `Optimal band: ${f.min ?? 'unknown'} to ${f.max ?? 'unknown'} ${f.unit}. Computed comparison: ${f.relation}.`,
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
    for (const match of text.matchAll(/\b(reads?|reading(?:\s+of)?|discharge(?:\s+of)?|height(?:\s+of)?)\s*(?:is|at|:)?\s*([\d,.]+)\s*(ft|feet|cfs)\b/gi)) {
      const unit = match[3].toLowerCase() === 'feet' ? 'ft' : match[3].toLowerCase();
      const expected = unit === 'cfs' ? f.dischargeCfs : f.gaugeHeightFt;
      const quoted = Number(match[2].replaceAll(',', ''));
      // The prompt historically rounds stage to tenths. Accept either the
      // raw reading or that display rounding, not arbitrary near values.
      const allowed = expected == null ? [] : [expected, unit === 'ft' ? Number(expected.toFixed(1)) : Math.round(expected)];
      if (!allowed.includes(quoted) || (/discharge/i.test(match[1]) && unit !== 'cfs') || (/height/i.test(match[1]) && unit !== 'ft')) errors.add('reading-units');
    }
    const labels = /\b(too low|low|good|flowing|high|flood|dangerous|unknown)\s+(?:condition(?:s)?|band|range|zone)\b/gi;
    for (const match of text.matchAll(labels)) {
      const label = match[1].toLowerCase().replace('too low', 'too_low');
      const code = label === 'flood' ? 'dangerous' : label;
      if (code !== f.conditionCode) errors.add('condition');
    }
    // Also catch the common sentence "The river is Flowing/Good/High".
    for (const match of text.matchAll(/(?:^|\b(?:is|running|rated|rating[: ]|condition[: ]))\s*(?:currently\s+|solidly\s+)?(too low|low|good|flowing|high|flood|dangerous|unknown)(?=[.,;!?]|$|\s+(?:at|today|conditions?|band)\b)/gi)) {
      const label = match[1].toLowerCase().replace('too low', 'too_low');
      if ((label === 'flood' ? 'dangerous' : label) !== f.conditionCode) errors.add('condition');
    }
    for (const match of text.matchAll(/\b(within|inside|in|below|above|outside)\s+(?:the\s+)?optimal\s+(?:range|band)\b/gi)) {
      const relation = ['within', 'inside', 'in'].includes(match[1].toLowerCase()) ? 'within' : match[1].toLowerCase();
      if (relation === 'outside' ? !['below', 'above'].includes(f.relation) : relation !== f.relation) errors.add('range');
    }
    // Threshold units are not a model decision. Catch a quoted optimal range
    // with the wrong units or endpoints, including the prior 1.19–2.70 ft error.
    for (const match of text.matchAll(/optimal\s+(?:range|band)(?:\s+of|\s+is|:)?\s*([\d,.]+)\s*(?:ft|feet|cfs)?\s*(?:to|[-–])\s*([\d,.]+)\s*(ft|feet|cfs)\b/gi)) {
      const unit = match[3].toLowerCase() === 'feet' ? 'ft' : match[3].toLowerCase();
      if (unit !== f.unit || Number(match[1].replaceAll(',', '')) !== f.min || Number(match[2].replaceAll(',', '')) !== f.max) errors.add('range-units');
    }
    // A mixed-unit statement such as "2.6 ft ... within the optimal range ... cfs".
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (/\b(?:within|inside|in|below|above|outside)\s+(?:the\s+)?optimal\s+(?:range|band)\b/i.test(sentence) && /\d\s*(?:ft|feet)\b/i.test(sentence) && /\d\s*cfs\b/i.test(sentence)) errors.add('mixed-unit-comparison');
    }
  }
  return [...errors];
}

export function factualReportFallback(f: ReportFacts): ParsedEddyResponse {
  const summaryText = `${f.conditionLabel} at ${f.gaugeName}.`;
  const assessment = f.conditionCode === 'unknown'
    ? 'A condition assessment is unavailable from the matching measurement and thresholds.'
    : f.conditionCode === 'dangerous' ? 'Stay off the water.'
      : f.conditionCode === 'high' ? 'High water: use caution.' : '';
  const band = f.relation === 'unavailable' ? '' : `${f.value} ${f.unit} is ${f.relation} the optimal band of ${f.min} to ${f.max} ${f.unit}.`;
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
