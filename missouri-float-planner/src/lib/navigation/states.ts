// src/lib/navigation/states.ts
// US state code ↔ URL slug ↔ display name reference data for the
// /rivers/[state]/[slug] hierarchy. Static reference data (not per-river
// curation), so it lives in code. Non-US regions get entries here when a
// country expansion is actually scheduled.

interface StateInfo {
  code: string; // rivers.state value, e.g. 'MO'
  slug: string; // URL segment, e.g. 'missouri'
  name: string; // display name, e.g. 'Missouri'
}

const STATES: StateInfo[] = [
  { code: 'AL', slug: 'alabama', name: 'Alabama' },
  { code: 'AK', slug: 'alaska', name: 'Alaska' },
  { code: 'AZ', slug: 'arizona', name: 'Arizona' },
  { code: 'AR', slug: 'arkansas', name: 'Arkansas' },
  { code: 'CA', slug: 'california', name: 'California' },
  { code: 'CO', slug: 'colorado', name: 'Colorado' },
  { code: 'CT', slug: 'connecticut', name: 'Connecticut' },
  { code: 'DE', slug: 'delaware', name: 'Delaware' },
  { code: 'FL', slug: 'florida', name: 'Florida' },
  { code: 'GA', slug: 'georgia', name: 'Georgia' },
  { code: 'HI', slug: 'hawaii', name: 'Hawaii' },
  { code: 'ID', slug: 'idaho', name: 'Idaho' },
  { code: 'IL', slug: 'illinois', name: 'Illinois' },
  { code: 'IN', slug: 'indiana', name: 'Indiana' },
  { code: 'IA', slug: 'iowa', name: 'Iowa' },
  { code: 'KS', slug: 'kansas', name: 'Kansas' },
  { code: 'KY', slug: 'kentucky', name: 'Kentucky' },
  { code: 'LA', slug: 'louisiana', name: 'Louisiana' },
  { code: 'ME', slug: 'maine', name: 'Maine' },
  { code: 'MD', slug: 'maryland', name: 'Maryland' },
  { code: 'MA', slug: 'massachusetts', name: 'Massachusetts' },
  { code: 'MI', slug: 'michigan', name: 'Michigan' },
  { code: 'MN', slug: 'minnesota', name: 'Minnesota' },
  { code: 'MS', slug: 'mississippi', name: 'Mississippi' },
  { code: 'MO', slug: 'missouri', name: 'Missouri' },
  { code: 'MT', slug: 'montana', name: 'Montana' },
  { code: 'NE', slug: 'nebraska', name: 'Nebraska' },
  { code: 'NV', slug: 'nevada', name: 'Nevada' },
  { code: 'NH', slug: 'new-hampshire', name: 'New Hampshire' },
  { code: 'NJ', slug: 'new-jersey', name: 'New Jersey' },
  { code: 'NM', slug: 'new-mexico', name: 'New Mexico' },
  { code: 'NY', slug: 'new-york', name: 'New York' },
  { code: 'NC', slug: 'north-carolina', name: 'North Carolina' },
  { code: 'ND', slug: 'north-dakota', name: 'North Dakota' },
  { code: 'OH', slug: 'ohio', name: 'Ohio' },
  { code: 'OK', slug: 'oklahoma', name: 'Oklahoma' },
  { code: 'OR', slug: 'oregon', name: 'Oregon' },
  { code: 'PA', slug: 'pennsylvania', name: 'Pennsylvania' },
  { code: 'RI', slug: 'rhode-island', name: 'Rhode Island' },
  { code: 'SC', slug: 'south-carolina', name: 'South Carolina' },
  { code: 'SD', slug: 'south-dakota', name: 'South Dakota' },
  { code: 'TN', slug: 'tennessee', name: 'Tennessee' },
  { code: 'TX', slug: 'texas', name: 'Texas' },
  { code: 'UT', slug: 'utah', name: 'Utah' },
  { code: 'VT', slug: 'vermont', name: 'Vermont' },
  { code: 'VA', slug: 'virginia', name: 'Virginia' },
  { code: 'WA', slug: 'washington', name: 'Washington' },
  { code: 'WV', slug: 'west-virginia', name: 'West Virginia' },
  { code: 'WI', slug: 'wisconsin', name: 'Wisconsin' },
  { code: 'WY', slug: 'wyoming', name: 'Wyoming' },
  { code: 'DC', slug: 'washington-dc', name: 'Washington, D.C.' },
];

const BY_CODE = new Map(STATES.map((s) => [s.code, s]));
const BY_SLUG = new Map(STATES.map((s) => [s.slug, s]));

/** 'MO' → 'missouri'. Unknown codes fall back to a lowercased code. */
export function stateSlug(code: string): string {
  return BY_CODE.get(code)?.slug ?? code.toLowerCase();
}

/** 'missouri' → 'MO', or null when the segment isn't a state slug. */
export function stateCodeFromSlug(slug: string): string | null {
  return BY_SLUG.get(slug)?.code ?? null;
}

/** 'MO' → 'Missouri'. Unknown codes echo the code. */
export function stateName(code: string): string {
  return BY_CODE.get(code)?.name ?? code;
}
