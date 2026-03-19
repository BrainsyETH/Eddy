// src/lib/chat/tool-handlers.ts
// Executes tool calls by querying existing DB/API functions directly.
// Each handler returns a JSON-serializable result that gets sent back to Claude.

import { createAdminClient } from '@/lib/supabase/admin';
import { computeCondition, type ConditionThresholds } from '@/lib/conditions';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';
import { buildGaugeTrajectory } from '@/lib/eddy/gauge-trajectory';
import { fetchWeather, fetchForecast, getCityForRiver } from '@/lib/weather/openweather';
import { fetchNWSAlerts, filterAlertsForRiver } from '@/lib/nws/alerts';
import { calculateFloatTime } from '@/lib/calculations/floatTime';
import { getDriveTime, geocodeAddress } from '@/lib/mapbox/directions';

// Slug map: user-facing names → DB slugs
const SLUG_MAP: Record<string, string> = {
  'huzzah': 'huzzah',
  'huzzah_creek': 'huzzah',
  'courtois': 'courtois',
  'courtois_creek': 'courtois',
  'current': 'current',
  'current_river': 'current',
  'jacks-fork': 'jacks-fork',
  'jacks_fork': 'jacks-fork',
  'eleven-point': 'eleven-point',
  'eleven_point': 'eleven-point',
  'meramec': 'meramec',
  'meramec_river': 'meramec',
  'big-piney': 'big-piney',
  'big_piney': 'big-piney',
  'gasconade': 'gasconade',
};

function normalizeSlug(input: string): string {
  const lower = input.toLowerCase().trim().replace(/\s+/g, '-');
  return SLUG_MAP[lower] || SLUG_MAP[lower.replace(/-/g, '_')] || lower;
}

/**
 * Dispatches a tool call to the appropriate handler.
 */
export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case 'get_river_conditions':
      return handleGetRiverConditions(toolInput);
    case 'get_access_points':
      return handleGetAccessPoints(toolInput);
    case 'get_float_route':
      return handleGetFloatRoute(toolInput);
    case 'get_river_hazards':
      return handleGetRiverHazards(toolInput);
    case 'get_weather':
      return handleGetWeather(toolInput);
    case 'get_nearby_services':
      return handleGetNearbyServices(toolInput);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Tool 1: get_river_conditions ────────────────────────────────────────────

async function handleGetRiverConditions(input: Record<string, unknown>) {
  const riverSlug = normalizeSlug(input.river_slug as string);
  const supabase = createAdminClient();

  // Get river
  const { data: river } = await supabase
    .from('rivers')
    .select('id, name, slug')
    .eq('slug', riverSlug)
    .single();

  if (!river) {
    return { error: `River not found: ${riverSlug}. Available rivers: huzzah, courtois, current, jacks-fork, eleven-point, meramec, big-piney, gasconade` };
  }

  // Get primary gauge with thresholds
  const { data: gaugeLink } = await supabase
    .from('river_gauges')
    .select(`
      level_too_low, level_low, level_optimal_min, level_optimal_max,
      level_high, level_dangerous, threshold_unit,
      gauge_stations (id, name, usgs_site_id)
    `)
    .eq('river_id', river.id)
    .eq('is_primary', true)
    .single();

  if (!gaugeLink) {
    return { error: `No gauge configured for ${river.name}` };
  }

  const station = Array.isArray(gaugeLink.gauge_stations)
    ? gaugeLink.gauge_stations[0]
    : gaugeLink.gauge_stations;

  if (!station?.usgs_site_id) {
    return { error: `Gauge station missing USGS ID for ${river.name}` };
  }

  // Try DB reading first, fall back to live USGS
  const { data: dbReading } = await supabase
    .from('gauge_readings')
    .select('gauge_height_ft, discharge_cfs, reading_timestamp')
    .eq('gauge_station_id', station.id)
    .order('reading_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  let gaugeHeightFt = dbReading?.gauge_height_ft ?? null;
  let dischargeCfs = dbReading?.discharge_cfs ?? null;
  let readingTimestamp = dbReading?.reading_timestamp ?? null;

  // If stale (>2h), fetch live from USGS
  const ageMs = readingTimestamp ? Date.now() - new Date(readingTimestamp).getTime() : Infinity;
  if (ageMs > 2 * 60 * 60 * 1000) {
    try {
      const liveReadings = await fetchGaugeReadings([station.usgs_site_id], { skipCache: true });
      const live = liveReadings[0];
      if (live) {
        if (live.gaugeHeightFt !== null && live.gaugeHeightFt !== undefined) gaugeHeightFt = live.gaugeHeightFt;
        if (live.dischargeCfs !== null && live.dischargeCfs !== undefined) dischargeCfs = live.dischargeCfs;
        if (live.readingTimestamp) readingTimestamp = live.readingTimestamp;
      }
    } catch (e) {
      console.warn(`[ChatTool] Live USGS fetch failed for ${station.usgs_site_id}:`, e);
    }
  }

  // Compute condition
  const thresholds: ConditionThresholds = {
    levelTooLow: gaugeLink.level_too_low,
    levelLow: gaugeLink.level_low,
    levelOptimalMin: gaugeLink.level_optimal_min,
    levelOptimalMax: gaugeLink.level_optimal_max,
    levelHigh: gaugeLink.level_high,
    levelDangerous: gaugeLink.level_dangerous,
    thresholdUnit: (gaugeLink as Record<string, unknown>).threshold_unit as 'ft' | 'cfs' | undefined,
  };
  const condition = computeCondition(gaugeHeightFt, thresholds, dischargeCfs);

  // Build optimal range string
  const unit = gaugeLink.threshold_unit === 'cfs' ? 'cfs' : 'ft';
  const optimalRange = (gaugeLink.level_optimal_min != null && gaugeLink.level_optimal_max != null)
    ? `${gaugeLink.level_optimal_min}-${gaugeLink.level_optimal_max} ${unit}`
    : 'unknown';

  // Get trend via gauge trajectory
  let trend: string | null = null;
  let trendDetail: string | null = null;
  try {
    const trajectory = await buildGaugeTrajectory(riverSlug);
    if (trajectory) {
      trend = trajectory.narrative;
      if (trajectory.change24h != null) {
        const sign = trajectory.change24h >= 0 ? '+' : '';
        trendDetail = `${sign}${trajectory.change24h.toFixed(1)} ft in last 24h`;
      }
    }
  } catch (e) {
    console.warn(`[ChatTool] Trajectory failed for ${riverSlug}:`, e);
  }

  return {
    riverName: river.name,
    riverSlug: river.slug,
    gaugeName: station.name || 'Unknown gauge',
    gaugeHeightFt,
    dischargeCfs,
    conditionCode: condition.code,
    conditionLabel: condition.label,
    optimalRange,
    trend,
    trendDetail,
    readingTimestamp,
    riverUrl: `/rivers/${river.slug}`,
    usgsUrl: `https://waterdata.usgs.gov/monitoring-location/${station.usgs_site_id}/`,
  };
}

// ─── Tool 2: get_access_points ───────────────────────────────────────────────

async function handleGetAccessPoints(input: Record<string, unknown>) {
  const riverSlug = normalizeSlug(input.river_slug as string);
  const supabase = createAdminClient();

  const { data: river } = await supabase
    .from('rivers')
    .select('id, name')
    .eq('slug', riverSlug)
    .single();

  if (!river) {
    return { error: `River not found: ${riverSlug}` };
  }

  const { data: accessPoints } = await supabase
    .from('access_points')
    .select('id, name, slug, river_mile_downstream, type, types, is_public, amenities, parking_info, road_access, fee_required, description, location_orig, location_snap')
    .eq('river_id', river.id)
    .eq('approved', true)
    .order('river_mile_downstream', { ascending: true });

  return {
    riverName: river.name,
    accessPoints: (accessPoints || []).map(ap => {
      const lng = ap.location_orig?.coordinates?.[0] || ap.location_snap?.coordinates?.[0];
      const lat = ap.location_orig?.coordinates?.[1] || ap.location_snap?.coordinates?.[1];
      return {
        id: ap.id,
        name: ap.name,
        riverMile: ap.river_mile_downstream ? parseFloat(ap.river_mile_downstream) : null,
        type: ap.type,
        types: ap.types || [],
        amenities: ap.amenities || [],
        parkingInfo: ap.parking_info,
        roadAccess: ap.road_access,
        feeRequired: ap.fee_required,
        description: ap.description,
        coordinates: (lng && lat) ? { lat, lng } : null,
      };
    }),
  };
}

// ─── Tool 3: get_float_route ─────────────────────────────────────────────────

async function handleGetFloatRoute(input: Record<string, unknown>) {
  const riverSlug = normalizeSlug(input.river_slug as string);
  const startPointName = (input.start_point as string).toLowerCase().trim();
  const endPointName = (input.end_point as string).toLowerCase().trim();
  const supabase = createAdminClient();

  // Get river
  const { data: river } = await supabase
    .from('rivers')
    .select('id, name')
    .eq('slug', riverSlug)
    .single();

  if (!river) {
    return { error: `River not found: ${riverSlug}` };
  }

  // Get all access points to fuzzy-match names
  const { data: allAps } = await supabase
    .from('access_points')
    .select('id, name, river_mile_downstream, location_orig, location_snap, driving_lat, driving_lng, directions_override')
    .eq('river_id', river.id)
    .eq('approved', true)
    .order('river_mile_downstream', { ascending: true });

  if (!allAps || allAps.length === 0) {
    return { error: `No access points found for ${river.name}` };
  }

  // Fuzzy match: find best match for start and end
  const matchAp = (query: string) => {
    const q = query.toLowerCase();
    // Exact match first
    const exact = allAps.find(ap => ap.name.toLowerCase() === q);
    if (exact) return exact;
    // Contains match
    const contains = allAps.find(ap => ap.name.toLowerCase().includes(q) || q.includes(ap.name.toLowerCase()));
    if (contains) return contains;
    // Word overlap
    const queryWords = q.split(/\s+/);
    let best = allAps[0];
    let bestScore = 0;
    for (const ap of allAps) {
      const apWords = ap.name.toLowerCase().split(/\s+/);
      const score = queryWords.filter(w => apWords.some((aw: string) => aw.includes(w) || w.includes(aw))).length;
      if (score > bestScore) {
        bestScore = score;
        best = ap;
      }
    }
    return bestScore > 0 ? best : null;
  };

  const startAp = matchAp(startPointName);
  const endAp = matchAp(endPointName);

  if (!startAp || !endAp) {
    const names = allAps.map(ap => ap.name).join(', ');
    return { error: `Could not find matching access points. Available: ${names}` };
  }

  if (startAp.id === endAp.id) {
    return { error: `Start and end are the same access point: ${startAp.name}` };
  }

  // Get float segment via RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: segment, error: segError } = await (supabase.rpc as any)('get_float_segment', {
    p_start_access_id: startAp.id,
    p_end_access_id: endAp.id,
  });

  if (segError || !segment || segment.length === 0) {
    return { error: `Could not calculate segment between ${startAp.name} and ${endAp.name}` };
  }

  const segData = segment[0];
  const distanceMiles = segData.distance_miles != null ? parseFloat(segData.distance_miles) : 0;

  // Calculate float time using default canoe speeds
  const floatTime = calculateFloatTime(distanceMiles, {
    speedLowWater: 2.0,
    speedNormal: 2.5,
    speedHighWater: 3.5,
  }, 'optimal');

  const estimatedHours = floatTime
    ? { low: Math.round((floatTime.minutes * 0.8) / 6) / 10, high: Math.round((floatTime.minutes * 1.3) / 6) / 10 }
    : { low: distanceMiles / 3, high: distanceMiles / 1.5 };

  // Calculate shuttle drive time
  // Priority: directions_override (geocoded) > driving_lat/lng > location_snap > location_orig
  // Matches the float planner (/api/plan) coordinate resolution
  let shuttleDriveMinutes: number | null = null;
  try {
    const getCoords = async (ap: typeof startAp): Promise<[number, number] | null> => {
      if (ap.directions_override) {
        const geocoded = await geocodeAddress(ap.directions_override);
        if (geocoded) return geocoded;
      }
      if (ap.driving_lat && ap.driving_lng) {
        return [parseFloat(ap.driving_lng), parseFloat(ap.driving_lat)];
      }
      const coords = ap.location_snap?.coordinates || ap.location_orig?.coordinates;
      return coords ? [coords[0], coords[1]] : null;
    };

    const startCoords = await getCoords(startAp);
    const endCoords = await getCoords(endAp);

    if (startCoords && endCoords) {
      const drive = await getDriveTime(endCoords[0], endCoords[1], startCoords[0], startCoords[1]);
      shuttleDriveMinutes = drive.minutes;
    }
  } catch (e) {
    console.warn('[ChatTool] Shuttle drive time failed:', e);
  }

  // Get hazards along route
  const startMile = parseFloat(segData.start_river_mile || '0');
  const endMile = parseFloat(segData.end_river_mile || '999');
  const minMile = Math.min(startMile, endMile);
  const maxMile = Math.max(startMile, endMile);

  const { data: hazards } = await supabase
    .from('river_hazards')
    .select('name, type, severity, river_mile_downstream, description, portage_required')
    .eq('river_id', river.id)
    .eq('active', true)
    .gte('river_mile_downstream', minMile)
    .lte('river_mile_downstream', maxMile)
    .order('river_mile_downstream', { ascending: true });

  return {
    riverName: river.name,
    riverSlug,
    startPoint: startAp.name,
    endPoint: endAp.name,
    distanceMiles: Math.round(distanceMiles * 10) / 10,
    estimatedHours,
    shuttleDriveMinutes,
    planUrl: `/rivers/${riverSlug}?putIn=${startAp.id}&takeOut=${endAp.id}`,
    hazards: (hazards || []).map(h => ({
      name: h.name,
      type: h.type,
      severity: h.severity,
      riverMile: parseFloat(h.river_mile_downstream),
      description: h.description,
      portageRequired: h.portage_required,
    })),
  };
}

// ─── Tool 4: get_river_hazards ───────────────────────────────────────────────

async function handleGetRiverHazards(input: Record<string, unknown>) {
  const riverSlug = normalizeSlug(input.river_slug as string);
  const supabase = createAdminClient();

  const { data: river } = await supabase
    .from('rivers')
    .select('id, name')
    .eq('slug', riverSlug)
    .single();

  if (!river) {
    return { error: `River not found: ${riverSlug}` };
  }

  const { data: hazards } = await supabase
    .from('river_hazards')
    .select('name, type, severity, river_mile_downstream, description, portage_required, portage_side, seasonal_notes')
    .eq('river_id', river.id)
    .eq('active', true)
    .order('river_mile_downstream', { ascending: true });

  return {
    riverName: river.name,
    hazards: (hazards || []).map(h => ({
      name: h.name,
      type: h.type,
      severity: h.severity,
      riverMile: parseFloat(h.river_mile_downstream),
      description: h.description,
      portageRequired: h.portage_required,
      portageSide: h.portage_side,
      seasonalNotes: h.seasonal_notes,
    })),
  };
}

// ─── Tool 5: get_weather ─────────────────────────────────────────────────────

async function handleGetWeather(input: Record<string, unknown>) {
  const riverSlug = normalizeSlug(input.river_slug as string);

  const cityInfo = getCityForRiver(riverSlug);
  if (!cityInfo) {
    return { error: `No weather location configured for ${riverSlug}` };
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return { error: 'Weather service not configured' };
  }

  // Fetch weather, forecast, and alerts in parallel
  const [weather, forecast, allAlerts] = await Promise.all([
    fetchWeather(cityInfo.lat, cityInfo.lon, apiKey).catch(() => null),
    fetchForecast(cityInfo.lat, cityInfo.lon, apiKey).catch(() => null),
    fetchNWSAlerts().catch(() => []),
  ]);

  const alerts = filterAlertsForRiver(allAlerts, riverSlug);

  return {
    location: cityInfo.city,
    current: weather ? {
      temp: weather.temp,
      condition: weather.condition,
      windSpeed: weather.windSpeed,
      humidity: weather.humidity,
      rain1hInches: weather.rain1hInches,
      rain3hInches: weather.rain3hInches,
    } : null,
    forecast: forecast?.days?.slice(0, 4).map(day => ({
      dayOfWeek: day.dayOfWeek,
      tempHigh: day.tempHigh,
      tempLow: day.tempLow,
      condition: day.condition,
      precipitation: day.precipitation,
      windSpeed: day.windSpeed,
    })) || [],
    alerts: alerts.map(a => ({
      event: a.event,
      severity: a.severity,
      headline: a.headline,
      description: a.description?.slice(0, 500) || '',
    })),
  };
}

// ─── Tool 6: get_nearby_services ─────────────────────────────────────────────

async function handleGetNearbyServices(input: Record<string, unknown>) {
  const riverSlug = normalizeSlug(input.river_slug as string);
  const category = input.category as string | undefined;
  const supabase = createAdminClient();

  const { data: river } = await supabase
    .from('rivers')
    .select('id, name')
    .eq('slug', riverSlug)
    .single();

  if (!river) {
    return { error: `River not found: ${riverSlug}` };
  }

  // Query nearby_services via service_rivers join
  const query = supabase
    .from('service_rivers')
    .select(`
      is_primary,
      section_description,
      nearby_services (
        name, type, phone, website,
        description, services_offered, seasonal_notes,
        city, state, status
      )
    `)
    .eq('river_id', river.id);

  const { data: links } = await query;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let services = (links || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((link: any) => link.nearby_services !== null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((link: any) => {
      const s = link.nearby_services;
      return {
        name: s.name,
        type: s.type,
        phone: s.phone,
        website: s.website,
        servicesOffered: s.services_offered || [],
        description: s.description,
        seasonalNotes: s.seasonal_notes,
        city: s.city,
        state: s.state,
        status: s.status,
        sectionDescription: link.section_description,
      };
    });

  // Filter by category if provided
  if (category) {
    services = services.filter(s => {
      if (category === 'outfitter') return s.type === 'outfitter';
      if (category === 'camping') {
        return s.type === 'campground' || s.servicesOffered.some((o: string) =>
          o.includes('camping') || o === 'campground'
        );
      }
      if (category === 'lodging') {
        return s.type === 'cabin_lodge' || s.servicesOffered.some((o: string) =>
          o.includes('cabin') || o.includes('lodge')
        );
      }
      return true;
    });
  }

  // Also get NPS campgrounds linked to access points on this river
  const { data: npsCamps } = await supabase
    .from('access_points')
    .select('nps_campground_id, nps_campgrounds (name, total_sites, sites_tent_only, sites_electrical, reservation_url, fees)')
    .eq('river_id', river.id)
    .not('nps_campground_id', 'is', null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const npsCampgrounds = (npsCamps || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((ap: any) => ap.nps_campgrounds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((ap: any) => {
      const c = ap.nps_campgrounds;
      const fees = typeof c.fees === 'string' ? JSON.parse(c.fees) : c.fees || [];
      return {
        name: c.name,
        type: 'nps_campground',
        totalSites: c.total_sites,
        tentOnly: c.sites_tent_only,
        electric: c.sites_electrical,
        reservationUrl: c.reservation_url,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fees: fees.map((f: any) => `${f.title}: ${f.cost}`),
      };
    });

  // Deduplicate NPS campgrounds by name
  const seenNames = new Set<string>();
  const uniqueNps = npsCampgrounds.filter(c => {
    if (seenNames.has(c.name)) return false;
    seenNames.add(c.name);
    return true;
  });

  return {
    riverName: river.name,
    services,
    npsCampgrounds: (!category || category === 'camping') ? uniqueNps : [],
  };
}
