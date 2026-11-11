/** Public release is separate from research collection. Populate only with
 * replayable evidence and reviewed basin versions; no env flag bypasses it. */
export const RAIN_RELEASE: {
  unitsEvidence: string | null;
  coverageEvidence: string | null;
  sites: Record<string, { basinId: string; name: string; gauge: [number, number] }>;
} = { unitsEvidence: null, coverageEvidence: null, sites: {} };

export function publicRainSite(siteId: string) {
  return process.env.RAINFALL_PUBLIC_ENABLED === 'true' && RAIN_RELEASE.unitsEvidence
    && RAIN_RELEASE.coverageEvidence ? RAIN_RELEASE.sites[siteId] ?? null : null;
}
