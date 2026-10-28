// src/lib/access-points/merged-slugs.ts
// Access-point pages retired by merging a duplicate into a canonical record.
//
// A slug is a public identifier: `/rivers/<state>/<river>/access/<slug>` is
// shared and indexed. Merging two records for one place retires one row
// (approved = false), and the detail loader serves approved rows only, so the
// retired URL would 404. This list sends it to the place it now lives at.
//
// A row is listed here only when its record is retired and the canonical
// record covers the same arrival point. A slug that was merely renamed belongs
// in ACCESS_SLUG_RENAMES (src/lib/access-slugs.ts), not here.

interface MergedAccessSlug {
  river: string;
  slug: string;
  mergedInto: string;
  /** Why the two records were one place. */
  note: string;
}

export const MERGED_ACCESS_SLUGS: readonly MergedAccessSlug[] = [
  {
    river: 'current',
    slug: 'van-buren',
    mergedInto: 'van-buren-riverfront-park',
    note: 'Van Buren City Access and Riverfront Park were one town launch at the Hwy 60 bridge, about 140 m apart. Merged 2026-10-28.',
  },
];

/** The canonical slug a retired access slug was merged into, if any. */
export function mergedAccessSlug(river: string, slug: string): string | null {
  return MERGED_ACCESS_SLUGS.find((m) => m.river === river && m.slug === slug)?.mergedInto ?? null;
}
