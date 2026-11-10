// src/lib/navigation/river-path.ts
// Canonical URL builders for the /rivers/[state]/[slug] hierarchy.
//
// Legacy URLs remain supported with permanent redirects. New links should use
// the canonical path supplied by the API or these builders with the river's
// actual state; never infer a state from the viewer's location.

import { stateSlug } from './states';

/** Canonical river page path, e.g. riverPath('MO', 'current') → /rivers/missouri/current */
export function riverPath(stateCode: string, riverSlug: string): string {
  return `/rivers/${stateSlug(stateCode)}/${riverSlug}`;
}

/** Canonical access-point path. */
export function riverAccessPath(stateCode: string, riverSlug: string, accessSlug: string): string {
  return `${riverPath(stateCode, riverSlug)}/access/${accessSlug}`;
}

/** State index path, e.g. /rivers/missouri */
export function statePath(stateCode: string): string {
  return `/rivers/${stateSlug(stateCode)}`;
}
