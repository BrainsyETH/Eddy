import { NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

export async function GET() {
  const content = `# eddy.guide
> Missouri Ozarks float trip planning platform with real-time river conditions, access points, float times, and weather.

## About
Eddy is a free river guide for planning float trips on Missouri's Ozark rivers. It provides live water conditions from USGS gauge stations, detailed access point information, float time calculations based on vessel type and water level, hazard warnings, and weather forecasts. Data is sourced from USGS, NPS, and community reports.

## Rivers Covered
Eddy covers float rivers in Missouri's Ozarks region including the Current River, Jacks Fork, Eleven Point, Meramec, Huzzah Creek, Courtois Creek, Big Piney, Niangua, and Beaver Creek. Each river has detailed access points, hazards, points of interest, and real-time gauge data.

## Key Content Pages
- ${BASE_URL}/rivers — Browse all rivers with current conditions
- ${BASE_URL}/rivers/{slug} — Individual river page with conditions, access points, float planning
- ${BASE_URL}/rivers/{slug}/access/{accessSlug} — Access point details (coordinates, amenities, parking, facilities)
- ${BASE_URL}/gauges — Real-time USGS gauge stations with water levels and flow trends
- ${BASE_URL}/blog — Float trip guides, safety tips, gear reviews, and river profiles
- ${BASE_URL}/about — How Eddy works, FAQ about river conditions and float planning

## Public API
All API endpoints return JSON. AI agents accessing the API programmatically should use the x402 payment protocol (see below).

- GET ${BASE_URL}/api/rivers — List all active rivers with current conditions
- GET ${BASE_URL}/api/rivers/{slug} — River details with GeoJSON geometry
- GET ${BASE_URL}/api/rivers/{slug}/access-points — Access points with coordinates and amenities
- GET ${BASE_URL}/api/rivers/{slug}/hazards — Active hazards (dams, rapids, strainers)
- GET ${BASE_URL}/api/rivers/{slug}/pois — Points of interest (springs, caves, scenic spots)
- GET ${BASE_URL}/api/rivers/{slug}/services — Nearby outfitters, campgrounds, shuttle services
- GET ${BASE_URL}/api/conditions/{riverId} — Current water conditions (level, flow, trend)
- GET ${BASE_URL}/api/gauges — All gauge stations with latest readings and thresholds
- GET ${BASE_URL}/api/gauges/{siteId}/history — Historical gauge readings
- GET ${BASE_URL}/api/plan?riverId={id}&startId={id}&endId={id}&vesselTypeId={id} — Calculate a float plan with distance, time, drive-back, hazards
- GET ${BASE_URL}/api/vessel-types — Vessel types (canoe, kayak, tube, raft) with speed profiles
- GET ${BASE_URL}/api/weather/{riverSlug} — Current weather for a river
- GET ${BASE_URL}/api/weather/{riverSlug}/forecast — Weather forecast
- GET ${BASE_URL}/api/blog — Published blog posts
- GET ${BASE_URL}/api/blog/{slug} — Full blog post content

## Machine-Readable Specifications
- OpenAPI 3.1 spec: ${BASE_URL}/api/openapi.json
- MCP Server: ${BASE_URL}/api/mcp (Model Context Protocol for AI agent tool use)
- Data Export: ${BASE_URL}/api/export/rivers.json (complete dataset for RAG pipelines)

## x402 Payment Protocol
API endpoints are gated for AI agents via the x402 payment protocol. See pricing and payment details at:
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
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
