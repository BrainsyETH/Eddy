// src/lib/escape-html.ts
// Minimal HTML escaping for text interpolated into HTML strings (e.g. map
// popup markup built with maplibre's setHTML). For rich text, use
// sanitizeRichText in sanitize.ts instead.

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
