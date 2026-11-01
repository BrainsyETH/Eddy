// src/lib/access-points/source-line.ts
// The one small attribution line on an access point's page, naming the
// agencies whose published data the page uses ("Includes data from the
// Missouri Department of Conservation."). Attribution used to sit inside the
// sentences ("Paved lot (MDC)."); it lives here instead. MDC's terms ask that
// derived facts keep their attribution.
//
// Mirrored in eddy-ios/src/lib/accessCopy.ts (sourceLine);
// source-line-parity.test.ts keeps the two identical.

export const SOURCE_NAMES: Record<string, string> = {
  MDC: 'Missouri Department of Conservation',
  AGFC: 'Arkansas Game and Fish Commission',
};

export function sourceLine(sources: readonly string[] | null | undefined): string | null {
  const names = [...new Set(sources ?? [])].map((s) => SOURCE_NAMES[s] ?? s);
  return names.length ? `Includes data from the ${names.join(' and the ')}.` : null;
}

/**
 * Agency codes from the access point's reviewed agency_gis_features links, in a
 * stable order. Providers are stored lower-case ('mdc', 'agfc').
 */
export function agencySources(rows: readonly { provider: string | null }[] | null | undefined): string[] {
  return [...new Set((rows ?? []).map((r) => (r.provider ?? '').toUpperCase()).filter(Boolean))].sort();
}
