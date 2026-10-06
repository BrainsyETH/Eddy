import { X402_ENABLED } from '@/lib/x402/config';
import { NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

export const revalidate = 300;
export async function GET() {
  const content = `# eddy.guide
> Ozarks river guide with live conditions, access points, float planning, and weather.
> For a version with live river data and conditions, see: ${BASE_URL}/llms-full.txt

## About
Eddy helps people plan float trips on Ozark rivers in Missouri and Arkansas. Conditions, access information and float planning are free; Eddy's written Reads are a premium feature. Data includes USGS gauge readings, NPS information and community reports. Eddy is a planning guide: check local conditions before going on the water.

## Rivers Covered
The active river catalog is available at ${BASE_URL}/api/rivers. Examples include the Current, Jacks Fork, Eleven Point, Meramec, Huzzah, Courtois, Niangua and Buffalo. Coverage and available details vary by river; use the catalog rather than assuming this list is complete.

## Key Content Pages
- ${BASE_URL}/rivers — Browse all rivers with current conditions
- ${BASE_URL}/rivers/{state}/{slug} — Canonical river page (for example /rivers/missouri/current)
- ${BASE_URL}/rivers/{state}/{slug}/access/{accessSlug} — Access point details (coordinates, amenities, parking, facilities)
- ${BASE_URL}/app — Eddy for iPhone and App Store download
- ${BASE_URL}/dams — Lake levels, dam releases and generation schedules
- ${BASE_URL}/river-map — Live statewide map: every curated river painted by its USGS gauges, with 30-day trends, gauge detail, forecast-aware flood warnings, and a drag-to-replay timeline
- ${BASE_URL}/blog — Float trip guides, safety tips, gear reviews, and river profiles
- ${BASE_URL}/about — How Eddy works, FAQ about river conditions and float planning

## Public API
REST endpoints return JSON; applicable paid REST requests use x402 as described below. The separate public MCP endpoint at ${BASE_URL}/api/mcp provides free agent tools for river discovery, conditions and float planning, subject to rate limits. Do not treat an unavailable or stale reading as a safe-water assessment.

- GET ${BASE_URL}/api/rivers — List all active rivers with current conditions
- GET ${BASE_URL}/api/rivers/{slug} — River details with GeoJSON geometry
- GET ${BASE_URL}/api/rivers/{slug}/access-points — Access points with coordinates and amenities
- GET ${BASE_URL}/api/rivers/{slug}/hazards — Active hazards (dams, rapids, strainers)
- GET ${BASE_URL}/api/rivers/{slug}/pois — Points of interest (springs, caves, scenic spots)
- GET ${BASE_URL}/api/rivers/{slug}/services — Nearby outfitters, campgrounds, shuttle services
- GET ${BASE_URL}/api/conditions/{riverId} — Current water conditions (level, flow, trend)
- GET ${BASE_URL}/api/gauges — All gauge stations with latest readings and thresholds
- GET ${BASE_URL}/api/search?q={query} — Search rivers, gauges and access points by name
- GET ${BASE_URL}/api/gauges/{siteId}/history — Historical gauge readings
- GET ${BASE_URL}/api/plan?riverId={id}&startId={id}&endId={id}&vesselTypeId={id} — Calculate a float plan with distance, time, drive-back, hazards
- GET ${BASE_URL}/api/vessel-types — Vessel types (canoe, kayak, tube, raft) with speed profiles
- GET ${BASE_URL}/api/weather/{riverSlug} — Current weather for a river
- GET ${BASE_URL}/api/weather/{riverSlug}/forecast — Weather forecast
- GET ${BASE_URL}/api/blog — Published blog posts
- GET ${BASE_URL}/api/blog/{slug} — Full blog post content

## Agent Tools
- Developer setup and tool guide: ${BASE_URL}/developers
- MCP access is free, without authentication or x402 payment, within request limits.
- Use list_rivers for authoritative curated coverage and slugs; plan_float accepts slugs/UUIDs and vesselType.
- find_floats returns a bounded shortlist, not an exhaustive ranking.
- Preserve component statuses and source timestamps. Current observations are not future forecasts.
- Include returned plan/river URLs when useful. No closure records does not mean all-clear.

## Machine-Readable Specifications
- OpenAPI 3.1 spec: ${BASE_URL}/api/openapi.json
- MCP Server: ${BASE_URL}/api/mcp (Model Context Protocol for AI agent tool use — free, rate-limited)
- Data Export: ${BASE_URL}/api/export/rivers.json (complete dataset for RAG pipelines)

## x402 Payment Protocol
REST x402 enforcement is ${X402_ENABLED ? "enabled" : "disabled"} in this deployment. When enabled, applicable REST requests may receive HTTP 402 with payment requirements. MCP /api/mcp remains free. See the manifest for the actual enabled state, networks and per-route pricing:
- ${BASE_URL}/.well-known/x402

Content pages (rivers, blog, gauges, about) are freely accessible to AI crawlers for indexing and grounding.

## Data Freshness
- River conditions: Updated every hour from USGS gauge stations
- Weather: Real-time from weather APIs
- Access points & hazards: Community-maintained, updated as conditions change
- Blog content: Published periodically with guides and seasonal updates

## Contact
Eddy is a community project. Submit feedback or corrections at ${BASE_URL} via the feedback form.
`;

  return new NextResponse(content.trim(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
