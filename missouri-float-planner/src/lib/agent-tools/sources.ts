import { fetchNWSAlerts } from '@/lib/nws/alerts';
import { fetchNPSAlerts } from '@/lib/nps/client';
import { matchWeatherAlerts, npsSeverity } from '@/lib/alerts/river-alerts';
import { fetchNwsForecast } from '@/lib/nws/forecast';
import { fetchWeather, fetchForecast } from '@/lib/weather/openweather';
import { getCoordinates } from '@/lib/api-utils';
import { groupForecastByDay } from '@/lib/river-outlook';
import type { ConditionThresholds } from '@/lib/conditions';
import { applyFloodStageOverride } from '@/lib/conditions';
import type { RiverAlert } from '@/types/api';
import { freshness, localDate, memoizeAsync, type Status } from './contracts';
import { station, numeric, type DataContext, type River, type Access, type GaugeLink } from './data';

export const sourceProviders = { fetchNWSAlerts, fetchNPSAlerts, fetchNwsForecast, fetchWeather, fetchForecast };
export type SourceProviders = typeof sourceProviders;
export function createSources(ctx: DataContext, providers = sourceProviders) {
  // One request/candidate search shares upstream responses, including failures.
  const nws = memoizeAsync((state: string) => providers.fetchNWSAlerts(state, { strict: true }));
  const nps = memoizeAsync((park: string) => providers.fetchNPSAlerts(park, { strict: true }));
  const forecasts = memoizeAsync((lid: string) => providers.fetchNwsForecast(lid, { strict: true }));
  const weatherAt = memoizeAsync(async (key: string) => {
    const [lat, lon] = key.split(',').map(Number);
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) return { status: 'unavailable' as Status, current: null, days: [], reason: 'Weather service is not configured.' };
    const [current, forecast] = await Promise.allSettled([providers.fetchWeather(lat, lon, apiKey), providers.fetchForecast(lat, lon, apiKey)]);
    return {
      status: (current.status === 'fulfilled' && forecast.status === 'fulfilled' ? 'ok' : current.status === 'rejected' && forecast.status === 'rejected' ? 'lookup_failed' : 'partial') as Status,
      current: current.status === 'fulfilled' ? current.value : null,
      days: forecast.status === 'fulfilled' ? forecast.value.days : [],
      reason: current.status === 'rejected' || forecast.status === 'rejected' ? 'Some weather data could not be retrieved.' : null,
    };
  });
  async function weather(river: River, ap?: Access) {
    const point = ap ? getCoordinates(ap.location_orig) ?? getCoordinates(ap.location_snap) : river.weather_lat != null && river.weather_lon != null ? { lat: Number(river.weather_lat), lng: Number(river.weather_lon) } : null;
    if (!point) return { status: 'unavailable' as Status, source: 'OpenWeather', location: null, current: null, days: [], reason: 'No verified weather reference coordinates.' };
    return { ...await weatherAt(`${point.lat},${point.lng}`), source: 'https://openweathermap.org/', retrievedAt: new Date(ctx.now).toISOString(), location: { name: ap?.name ?? river.weather_city ?? river.name, ...point, basis: ap ? 'put_in' : 'river_weather_reference' }, units: { temperature: 'F', wind: 'mph', precipitationProbability: 'percent' }, note: 'Retrieval time is not a provider observation or forecast issue time. Weather does not predict river flow.' };
  }
  async function alerts(river: River) {
    const sourceStates: Array<{ source: string; status: Status; url: string; reason?: string }> = [];
    const alerts: RiverAlert[] = [];
    await Promise.all([
      (async () => {
        if (!river.state || !river.alert_search_terms?.length) {
          sourceStates.push({ source: 'NWS', status: 'unavailable', url: 'https://www.weather.gov/', reason: 'River alert matching is not configured.' }); return;
        }
        try {
          const matched = matchWeatherAlerts([{ slug: river.slug, name: river.name, state: river.state, alertSearchTerms: river.alert_search_terms }], new Map([[river.state, await nws(river.state)]]));
          alerts.push(...matched.filter(a => !a.endsAt || Date.parse(a.endsAt) > ctx.now));
          sourceStates.push({ source: 'NWS', status: 'ok', url: 'https://www.weather.gov/' });
        } catch { sourceStates.push({ source: 'NWS', status: 'lookup_failed', url: 'https://www.weather.gov/' }); }
      })(),
      (async () => {
        if (!river.park_code) {
          sourceStates.push({ source: 'NPS', status: 'unavailable', url: 'https://www.nps.gov/', reason: 'This river has no linked NPS park; local closures are not covered by this feed.' }); return;
        }
        const url = `https://www.nps.gov/${river.park_code}/planyourvisit/conditions.htm`;
        try {
          const rows = await nps(river.park_code);
          alerts.push(...rows.map(a => ({ id: `nps:${river.slug}:${a.id}`, source: 'nps' as const, severity: npsSeverity(a.category), riverSlug: river.slug, riverName: river.name, title: a.title, body: a.description ?? '', category: a.category, startsAt: null, endsAt: null, url: a.url || url })));
          sourceStates.push({ source: 'NPS', status: rows.length >= 50 ? 'partial' : 'ok', url, ...(rows.length >= 50 ? { reason: 'The source page may be truncated; check the park’s official notices.' } : {}) });
        } catch { sourceStates.push({ source: 'NPS', status: 'lookup_failed', url }); }
      })(),
    ]);
    sourceStates.sort((a, b) => a.source.localeCompare(b.source));
    const checkedAllApplicable = sourceStates.every(s => s.status === 'ok' || (s.source === 'NPS' && !river.park_code));
    const critical = alerts.some(a => /\bclosure\b/i.test(a.category) || a.severity === 'warning');
    return { status: (checkedAllApplicable ? alerts.length ? 'ok' : 'none_recorded' : alerts.length ? 'partial' : 'lookup_failed') as Status, alerts, sources: sourceStates, checkedAt: new Date(ctx.now).toISOString(), checkedAllApplicable, critical, scope: 'River-name/county weather matches and park-wide notices; relevance to an individual launch may require confirmation.', note: 'These feeds do not cover every managing agency or closure. An empty result is not an all-clear.' };
  }
  async function outlook(river: River, link: GaugeLink | null, requestedDate?: string) {
    const gauge = link && station(link);
    const today = localDate(ctx.now, river.timezone || 'America/Chicago');
    const dates = Array.from({ length: 3 }, (_, i) => new Date(Date.parse(`${today}T12:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
    const base = { source: 'https://water.noaa.gov/', gauge: gauge ? { id: gauge.id, name: gauge.name, usgsSiteId: gauge.usgs_site_id } : null, requestedDate: requestedDate ?? null, supportedDates: dates, aggregation: 'maximum forecast stage in each local calendar day', timeZone: river.timezone || 'America/Chicago', retrievedAt: new Date(ctx.now).toISOString() };
    if (requestedDate && !dates.includes(requestedDate)) return { ...base, status: 'unavailable' as Status, days: [], issuedAt: null, reason: 'Requested date is outside the three-day outlook window.' };
    if (!gauge?.nws_lid || !link) return { ...base, status: 'unavailable' as Status, days: [], issuedAt: null, reason: 'No official forecast station is linked to this gauge.' };
    try {
      const forecast = await forecasts(gauge.nws_lid);
      const age = freshness(forecast.issuedAt, ctx.now, 24);
      // Forecast stage must be graded against FOOT thresholds, even when live
      // conditions primarily use discharge. Never compare feet with cfs.
      const prefix = link.threshold_unit === 'cfs' ? 'alt_' : '';
      const values = link as unknown as Record<string, unknown>;
      const thresholds: ConditionThresholds = {
        thresholdUnit: 'ft', levelTooLow: numeric(values[`${prefix}level_too_low`]), levelLow: numeric(values[`${prefix}level_low`]), levelOptimalMin: numeric(values[`${prefix}level_optimal_min`]), levelOptimalMax: numeric(values[`${prefix}level_optimal_max`]), levelHigh: numeric(values[`${prefix}level_high`]), levelDangerous: numeric(values[`${prefix}level_dangerous`]),
      };
      const stages = forecast.points.flatMap(p => p.gaugeHeightFt == null ? [] : [{ dateTime: p.timestamp, valueFt: p.gaugeHeightFt }]);
      const days = groupForecastByDay(stages, dates, thresholds.levelOptimalMin == null ? null : thresholds, base.timeZone).map(day => ({ ...day, conditionCode: age.stale === false && day.conditionCode ? applyFloodStageOverride(day.conditionCode, day.valueFt, numeric(link.flood_stage_ft)) : null }));
      const relevant = requestedDate ? days.filter(d => d.date === requestedDate) : days;
      return { ...base, source: `https://water.noaa.gov/gauges/${encodeURIComponent(gauge.nws_lid)}`, status: (relevant.length && relevant.every(d => d.conditionCode != null) ? 'ok' : relevant.some(d => d.conditionCode != null) ? 'partial' : 'unavailable') as Status, days: relevant, issuedAt: forecast.issuedAt, ageMinutes: age.ageMinutes, stale: age.stale, reason: age.stale !== false ? 'Forecast is missing, stale, or has no issue time.' : !stages.length ? 'No active stage forecast.' : thresholds.levelOptimalMin == null ? 'No compatible stage thresholds; forecast stages cannot be rated.' : relevant.every(d => d.conditionCode == null) ? 'No rated forecast for this date.' : null };
    } catch { return { ...base, status: 'lookup_failed' as Status, days: [], issuedAt: null, reason: 'Official forecast lookup failed.' }; }
  }
  return { weather, alerts: memoizeAsync((r: River) => alerts(r)), outlook };
}
export type Sources = ReturnType<typeof createSources>;
