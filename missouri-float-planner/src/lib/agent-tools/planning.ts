import { estimateRoute, RouteEstimateError } from '@/lib/calculations/route-estimate';
import { fetchGaugeReadings, fetchDailyStatistics } from '@/lib/usgs/gauges';
import { getDriveTime } from '@/lib/mapbox/directions';
import { assessShuttlePlausibility } from '@/lib/shuttle-plausibility';
import { getConditionShortLabel } from '@/lib/conditions';
import { AgentError, BASE_URL, freshness, tripDate, memoizeAsync, type Status } from './contracts';
import { accessView, checked, numeric, station, gaugeSource, type DataContext, type Access } from './data';
import type { Sources } from './sources';

export interface PlanInput { river?: string; riverId?: string; putIn?: string; takeOut?: string; startAccessPointId?: string; endAccessPointId?: string; vesselType?: string; date?: string }
export const MAX_ESTIMATES = 6;
export function shortlist(points: Access[], targetHours: number, speedMph: number, publicOnly: boolean) {
  const eligible = points.filter(p => p.approved && p.is_float_endpoint && (!publicOnly || p.is_public === true) && numeric(p.river_mile_downstream) != null).sort((a, b) => Number(a.river_mile_downstream) - Number(b.river_mile_downstream));
  const pairs: Array<{ putIn: Access; takeOut: Access; difference: number }> = [];
  // Keep memory and detailed work bounded even on larger catalogs.
  for (let i = 0; i < eligible.length; i++) for (let j = i + 1; j < eligible.length; j++) {
    const miles = Number(eligible[j].river_mile_downstream) - Number(eligible[i].river_mile_downstream);
    if (miles <= 0) continue;
    const difference = Math.abs(miles / speedMph - targetHours);
    pairs.push({ putIn: eligible[i], takeOut: eligible[j], difference });
    pairs.sort((a, b) => a.difference - b.difference || a.putIn.id.localeCompare(b.putIn.id) || a.takeOut.id.localeCompare(b.takeOut.id));
    if (pairs.length > MAX_ESTIMATES) pairs.pop();
  }
  return pairs;
}

export function createPlanning(ctx: DataContext, sources: Sources, providers = { fetchGaugeReadings, fetchDailyStatistics }) {
  const daily = memoizeAsync((id: string) => providers.fetchDailyStatistics(id));
  const live = memoizeAsync((key: string) => providers.fetchGaugeReadings(JSON.parse(key) as string[]));
  const estimateProviders = { fetchDailyStatistics: daily, fetchGaugeReadings: (ids: string[]) => live(JSON.stringify([...ids].sort())) };
  const vessels = memoizeAsync(async (slug: string) => {
    const row = checked(await ctx.db.from('vessel_types').select('id, slug, speed_normal').eq('slug', slug).maybeSingle(), 'vessel type');
    if (!row) throw new AgentError('This vessel type is not available.');
    return row;
  });
  async function resolve(input: PlanInput) {
    const ref = input.river ?? input.riverId;
    if (!ref) throw new AgentError('Provide river (slug or UUID), or riverId.');
    const river = await ctx.river(ref);
    if (input.riverId && input.riverId !== river.id) throw new AgentError('river and riverId disagree.');
    const putRef = input.putIn ?? input.startAccessPointId, takeRef = input.takeOut ?? input.endAccessPointId;
    if (!putRef || !takeRef) throw new AgentError('Provide both putIn and takeOut slugs or UUIDs. Use get_access_points to discover them.');
    const [putIn, takeOut] = await Promise.all([ctx.point(river, putRef, true), ctx.point(river, takeRef, true)]);
    if ((input.startAccessPointId && putIn.id !== input.startAccessPointId) || (input.endAccessPointId && takeOut.id !== input.endAccessPointId)) throw new AgentError('The legacy endpoint IDs disagree with putIn/takeOut.');
    if (putIn.id === takeOut.id) throw new AgentError('A float needs two different access points.');
    const start = numeric(putIn.river_mile_downstream), end = numeric(takeOut.river_mile_downstream);
    if (start == null || end == null) throw new AgentError('Verified endpoint river miles are unavailable.', 'unavailable');
    if (end <= start) throw new AgentError('The take-out must be downstream of the put-in. Reverse the endpoints.');
    return { river, putIn, takeOut };
  }
  async function calculate(input: PlanInput) {
    const { river, putIn, takeOut } = await resolve(input);
    const requested = tripDate(input.date, river.timezone || 'America/Chicago', ctx.now);
    const vessel = await vessels(input.vesselType ?? 'canoe');
    let estimate;
    try { estimate = await estimateRoute(ctx.db, { riverId: river.id, startId: putIn.id, endId: takeOut.id, vesselTypeId: vessel.id }, estimateProviders); }
    catch (error) {
      if (error instanceof RouteEstimateError) throw new AgentError(error.status < 500 ? error.message : 'Route calculation failed. Please retry.', error.status < 500 ? 'invalid_request' : 'lookup_failed');
      throw error;
    }
    const anchor = estimate.anchorCondition;
    const age = freshness(anchor?.reading_timestamp as string | null, ctx.now);
    const gaugeLinks = await ctx.gauges(river.id);
    const anchorLink = gaugeLinks.find(g => station(g)?.usgs_site_id === anchor?.gauge_usgs_id) ?? null;
    const spanLinks = gaugeLinks.filter(g => station(g)?.active && numeric(g.river_mile) != null && Number(g.river_mile) >= Number(putIn.river_mile_downstream) && Number(g.river_mile) <= Number(takeOut.river_mile_downstream));
    const relevantLinks = [...new Map([...(anchorLink ? [anchorLink] : []), ...spanLinks].map(g => [g.gauge_station_id, g])).values()];
    const warnings = [...estimate.spanWarnings];
    if (estimate.withholdReason === 'regulated') warnings.push('No float time is supplied for this dam-controlled river: releases can change during the trip.');
    if (anchor?.accuracy_warning) warnings.push(String(anchor.accuracy_warning_reason || 'Gauge reading may be inaccurate.'));
    if (age.stale !== false) warnings.push('The anchor reading is stale, missing, or undated; current floatability is unknown.');
    if (!estimate.spanCheckComplete) warnings.push('Some gauges along this route could not be checked.');
    for (const ap of [putIn, takeOut]) {
      if (!(ap.types?.length ? ap.types : [ap.type]).some(t => t === 'access' || t === 'boat_ramp')) warnings.push(`${ap.name} may not have direct road access.`);
      if (ap.is_public !== true) warnings.push(`${ap.name} is not recorded as public access; confirm permission and any outfitter restrictions.`);
    }
    const usable = age.stale === false && !anchor?.accuracy_warning && estimate.spanCheckComplete;
    const conditionCode = usable ? estimate.conditionCode : 'unknown';
    if (conditionCode === 'dangerous') warnings.push('Dangerous water conditions: do not float.');
    if (conditionCode === 'high') warnings.push('High water conditions; do not treat this as a routine recreational recommendation.');
    const hazardRows = await ctx.hazards(river.id);
    if (hazardRows.length > 500) throw new AgentError('Hazard coverage exceeds this tool’s supported size.', 'unavailable');
    const hazards = hazardRows.filter(h => numeric(h.river_mile_downstream) != null && Number(h.river_mile_downstream) >= Number(putIn.river_mile_downstream) && Number(h.river_mile_downstream) <= Number(takeOut.river_mile_downstream));
    const unlocatedHazards = hazardRows.filter(h => numeric(h.river_mile_downstream) == null);
    if (unlocatedHazards.length) warnings.push('Some recorded river hazards have no river mile and cannot be excluded from this route.');
    const [alerts, outlooks] = await Promise.all([sources.alerts(river), Promise.all((relevantLinks.length ? relevantLinks : [null]).map(g => sources.outlook(river, g, requested.date)))]);
    const criticalHazards = [...hazards, ...unlocatedHazards].some(h => ['high', 'severe', 'dangerous', 'extreme'].includes(h.severity ?? '') || h.portage_required);
    const forecastCodes = outlooks.flatMap(o => o.days.map(d => d.conditionCode));
    const forecastComplete = !!anchorLink && outlooks.every(o => o.status === 'ok' && o.days.length > 0);
    const forecastUnsuitable = forecastCodes.some(c => c === 'high' || c === 'dangerous' || c === 'too_low');
    const blocked = !usable || !estimate.floatTime || estimate.contributingGauges.some(g => g.conditionCode === 'too_low') || !['good', 'flowing', 'low'].includes(conditionCode) || criticalHazards || !alerts.checkedAllApplicable || alerts.critical || (requested.future && forecastUnsuitable);
    const recommendationStatus = blocked ? 'not_recommended' : requested.future && !forecastComplete ? 'conditional' : 'candidate';
    if (requested.future) warnings.push('The duration uses current conditions, not predicted conditions on the requested date.');
    if (requested.future && !forecastComplete) warnings.push('A complete rated river forecast is unavailable for this route/date; this option is conditional on rechecking conditions.');
    const url = `${BASE_URL}/plan?${new URLSearchParams({ river: river.slug, putIn: putIn.id, takeOut: takeOut.id, vessel: vessel.id })}`;
    const floatTime = usable ? estimate.floatTime : null;
    return {
      river, putIn, takeOut,
      data: {
        url, requestedDate: requested.date, timeZone: river.timezone || 'America/Chicago', vesselType: vessel.slug,
        putIn: accessView(putIn, river), takeOut: accessView(takeOut, river), distanceMiles: Math.round(estimate.distanceMiles * 10) / 10,
        estimatedFloatTime: floatTime, estimateBasis: 'current_conditions', estimatedAt: estimate.estimatedAt,
        floatTimeWithheldReason: usable ? estimate.withholdReason : 'Current gauge coverage is incomplete or stale.',
        anchorGauge: { id: anchorLink?.gauge_station_id ?? null, name: anchor?.gauge_name ?? (anchorLink ? station(anchorLink)?.name : null) ?? null, usgsSiteId: anchor?.gauge_usgs_id ?? null, gaugeHeightFt: numeric(anchor?.gauge_height_ft), dischargeCfs: numeric(anchor?.discharge_cfs), conditionCode: age.stale === false && !anchor?.accuracy_warning ? anchor?.condition_code ?? 'unknown' : 'unknown', ...age, provider: anchorLink ? station(anchorLink)?.provider ?? 'usgs' : null, source: gaugeSource(anchorLink) },
        gaugeSelectionReason: 'Shared route estimator selects a gauge for the put-in; additional gauges inside the route can change the route assessment.',
        routeAssessment: { conditionCode, label: getConditionShortLabel(conditionCode), spanCheckComplete: estimate.spanCheckComplete, contributingGauges: estimate.contributingGauges.map(g => ({ ...g, ...freshness(g.observedAt, ctx.now), source: gaugeSource(gaugeLinks.find(link => station(link)?.usgs_site_id === g.usgsSiteId) ?? null) })), recommendationStatus },
        hazards: { status: hazards.length || unlocatedHazards.length ? 'ok' : 'none_recorded', items: hazards, unlocated: unlocatedHazards, source: 'Eddy recorded hazards', note: 'Recorded hazards are not exhaustive.' }, alerts, outlooks,
        planLinkNote: 'The planner opens these endpoints and vessel using current conditions; the future date is not carried into the planner.',
      }, warnings,
      status: (!usable || !alerts.checkedAllApplicable || (requested.future && !forecastComplete) ? 'partial' : 'ok') as Status,
    };
  }
  async function drive(input: PlanInput) {
    const { river, putIn, takeOut } = await resolve(input);
    // Do not route from snapped mid-river pins. No cache writes or paid lookup
    // until both endpoints have explicit driving coordinates.
    const coords = (ap: Access) => numeric(ap.driving_lng) != null && numeric(ap.driving_lat) != null ? [Number(ap.driving_lng), Number(ap.driving_lat)] as const : null;
    const from = coords(takeOut), to = coords(putIn);
    if (!from || !to) return { status: 'unavailable' as Status, reason: 'Verified driving coordinates are missing for an endpoint.', available: false };
    const route = await getDriveTime(from[0], from[1], to[0], to[1]);
    const check = assessShuttlePlausibility(route.miles, Number(takeOut.river_mile_downstream) - Number(putIn.river_mile_downstream));
    if (check.anomaly) return { status: 'unavailable' as Status, available: false, reason: 'Road routing was implausible; the estimate is withheld.' };
    return { status: 'ok' as Status, available: true, river: river.slug, from: takeOut.name, to: putIn.name, minutes: route.minutes, miles: route.miles, routeSummary: route.routeSummary, source: 'Mapbox Directions', note: 'Driving estimate only; no shuttle service or availability has been confirmed.' };
  }
  return { resolve, calculate, drive, vessels };
}
export type Planning = ReturnType<typeof createPlanning>;
