/** Public release is separate from research collection. Populate only with
 * replayable evidence and reviewed basin versions; no env flag bypasses it.
 *
 * Public amounts are NOAA's gauge-corrected product (corrected-source.ts).
 * `unitsEvidence` is the folder showing that product is read correctly, in
 * millimetres; `coverageEvidence` is the folder showing each released basin's
 * weights cover the whole basin and what they reported in real storms.
 * storm-evidence.test.ts fails if a station here is missing from that folder
 * or was measured with a different basin version. Changing either string
 * retires every stored public view until the publisher rebuilds it. */
export const RAIN_RELEASE: {
  unitsEvidence: string | null;
  coverageEvidence: string | null;
  sites: Record<string, { basinId: string; riverSlug: string; name: string; gauge: [number, number] }>;
} = {
  unitsEvidence: 'docs/validation/rainfall/2026-11-16-corrected',
  coverageEvidence: 'docs/validation/rainfall/2026-11-16-jacks-fork',
  sites: {
    '07065200': { basinId: 'b4924fd9c8f7d4ff5772e0cfc70c2de8223b90756c78305cdcadfed2c02f1cdb', riverSlug: 'jacks-fork',
      name: 'Jacks Fork near Mountain View', gauge: [-91.668028, 37.056528] },
    '07065495': { basinId: 'dd1fd275be39db869913104ca5cb761f87c80ad48325bbdcea200f6c4b0b5a91', riverSlug: 'jacks-fork',
      name: 'Jacks Fork at Alley Spring', gauge: [-91.443083, 37.148167] },
    '07066000': { basinId: '4ed9badc745e6316a2ba21f92f6c7d61223ac2efc083cc44c5c39752b78c3cd6', riverSlug: 'jacks-fork',
      name: 'Jacks Fork at Eminence', gauge: [-91.358167, 37.154083] },
  },
};

export function publicRainSite(siteId: string) {
  return process.env.RAINFALL_PUBLIC_ENABLED === 'true' && RAIN_RELEASE.unitsEvidence
    && RAIN_RELEASE.coverageEvidence ? RAIN_RELEASE.sites[siteId] ?? null : null;
}
