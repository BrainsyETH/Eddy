// src/lib/national-map/scope.ts
// What "national" means on the River Map: the 50 states and DC.
//
// Puerto Rico and the other territories are EXCLUDED by product decision
// (2026-11-02), even though the importer ingests Puerto Rico
// (US_REGIONS 'puerto-rico' in src/lib/usgs/national-sites.ts) and the NWS
// layer carries PR and VI forecast points. They are excluded here, at the map's
// boundary, not in ingestion: the planner and gauge pages keep them.
//
// Exclusion works by state code AND by position, because station metadata is
// not complete: on 2026-11-02 production held 145 Puerto Rico / Virgin Islands
// stations with a null state_code — they would slip past a code-only test.

export const NATIONAL_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

export type NationalStateCode = (typeof NATIONAL_STATE_CODES)[number];

const IN_SCOPE = new Set<string>(NATIONAL_STATE_CODES);

/** Territory codes seen in USGS and NWS metadata. */
const TERRITORIES = new Set(['PR', 'VI', 'GU', 'AS', 'MP', 'UM', 'FM', 'MH', 'PW']);

/** Caribbean (PR + USVI) and the western Pacific territories, by position. */
function inTerritoryBox(lng: number, lat: number): boolean {
  if (lat > 17 && lat < 19 && lng > -68.5 && lng < -64) return true; // PR, USVI
  if (lat > -15 && lat < 21 && lng > 140 && lng < 172) return true; // Guam, CNMI, FSM…
  if (lat > -15 && lat < -10 && lng > -172 && lng < -168) return true; // American Samoa
  return false;
}

/**
 * Is this station on the national map?
 *
 * A null state code is allowed (DC and a few border stations carry none) as
 * long as the position is not in a territory box. A known non-US state code
 * is not allowed.
 */
export function inNationalScope(
  stateCode: string | null | undefined,
  lng: number,
  lat: number,
): boolean {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90 || (lng === 0 && lat === 0)) return false;
  if (inTerritoryBox(lng, lat)) return false;
  const code = stateCode?.trim().toUpperCase();
  if (!code) return true;
  if (TERRITORIES.has(code)) return false;
  return IN_SCOPE.has(code);
}

/** FIPS codes of the 50 states and DC (us-atlas keys features by FIPS). */
export const NATIONAL_STATE_FIPS: Record<string, NationalStateCode> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
  '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL',
  '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
  '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE',
  '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV',
  '55': 'WI', '56': 'WY',
};
