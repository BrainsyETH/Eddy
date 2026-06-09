// GET /llms-full.txt
// Extended version of llms.txt with dynamically populated river data,
// access point counts, current conditions, and gauge info.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeCondition, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

export async function GET() {
  const supabase = await createClient();

  // Fetch rivers, access point counts, and gauge data in parallel
  const [
    { data: rivers },
    { data: accessPoints },
    { data: hazards },
    { data: riverGauges },
  ] = await Promise.all([
    supabase
      .from('rivers')
      .select('id, name, slug, length_miles, description, difficulty_rating, region')
      .eq('active', true)
      .order('name'),
    supabase
      .from('access_points')
      .select('id, river_id')
      .eq('approved', true),
    supabase
      .from('river_hazards')
      .select('id, river_id')
      .eq('active', true),
    supabase
      .from('river_gauges')
      .select(`
        river_id, is_primary, threshold_unit,
        level_too_low, level_low, level_optimal_min, level_optimal_max,
        level_high, level_dangerous,
        gauge_stations ( id, usgs_site_id, name )
      `)
      .eq('is_primary', true),
  ]);

  // Build condition lookups
  const conditionsByRiver: Record<string, string> = {};
  if (riverGauges) {
    // Get latest readings for all primary gauges
    const gaugeIds = riverGauges
      .map((rg) => {
        const gs = Array.isArray(rg.gauge_stations) ? rg.gauge_stations[0] : rg.gauge_stations;
        return (gs as { id: string } | null)?.id;
      })
      .filter(Boolean) as string[];

    if (gaugeIds.length > 0) {
      // Fetch latest reading per gauge
      const { data: readings } = await supabase
        .from('gauge_readings')
        .select('gauge_station_id, gauge_height_ft, discharge_cfs, reading_timestamp')
        .in('gauge_station_id', gaugeIds)
        .order('reading_timestamp', { ascending: false });

      // Deduplicate to latest per gauge
      const latestByGauge: Record<string, { gauge_height_ft: number | null; discharge_cfs: number | null }> = {};
      for (const r of readings || []) {
        if (!latestByGauge[r.gauge_station_id]) {
          latestByGauge[r.gauge_station_id] = r;
        }
      }

      for (const rg of riverGauges) {
        const gs = Array.isArray(rg.gauge_stations) ? rg.gauge_stations[0] : rg.gauge_stations;
        const gaugeId = (gs as { id: string } | null)?.id;
        if (!gaugeId || !latestByGauge[gaugeId]) continue;

        const reading = latestByGauge[gaugeId];
        const thresholds: ConditionThresholds = {
          levelTooLow: rg.level_too_low,
          levelLow: rg.level_low,
          levelOptimalMin: rg.level_optimal_min,
          levelOptimalMax: rg.level_optimal_max,
          levelHigh: rg.level_high,
          levelDangerous: rg.level_dangerous,
          thresholdUnit: (rg.threshold_unit || 'ft') as 'ft' | 'cfs',
        };

        const condition = computeCondition(reading.gauge_height_ft, thresholds, reading.discharge_cfs);
        conditionsByRiver[rg.river_id] = getConditionShortLabel(condition.code);
      }
    }
  }

  // Count access points and hazards per river
  const apCountByRiver: Record<string, number> = {};
  for (const ap of accessPoints || []) {
    apCountByRiver[ap.river_id] = (apCountByRiver[ap.river_id] || 0) + 1;
  }
  const hazardCountByRiver: Record<string, number> = {};
  for (const h of hazards || []) {
    hazardCountByRiver[h.river_id] = (hazardCountByRiver[h.river_id] || 0) + 1;
  }

  // Build the full llms.txt content
  const riverSections = (rivers || []).map((river) => {
    const parts: string[] = [];
    parts.push(`### ${river.name}`);
    parts.push(`- Slug: ${river.slug}`);
    parts.push(`- URL: ${BASE_URL}/rivers/${river.slug}`);
    parts.push(`- API: ${BASE_URL}/api/rivers/${river.slug}`);
    if (river.length_miles) parts.push(`- Length: ${parseFloat(river.length_miles).toFixed(1)} miles`);
    if (river.difficulty_rating) parts.push(`- Difficulty: ${river.difficulty_rating}`);
    if (river.region) parts.push(`- Region: ${river.region}`);
    const apCount = apCountByRiver[river.id] || 0;
    parts.push(`- Access Points: ${apCount}`);
    const hazardCount = hazardCountByRiver[river.id] || 0;
    if (hazardCount > 0) parts.push(`- Active Hazards: ${hazardCount}`);
    const condition = conditionsByRiver[river.id];
    if (condition) parts.push(`- Current Condition: ${condition}`);
    if (river.description) parts.push(`- ${river.description}`);
    return parts.join('\n');
  });

  const content = `# eddy.guide — Full Reference
> Missouri Ozarks float trip planning platform with real-time river conditions, access points, float times, and weather.
> This is the extended version of llms.txt with live river data. See also: ${BASE_URL}/llms.txt

## About
Eddy is a free river guide for planning float trips on Missouri's Ozark rivers. It provides live water conditions from USGS gauge stations, detailed access point information, float time calculations based on vessel type and water level, hazard warnings, and weather forecasts.

## Rivers (${(rivers || []).length} active)

${riverSections.join('\n\n')}

## Public API Endpoints
All API endpoints return JSON. AI agents accessing the API should use the x402 payment protocol.

- GET ${BASE_URL}/api/rivers — List all active rivers with current conditions
- GET ${BASE_URL}/api/rivers/{slug} — River details with GeoJSON geometry
- GET ${BASE_URL}/api/rivers/{slug}/access-points — Access points with coordinates and amenities
- GET ${BASE_URL}/api/rivers/{slug}/hazards — Active hazards (dams, rapids, strainers)
- GET ${BASE_URL}/api/rivers/{slug}/pois — Points of interest (springs, caves, scenic spots)
- GET ${BASE_URL}/api/rivers/{slug}/services — Nearby outfitters, campgrounds, shuttle services
- GET ${BASE_URL}/api/conditions/{riverId} — Current water conditions (level, flow, trend)
- GET ${BASE_URL}/api/gauges — All gauge stations with latest readings and thresholds
- GET ${BASE_URL}/api/gauges/{siteId}/history — Historical gauge readings
- GET ${BASE_URL}/api/plan?riverId={id}&startId={id}&endId={id} — Calculate a float plan
- GET ${BASE_URL}/api/vessel-types — Vessel types with speed profiles
- GET ${BASE_URL}/api/weather/{riverSlug} — Current weather
- GET ${BASE_URL}/api/weather/{riverSlug}/forecast — Weather forecast
- GET ${BASE_URL}/api/blog — Published blog posts
- GET ${BASE_URL}/api/blog/{slug} — Full blog post content

## Machine-Readable Specifications
- OpenAPI 3.1: ${BASE_URL}/api/openapi.json
- MCP Server: ${BASE_URL}/api/mcp (Model Context Protocol for AI agent tool use — free access)
- Data Export: ${BASE_URL}/api/export/rivers.json (complete dataset for RAG pipelines)
- x402 Pricing: ${BASE_URL}/.well-known/x402

## Condition Codes
Rivers are rated using these condition codes based on USGS gauge readings:
- **good** — Optimal for floating, normal water levels
- **flowing** — Above optimal but safe, faster current
- **low** — Below optimal, may scrape in shallow areas
- **too_low** — Not recommended, too shallow for most vessels
- **high** — Above safe levels, experienced paddlers only
- **dangerous** — Flood stage, do not float
- **unknown** — No recent gauge data available

## Data Freshness
- River conditions: Updated hourly from USGS gauge stations
- Weather: Real-time
- Access points & hazards: Community-maintained
- This file: Regenerated on each request (cached 1 hour)
`;

  return new NextResponse(content.trim(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
