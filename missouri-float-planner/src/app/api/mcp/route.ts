// MCP Server for eddy.guide
// Exposes river data, conditions, access points, hazards, and float planning as MCP tools.
// Free access (no x402 gating) to encourage AI agent adoption.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { computeCondition, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';

export const dynamic = 'force-dynamic';

function createMcpServer() {
  const server = new McpServer(
    {
      name: 'eddy-guide',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // --- Tool: list_rivers ---
  server.tool(
    'list_rivers',
    'List all active float rivers in Missouri with basic info',
    {},
    async () => {
      const supabase = await createClient();
      const { data: rivers, error } = await supabase
        .from('rivers')
        .select('id, name, slug, length_miles, description, difficulty_rating, region')
        .eq('active', true)
        .order('name');

      if (error) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }

      const formatted = (rivers || []).map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        lengthMiles: r.length_miles ? parseFloat(r.length_miles) : null,
        description: r.description,
        difficultyRating: r.difficulty_rating,
        region: r.region,
      }));

      return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
    }
  );

  // --- Tool: get_river ---
  server.tool(
    'get_river',
    'Get details for a specific river by slug',
    { slug: z.string().describe('River URL slug (e.g., "current-river", "jacks-fork")') },
    async ({ slug }) => {
      const supabase = await createClient();
      const { data: river, error } = await supabase
        .from('rivers')
        .select('id, name, slug, length_miles, description, difficulty_rating, region, float_summary, float_tip')
        .eq('slug', slug)
        .eq('active', true)
        .single();

      if (error || !river) {
        return { content: [{ type: 'text', text: `River "${slug}" not found.` }], isError: true };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id: river.id,
            name: river.name,
            slug: river.slug,
            lengthMiles: river.length_miles ? parseFloat(river.length_miles) : null,
            description: river.description,
            difficultyRating: river.difficulty_rating,
            region: river.region,
            floatSummary: river.float_summary,
            floatTip: river.float_tip,
          }, null, 2),
        }],
      };
    }
  );

  // --- Tool: get_conditions ---
  server.tool(
    'get_conditions',
    'Get current water conditions for a river (level, flow, floatability)',
    { slug: z.string().describe('River URL slug') },
    async ({ slug }) => {
      const supabase = await createClient();
      const { data: river } = await supabase
        .from('rivers')
        .select('id, name')
        .eq('slug', slug)
        .eq('active', true)
        .single();

      if (!river) {
        return { content: [{ type: 'text', text: `River "${slug}" not found.` }], isError: true };
      }

      // Get primary gauge and thresholds
      const { data: riverGauge } = await supabase
        .from('river_gauges')
        .select(`
          threshold_unit, level_too_low, level_low, level_optimal_min, level_optimal_max,
          level_high, level_dangerous,
          gauge_stations ( id, usgs_site_id, name )
        `)
        .eq('river_id', river.id)
        .eq('is_primary', true)
        .single();

      if (!riverGauge?.gauge_stations) {
        return { content: [{ type: 'text', text: `No gauge data available for ${river.name}.` }] };
      }

      const gauge = Array.isArray(riverGauge.gauge_stations)
        ? riverGauge.gauge_stations[0]
        : riverGauge.gauge_stations;

      // Get latest reading
      const { data: reading } = await supabase
        .from('gauge_readings')
        .select('gauge_height_ft, discharge_cfs, reading_timestamp')
        .eq('gauge_station_id', (gauge as { id: string }).id)
        .order('reading_timestamp', { ascending: false })
        .limit(1)
        .single();

      const thresholds: ConditionThresholds = {
        levelTooLow: riverGauge.level_too_low,
        levelLow: riverGauge.level_low,
        levelOptimalMin: riverGauge.level_optimal_min,
        levelOptimalMax: riverGauge.level_optimal_max,
        levelHigh: riverGauge.level_high,
        levelDangerous: riverGauge.level_dangerous,
        thresholdUnit: (riverGauge.threshold_unit || 'ft') as 'ft' | 'cfs',
      };

      const heightFt = reading?.gauge_height_ft ?? null;
      const cfs = reading?.discharge_cfs ?? null;
      const condition = computeCondition(heightFt, thresholds, cfs);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            river: river.name,
            condition: condition.code,
            label: getConditionShortLabel(condition.code),
            gaugeHeightFt: heightFt,
            dischargeCfs: cfs,
            readingTimestamp: reading?.reading_timestamp,
            gaugeName: (gauge as { name: string }).name,
            gaugeUsgsId: (gauge as { usgs_site_id: string }).usgs_site_id,
          }, null, 2),
        }],
      };
    }
  );

  // --- Tool: get_access_points ---
  server.tool(
    'get_access_points',
    'Get all access points (put-in/take-out locations) for a river',
    { slug: z.string().describe('River URL slug') },
    async ({ slug }) => {
      const supabase = await createClient();
      const { data: river } = await supabase
        .from('rivers')
        .select('id')
        .eq('slug', slug)
        .eq('active', true)
        .single();

      if (!river) {
        return { content: [{ type: 'text', text: `River "${slug}" not found.` }], isError: true };
      }

      const { data: accessPoints } = await supabase
        .from('access_points')
        .select('id, name, slug, river_mile_downstream, type, types, is_public, amenities, description, fee_required, managing_agency, location_snap, location_orig')
        .eq('river_id', river.id)
        .eq('approved', true)
        .order('river_mile_downstream');

      const formatted = (accessPoints || []).map((ap) => {
        const lng = ap.location_snap?.coordinates?.[0] || ap.location_orig?.coordinates?.[0];
        const lat = ap.location_snap?.coordinates?.[1] || ap.location_orig?.coordinates?.[1];
        return {
          id: ap.id,
          name: ap.name,
          slug: ap.slug,
          riverMile: ap.river_mile_downstream ? parseFloat(ap.river_mile_downstream) : null,
          type: ap.type,
          types: ap.types || [],
          isPublic: ap.is_public,
          amenities: ap.amenities || [],
          description: ap.description,
          feeRequired: ap.fee_required,
          managingAgency: ap.managing_agency,
          coordinates: lat && lng ? { lat, lng } : null,
        };
      });

      return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
    }
  );

  // --- Tool: get_hazards ---
  server.tool(
    'get_hazards',
    'Get active hazards (dams, rapids, strainers) for a river',
    { slug: z.string().describe('River URL slug') },
    async ({ slug }) => {
      const supabase = await createClient();
      const { data: river } = await supabase
        .from('rivers')
        .select('id')
        .eq('slug', slug)
        .eq('active', true)
        .single();

      if (!river) {
        return { content: [{ type: 'text', text: `River "${slug}" not found.` }], isError: true };
      }

      const { data: hazards } = await supabase
        .from('river_hazards')
        .select('id, name, type, river_mile_downstream, description, severity, portage_required, portage_side, seasonal_notes, location')
        .eq('river_id', river.id)
        .eq('active', true)
        .order('river_mile_downstream');

      const formatted = (hazards || []).map((h) => ({
        id: h.id,
        name: h.name,
        type: h.type,
        riverMile: h.river_mile_downstream ? parseFloat(h.river_mile_downstream) : null,
        description: h.description,
        severity: h.severity,
        portageRequired: h.portage_required,
        portageSide: h.portage_side,
        seasonalNotes: h.seasonal_notes,
        coordinates: h.location?.coordinates
          ? { lat: h.location.coordinates[1], lng: h.location.coordinates[0] }
          : null,
      }));

      return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
    }
  );

  // --- Tool: plan_float ---
  server.tool(
    'plan_float',
    'Calculate a float plan between two access points. Returns distance, estimated float time, and hazards.',
    {
      riverId: z.string().uuid().describe('River UUID'),
      startAccessPointId: z.string().uuid().describe('Put-in access point UUID'),
      endAccessPointId: z.string().uuid().describe('Take-out access point UUID'),
    },
    async ({ riverId, startAccessPointId, endAccessPointId }) => {
      const supabase = await createClient();

      // Get access points
      const [{ data: start }, { data: end }] = await Promise.all([
        supabase.from('access_points').select('name, river_mile_downstream').eq('id', startAccessPointId).single(),
        supabase.from('access_points').select('name, river_mile_downstream').eq('id', endAccessPointId).single(),
      ]);

      if (!start || !end) {
        return { content: [{ type: 'text', text: 'One or both access points not found.' }], isError: true };
      }

      const startMile = parseFloat(start.river_mile_downstream || '0');
      const endMile = parseFloat(end.river_mile_downstream || '0');
      const distance = Math.abs(endMile - startMile);

      // Get hazards along route
      const minMile = Math.min(startMile, endMile);
      const maxMile = Math.max(startMile, endMile);

      const { data: hazards } = await supabase
        .from('river_hazards')
        .select('name, type, severity, river_mile_downstream, portage_required')
        .eq('river_id', riverId)
        .eq('active', true)
        .gte('river_mile_downstream', minMile)
        .lte('river_mile_downstream', maxMile);

      // Estimate float time at ~2 mph average
      const estimatedHours = distance / 2;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            putIn: start.name,
            takeOut: end.name,
            distanceMiles: Math.round(distance * 10) / 10,
            estimatedFloatTime: {
              hours: Math.round(estimatedHours * 10) / 10,
              formatted: estimatedHours < 1
                ? `${Math.round(estimatedHours * 60)} min`
                : `${Math.round(estimatedHours * 10) / 10} hr`,
            },
            hazardsAlongRoute: (hazards || []).map((h) => ({
              name: h.name,
              type: h.type,
              severity: h.severity,
              portageRequired: h.portage_required,
            })),
          }, null, 2),
        }],
      };
    }
  );

  // --- Tool: get_gauges ---
  server.tool(
    'get_gauges',
    'List all USGS gauge stations with their latest water level readings',
    {},
    async () => {
      const supabase = await createClient();

      const { data: gauges } = await supabase
        .from('gauge_stations')
        .select('id, usgs_site_id, name, location, active')
        .eq('active', true)
        .order('name');

      if (!gauges || gauges.length === 0) {
        return { content: [{ type: 'text', text: 'No active gauge stations found.' }] };
      }

      // Get latest reading for each gauge
      const results = await Promise.all(
        gauges.map(async (gauge) => {
          const { data: reading } = await supabase
            .from('gauge_readings')
            .select('gauge_height_ft, discharge_cfs, reading_timestamp')
            .eq('gauge_station_id', gauge.id)
            .order('reading_timestamp', { ascending: false })
            .limit(1)
            .single();

          return {
            id: gauge.id,
            usgsSiteId: gauge.usgs_site_id,
            name: gauge.name,
            coordinates: gauge.location?.coordinates
              ? { lat: gauge.location.coordinates[1], lng: gauge.location.coordinates[0] }
              : null,
            latestReading: reading
              ? {
                  gaugeHeightFt: reading.gauge_height_ft,
                  dischargeCfs: reading.discharge_cfs,
                  readingTimestamp: reading.reading_timestamp,
                }
              : null,
          };
        })
      );

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
  );

  // --- Tool: get_weather ---
  server.tool(
    'get_weather',
    'Get current weather conditions for a river area',
    { slug: z.string().describe('River URL slug') },
    async ({ slug }) => {
      const supabase = await createClient();
      const { data: river } = await supabase
        .from('rivers')
        .select('id, name, geom')
        .eq('slug', slug)
        .eq('active', true)
        .single();

      if (!river) {
        return { content: [{ type: 'text', text: `River "${slug}" not found.` }], isError: true };
      }

      // Extract a representative coordinate from the river geometry
      let lat: number | null = null;
      let lon: number | null = null;
      try {
        const geom = river.geom as GeoJSON.LineString;
        if (geom?.coordinates?.length > 0) {
          const mid = Math.floor(geom.coordinates.length / 2);
          lon = geom.coordinates[mid][0];
          lat = geom.coordinates[mid][1];
        }
      } catch {
        // geometry parsing failed
      }

      if (!lat || !lon) {
        return { content: [{ type: 'text', text: `No location data available for ${river.name}.` }] };
      }

      // Fetch weather from OpenWeatherMap if API key available
      const apiKey = process.env.OPENWEATHER_API_KEY;
      if (!apiKey) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              river: river.name,
              note: 'Weather API not configured. Visit https://eddy.guide for current weather.',
            }, null, 2),
          }],
        };
      }

      try {
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${apiKey}`
        );
        const weather = await res.json();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              river: river.name,
              temperature: weather.main?.temp,
              feelsLike: weather.main?.feels_like,
              humidity: weather.main?.humidity,
              conditions: weather.weather?.[0]?.description,
              windSpeedMph: weather.wind?.speed,
              windDirection: weather.wind?.deg,
            }, null, 2),
          }],
        };
      } catch {
        return { content: [{ type: 'text', text: `Failed to fetch weather for ${river.name}.` }], isError: true };
      }
    }
  );

  return server;
}

async function handleMcpRequest(req: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
    enableJsonResponse: true,
  });

  const server = createMcpServer();
  await server.connect(transport);

  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}

export async function GET(req: Request) {
  return handleMcpRequest(req);
}

export async function POST(req: Request) {
  return handleMcpRequest(req);
}

export async function DELETE(req: Request) {
  return handleMcpRequest(req);
}
