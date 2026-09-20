/** Shorten units without parsing, rounding, or dropping either range endpoint. */
export function compactFloatEstimate(formatted: string): string {
  return formatted
    .replace(/~/g, '')
    .replace(/\s*\b(?:hours?|hrs?)\b/gi, 'h')
    .replace(/\s*\b(?:minutes?|mins?)\b/gi, 'm')
    .replace(/\s*[–—]\s*/g, '–')
    .trim();
}
