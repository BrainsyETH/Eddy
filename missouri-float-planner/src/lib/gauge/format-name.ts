// src/lib/gauge/format-name.ts
// Shared formatting for USGS gauge station names.

/**
 * Strips the river name prefix and state suffix from USGS gauge names, leaving
 * the locating place — the part people actually recognize.
 * e.g. "Current River at Van Buren, MO" → "Van Buren"
 *      "Jacks Fork near Mountain View, MO" → "Mountain View"
 *      "Niangua River at Tunnel Dam near Macks Creek, MO" → "Tunnel Dam near Macks Creek"
 *
 * Returns the input unchanged (trimmed) when it doesn't match the USGS pattern.
 */
export function shortenGaugeName(fullName: string): string {
  // Remove state suffix (", MO" or similar)
  let name = fullName.replace(/,\s*[A-Z]{2}\s*$/, '');

  // Strip "[River Name] at/near/above/below " prefix.
  const prefixMatch = name.match(/^.+?\b(?:River|Creek|Fork|Branch)\s+(?:at|near|above|below)\s+/i);
  if (prefixMatch) {
    name = name.slice(prefixMatch[0].length);
  }

  return name.trim();
}
