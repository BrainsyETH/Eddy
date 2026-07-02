// src/lib/navigation/river-path.ts
// Canonical URL builders for the /rivers/[state]/[slug] hierarchy.
//
// Legacy /rivers/[slug] URLs 301 to these via app/rivers/[state]/page.tsx,
// so components that don't have the river's state handy may still emit
// legacy links — but anything that renders many links or feeds crawlers
// (sitemaps, index grids, breadcrumbs) should use these builders.

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
