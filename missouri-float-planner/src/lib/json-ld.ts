// src/lib/json-ld.ts
// Centralized serializer for <script type="application/ld+json"> blocks.
//
// JSON.stringify alone is NOT safe inside a <script> element: a string field
// containing "</script>" closes the tag early and lets the remainder of the
// payload parse as markup — a stored-XSS vector the moment any JSON-LD field
// carries user- or CMS-supplied text. Escaping "<" as the backslash-u003c JSON escape
// is invisible to JSON parsers and search engines but can never terminate the
// script element.
//
// Every JSON-LD sink must use this helper — do not call JSON.stringify
// directly inside a dangerouslySetInnerHTML for structured data.

/** Serialize a JSON-LD payload safely for a <script type="application/ld+json"> sink. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
