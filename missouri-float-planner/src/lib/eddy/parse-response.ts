// src/lib/eddy/parse-response.ts
// Pure parser for Eddy's model output. Kept free of the Anthropic SDK (and of
// anything else with side effects) so it can be unit-tested on its own — the
// generation modules that call it import the SDK at module scope.

export interface ParsedEddyResponse {
  summaryText: string | null;
  eddyRead: string | null;
  quoteText: string;
}

/**
 * Parses the raw model response into summary, compact Eddy read, and full report text.
 * Tries multiple strategies in order of specificity:
 *  1. [SUMMARY] / [EDDY_READ] / [FULL] block markers (preferred, unambiguous)
 *  2. Legacy [SUMMARY] / [FULL] blocks
 *  3. Legacy --- delimiter (backward compat with cached/in-flight responses)
 *  4. Fallback: first sentence as summary, full text as quote
 */
export function parseEddyResponse(rawText: string): ParsedEddyResponse {
  // Strategy 1: new [SUMMARY] / [EDDY_READ] / [FULL] block markers.
  const structuredSummaryMatch = rawText.match(/\[SUMMARY\]\s*\n?([\s\S]*?)(?=\[EDDY_READ\])/i);
  const eddyReadMatch = rawText.match(/\[EDDY_READ\]\s*\n?([\s\S]*?)(?=\[FULL\])/i);
  const fullMatch = rawText.match(/\[FULL\]\s*\n?([\s\S]*?)$/i);

  if (structuredSummaryMatch && eddyReadMatch && fullMatch) {
    const summary = structuredSummaryMatch[1].trim();
    const eddyRead = eddyReadMatch[1].trim();
    const full = fullMatch[1].trim();
    if (summary && eddyRead && full) {
      return { summaryText: summary, eddyRead, quoteText: full };
    }
  }

  // Strategy 2: legacy [SUMMARY] / [FULL] blocks.
  const summaryMatch = rawText.match(/\[SUMMARY\]\s*\n?([\s\S]*?)(?=\[FULL\])/i);
  if (summaryMatch && fullMatch) {
    const summary = summaryMatch[1].trim();
    const full = fullMatch[1].trim();
    if (summary && full) return { summaryText: summary, eddyRead: null, quoteText: full };
  }

  // Strategy 3: Legacy --- delimiter (single occurrence on its own line)
  // Only match --- that appears as a line separator, not inside text
  const legacyMatch = rawText.match(/^([\s\S]+?)\n\s*---\s*\n([\s\S]+)$/);
  if (legacyMatch) {
    const summary = legacyMatch[1].trim();
    const full = legacyMatch[2].trim();
    if (summary && full) {
      console.warn('[EddyGen] Parsed using legacy --- delimiter; model may not be following new format');
      return { summaryText: summary, eddyRead: null, quoteText: full };
    }
  }

  // Strategy 4: Fallback — extract first sentence as summary
  // This ensures we always populate both fields even if the model ignores the format
  const firstSentenceEnd = rawText.match(/[.!?](?:\s|$)/);
  if (firstSentenceEnd && firstSentenceEnd.index !== undefined) {
    const cutoff = firstSentenceEnd.index + 1;
    const candidate = rawText.slice(0, cutoff).trim();
    const remainder = rawText.slice(cutoff).trim();
    // Only split if the remainder is meaningfully longer (not just a fragment)
    if (remainder.length > 40 && candidate.length <= 140) {
      console.warn('[EddyGen] Model did not use expected format; falling back to first-sentence extraction');
      return { summaryText: candidate, eddyRead: null, quoteText: rawText };
    }
  }

  // Last resort: no summary, entire text as quote
  console.warn('[EddyGen] Could not extract summary from model output; storing as quote_text only');
  return { summaryText: null, eddyRead: null, quoteText: rawText };
}

/** Strip any stray section markers that leaked into parsed prose. */
export function stripEddyMarkers(text: string): string {
  return text.replace(/\[(?:FULL|SUMMARY|EDDY_READ)\]/gi, '').trim();
}
