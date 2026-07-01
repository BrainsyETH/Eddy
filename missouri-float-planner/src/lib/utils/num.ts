// src/lib/utils/num.ts
// Coercion helper for the Postgres NUMERIC/DECIMAL boundary.
//
// Supabase/PostgREST serializes NUMERIC/DECIMAL columns as JSON *strings* at
// runtime (to preserve precision), even though the generated Supabase types
// declare them as `number`. Reading such a column and calling `.toFixed()` on
// it — or adding it to another number — is a runtime bug (crash / string
// concat). Wrap DB-sourced numeric values in toNum() at the point they enter
// app code so the `number` types are actually true downstream.
//
//   const heightFt = toNum(reading.gauge_height_ft); // number | null, always

/**
 * Coerce a value that may be a NUMERIC-as-string (or a real number, or null)
 * into a finite number, or null. Returns null for null/undefined/NaN/±Infinity.
 */
export function toNum(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}
