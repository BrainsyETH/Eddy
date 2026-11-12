// Text for /llms.txt and /llms-full.txt.
//
// Both builders are pure so the test suite can check what the files claim
// against the rest of the site (robots rules, the canonical condition system)
// without a request context or a database.
//
// /llms.txt follows https://llmstxt.org: an H1, one blockquote summary, prose,
// then H2 sections whose list items are `- [Title](url): note`. Tools that read
// the format pick links out of those lists, so a link target must be a real
// URL — path templates such as /rivers/{state}/{slug} belong in the prose.

import {
  CONDITION_ORDER,
  CONDITION_SYSTEM,
  FLOATABLE_NOW,
  type ConditionCode,
} from '@shared/condition-system';

export interface LlmsLink {
  title: string;
  /** Site-relative path, e.g. "/rivers". */
  path: string;
  note: string;
}

export interface LlmsTxtOptions {
  baseUrl: string;
  x402Enabled: boolean;
  campingEnabled: boolean;
  floatSearchEnabled: boolean;
  lakes: ReadonlyArray<{ slug: string; name: string }>;
}

export interface LlmsRiver {
  name: string;
  slug: string;
  /** Canonical page path, e.g. "/rivers/missouri/current". */
  path: string;
  lengthMiles: number | null;
  difficulty: string | null;
  region: string | null;
  accessPointCount: number;
  hazardCount: number;
  /** Short condition label, omitted when the river has no current rating. */
  conditionLabel: string | null;
  description: string | null;
}

export interface LlmsFullTxtOptions {
  baseUrl: string;
  x402Enabled: boolean;
  rivers: readonly LlmsRiver[];
}

/** Names of the H2 sections in /llms.txt, shared with the tests. */
export const LLMS_SECTIONS = {
  pages: 'Pages',
  agents: 'Agent access',
  rest: 'REST API',
  optional: 'Optional',
} as const;

const SAFETY_NOTE =
  'Eddy is a planning guide: check local conditions before going on the water. Do not treat an unavailable or stale reading as a safe-water assessment.';

const AGENT_GUIDANCE = [
  'Use list_rivers for authoritative curated coverage and slugs; plan_float accepts slugs/UUIDs and vesselType.',
  'find_floats returns a bounded shortlist, not an exhaustive ranking.',
  'Preserve component statuses and source timestamps. Current observations are not future forecasts.',
  'Include returned plan/river URLs when useful. No closure records does not mean all-clear.',
];

function restPolicy(x402Enabled: boolean): string {
  return x402Enabled
    ? 'REST x402 enforcement is enabled in this deployment: requests from AI agents to the REST endpoints may receive HTTP 402 with payment requirements. The x402 manifest lists the networks and per-route pricing.'
    : 'REST x402 enforcement is disabled in this deployment, so the REST endpoints do not ask for payment. The x402 manifest reports the current state.';
}

function renderLinks(baseUrl: string, links: readonly LlmsLink[]): string {
  return links.map(({ title, path, note }) => `- [${title}](${baseUrl}${path}): ${note}`).join('\n');
}

function pageLinks(options: LlmsTxtOptions): LlmsLink[] {
  return [
    { title: 'Rivers', path: '/rivers', note: 'Every covered river with its current condition' },
    { title: 'Plan a float', path: '/plan', note: 'Pick a river, put-in and take-out for distance, float time and conditions' },
    ...(options.floatSearchEnabled
      ? [{ title: 'Find a float', path: '/find-float', note: 'Featured Ozarks floats and floats that fit your day' }]
      : []),
    { title: 'River map', path: '/river-map', note: 'USGS streamflow across all 50 states compared with usual for the time of year, with NWS flood status' },
    { title: 'Ozarks river map', path: '/river-map/ozarks', note: 'Curated Ozarks rivers with float conditions, 30-day trends and flood warnings' },
    { title: 'Dams', path: '/dams', note: 'Lake levels, dam releases and hourly generation schedules' },
    ...options.lakes.map((lake) => ({
      title: lake.name,
      path: `/lakes/${lake.slug}`,
      note: 'Water levels, recent changes and reviewed boat launches',
    })),
    ...(options.campingEnabled
      ? [{ title: 'Camping', path: '/camping', note: 'Campgrounds along Ozark rivers, with dates and individual campsites' }]
      : []),
    { title: 'Guides', path: '/blog', note: 'Float trip guides, safety tips, gear reviews and river profiles' },
    { title: 'Coverage', path: '/coverage', note: 'What Eddy curates and what it only reports from USGS' },
    { title: 'About', path: '/about', note: 'How Eddy works, with questions about river conditions and float planning' },
    { title: 'Eddy for iPhone', path: '/app', note: 'The iOS app' },
  ];
}

const AGENT_LINKS: LlmsLink[] = [
  { title: 'Full reference', path: '/llms-full.txt', note: 'This file plus every river with its live condition, access point and hazard counts, and the REST endpoint list' },
  { title: 'MCP server', path: '/api/mcp', note: 'Model Context Protocol tools for river discovery, conditions and float planning. Free, no authentication, rate-limited' },
  { title: 'Developer guide', path: '/developers', note: 'Developer setup and tool guide' },
  { title: 'Dataset export', path: '/api/export/rivers.json', note: 'Rivers, access points, hazards, points of interest, gauges and vessel types in one free JSON file' },
  { title: 'OpenAPI 3.1 specification', path: '/api/openapi.json', note: 'Machine-readable description of the REST API' },
];

const REST_LINKS: LlmsLink[] = [
  { title: 'x402 payment manifest', path: '/.well-known/x402', note: 'Whether payment is enforced, accepted networks and per-route pricing' },
  { title: 'Rivers', path: '/api/rivers', note: 'Active rivers with current conditions. One river, its access points, hazards, points of interest and services are under /api/rivers/{slug}' },
  { title: 'Gauges', path: '/api/gauges', note: 'Gauge stations with latest readings and thresholds. History is at /api/gauges/{siteId}/history' },
  { title: 'Vessel types', path: '/api/vessel-types', note: 'Canoe, kayak, tube and raft speed profiles used by /api/plan' },
  { title: 'Guides', path: '/api/blog', note: 'Published guides. One guide is at /api/blog/{slug}' },
];

const OPTIONAL_LINKS: LlmsLink[] = [
  { title: 'Support', path: '/support', note: 'Help and contact' },
  { title: 'Privacy', path: '/privacy', note: 'Privacy policy' },
  { title: 'Terms', path: '/terms', note: 'Terms of use' },
];

export function buildLlmsTxt(options: LlmsTxtOptions): string {
  const { baseUrl, x402Enabled } = options;
  return `# eddy.guide

> Float trip planner for Ozark rivers in Missouri and Arkansas, with live USGS water conditions, access points, float time estimates and weather.

Conditions, access information and float planning are free; Eddy's written Reads are a premium feature. Data includes USGS gauge readings, NPS information and community reports. ${SAFETY_NOTE}

Each river has a page at /rivers/{state}/{slug} (for example ${baseUrl}/rivers/missouri/current) and each access point at /rivers/{state}/{slug}/access/{accessSlug}. Coverage and available detail vary by river, so use the Rivers page, list_rivers or the dataset export rather than assuming any list is complete.

Agents should start with the free MCP server or the dataset export below. ${restPolicy(x402Enabled)}

When using the MCP tools:
${AGENT_GUIDANCE.map((line) => `- ${line}`).join('\n')}

## ${LLMS_SECTIONS.pages}

${renderLinks(baseUrl, pageLinks(options))}

## ${LLMS_SECTIONS.agents}

${renderLinks(baseUrl, AGENT_LINKS)}

## ${LLMS_SECTIONS.rest}

${renderLinks(baseUrl, REST_LINKS)}

## ${LLMS_SECTIONS.optional}

${renderLinks(baseUrl, OPTIONAL_LINKS)}
`;
}

/**
 * The condition glossary, generated from the canonical system so the meaning a
 * model reads here cannot drift from the meaning the site and app display.
 */
export function conditionGlossary(): string {
  const codes: ConditionCode[] = [...CONDITION_ORDER, 'unknown'];
  const lines = codes.map((code) => {
    const { label, description } = CONDITION_SYSTEM[code];
    return `- **${code}** (shown as "${label}"): ${description}`;
  });
  const floatable = codes.filter((code) => FLOATABLE_NOW.has(code)).map((code) => `**${code}**`);
  return [
    'Each river is rated from its USGS gauge reading. Rated codes are listed from lowest to highest water.',
    `Eddy's "Floatable now" count includes only ${floatable.join(' and ')}. The other codes are not all "do not float": each carries its own guidance below.`,
    '',
    ...lines,
  ].join('\n');
}

function riverSection(baseUrl: string, river: LlmsRiver): string {
  const parts = [
    `### ${river.name}`,
    `- Slug: ${river.slug}`,
    `- URL: ${baseUrl}${river.path}`,
    `- API: ${baseUrl}/api/rivers/${river.slug}`,
  ];
  if (river.lengthMiles != null) parts.push(`- Length: ${river.lengthMiles.toFixed(1)} miles`);
  if (river.difficulty) parts.push(`- Difficulty: ${river.difficulty}`);
  if (river.region) parts.push(`- Region: ${river.region}`);
  parts.push(`- Access Points: ${river.accessPointCount}`);
  if (river.hazardCount > 0) parts.push(`- Active Hazards: ${river.hazardCount}`);
  if (river.conditionLabel) parts.push(`- Current Condition: ${river.conditionLabel}`);
  if (river.description) parts.push(`- ${river.description}`);
  return parts.join('\n');
}

export function buildLlmsFullTxt({ baseUrl, x402Enabled, rivers }: LlmsFullTxtOptions): string {
  return `# eddy.guide — Full Reference

> Float trip planner for Ozark rivers in Missouri and Arkansas, with live USGS water conditions, access points, float time estimates and weather.

This is the extended version of ${baseUrl}/llms.txt, with live data for every covered river.

## About
Eddy helps people plan float trips on the rivers listed below. Conditions, access information and float planning are free; Eddy's written Reads are a premium feature. Data includes USGS gauge readings, NPS information and community reports. ${SAFETY_NOTE}

## Rivers (${rivers.length} active)

${rivers.map((river) => riverSection(baseUrl, river)).join('\n\n')}

## Condition Codes
${conditionGlossary()}

## Agent Tools
- MCP Server: ${baseUrl}/api/mcp (Model Context Protocol; free, no authentication, rate-limited)
- Developer setup and tool guide: ${baseUrl}/developers
${AGENT_GUIDANCE.map((line) => `- ${line}`).join('\n')}

## Machine-Readable Specifications
- OpenAPI 3.1: ${baseUrl}/api/openapi.json
- Data Export: ${baseUrl}/api/export/rivers.json (complete dataset in one free JSON file)
- x402 Pricing: ${baseUrl}/.well-known/x402

## REST API Endpoints
REST endpoints return JSON. ${restPolicy(x402Enabled)}

- GET ${baseUrl}/api/rivers — List all active rivers with current conditions
- GET ${baseUrl}/api/rivers/{slug} — River details with GeoJSON geometry
- GET ${baseUrl}/api/rivers/{slug}/access-points — Access points with coordinates and amenities
- GET ${baseUrl}/api/rivers/{slug}/hazards — Active hazards (dams, rapids, strainers)
- GET ${baseUrl}/api/rivers/{slug}/pois — Points of interest (springs, caves, scenic spots)
- GET ${baseUrl}/api/rivers/{slug}/services — Nearby outfitters, campgrounds, shuttle services
- GET ${baseUrl}/api/conditions/{riverId} — Current water conditions (level, flow, trend)
- GET ${baseUrl}/api/gauges — All gauge stations with latest readings and thresholds
- GET ${baseUrl}/api/gauges/{siteId}/history — Historical gauge readings
- GET ${baseUrl}/api/search?q={query} — Search rivers, gauges and access points by name
- GET ${baseUrl}/api/plan?riverId={id}&startId={id}&endId={id}&vesselTypeId={id} — Calculate a float plan with distance, time, drive-back, hazards
- GET ${baseUrl}/api/vessel-types — Vessel types (canoe, kayak, tube, raft) with speed profiles
- GET ${baseUrl}/api/weather/{riverSlug} — Current weather for a river
- GET ${baseUrl}/api/weather/{riverSlug}/forecast — Weather forecast
- GET ${baseUrl}/api/blog — Published guides
- GET ${baseUrl}/api/blog/{slug} — Full guide content

## Data Freshness
- River conditions: Updated hourly from USGS gauge stations
- Weather: Real-time
- Access points & hazards: Community-maintained
- This file: Regenerated from the database, cached for up to 1 hour
`;
}
