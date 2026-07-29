// src/lib/offline/etag.ts
//
// Content hash for the offline bundle.
//
// Split out from the route purely so it can be tested without importing the
// route, which drags in the Supabase server client and next/headers.

import { createHash } from 'node:crypto';

/**
 * A strong ETag over the JSON encoding of the body.
 *
 * Correct ONLY because the body is a pure projection of database state. The
 * moment anything time-varying enters the payload this becomes a hash that
 * changes on every request — every launch pulls the whole bundle instead of a
 * 304, and the app keeps working perfectly while doing it, so nothing surfaces
 * the regression. bundle.test.ts guards that property at the source level.
 */
export function etagFor(body: unknown): string {
  return `"${createHash('sha1').update(JSON.stringify(body)).digest('hex')}"`;
}
