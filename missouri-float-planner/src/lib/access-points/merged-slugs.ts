// src/lib/access-points/merged-slugs.ts
// Access-point pages retired by merging a duplicate into a canonical record.
//
// A slug is a public identifier: `/rivers/<state>/<river>/access/<slug>` is
// shared and indexed. Merging two records for one place retires one row
// (approved = false, or deleted), and the detail loader serves approved rows
// only, so the retired URL would 404. This list sends it to the place it now
// lives at.
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
  {
    river: 'current',
    slug: 'van-buren-city-access',
    mergedInto: 'van-buren-riverfront-park',
    note: 'A second Van Buren City Access record for the same Hwy 60 bridge launch, 63 m away. Deleted 2026-11-01.',
  },
  {
    river: 'eleven-point',
    slug: 'boze-mill-spring-on-left',
    mergedInto: 'boze-mill-float-camp-spring',
    note: 'The float-guide record for Boze Mill Spring, 53 m from the float camp at the same mile. Deleted 2026-11-01.',
  },
  {
    river: 'eleven-point',
    slug: 'hwy-160-bridge',
    mergedInto: 'riverton',
    note: '"Riverton and Hwy. 160 Bridge": the Riverton access at the same bridge, 36 m away. Deleted 2026-11-01.',
  },
  {
    river: 'eleven-point',
    slug: 'mdc-myrtle',
    mergedInto: 'myrtle-access',
    note: 'A second record for the MDC Myrtle access, 23 m away. Deleted 2026-11-01.',
  },
  {
    river: 'eleven-point',
    slug: 'turner-mill-north',
    mergedInto: 'turner-s-mill-and-spring-north',
    note: 'The north Turner Mill access; the surviving record took its facts. Deleted 2026-11-01.',
  },
  {
    river: 'eleven-point',
    slug: 'hwy-19-bridge',
    mergedInto: 'greer-spring',
    note: 'Greer Crossing is the access at the Hwy 19 bridge, 348 m away at the same mile. Deleted 2026-11-01.',
  },
  {
    river: 'courtois',
    slug: 'hwy-8-bridge',
    mergedInto: 'highway-8-bridge',
    note: 'The same Highway 8 bridge at the same mile, with a pin 1.5 km off. Deleted 2026-11-01.',
  },
];

/** The canonical slug a retired access slug was merged into, if any. */
export function mergedAccessSlug(river: string, slug: string): string | null {
  return MERGED_ACCESS_SLUGS.find((m) => m.river === river && m.slug === slug)?.mergedInto ?? null;
}
