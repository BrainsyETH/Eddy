// src/lib/usgs/water-temperature.ts
// Targeted lookup of a station's latest water temperature — USGS parameter
// 00010 (temperature, water, °C), converted to °F for display.
//
// SCOPE EXPECTATION: absent almost everywhere. Of eight Ozark sites checked
// while speccing this, seven publish no 00010 series at all — including the
// Current at Van Buren and at Doniphan, Jacks Fork, Elk and Black. So null is
// the ordinary answer, the UI omits the row rather than rendering a
// placeholder, and nothing here retries hard to manufacture one. (USACE
// tailwater temperature on dam screens is a different pipeline and stays as
// it is.)
//
// The reading is served with its timestamp and stays visible regardless of
// age — water temperature moves slowly and an old measurement labelled with
// its age is still useful — which is why observedAt is part of the value, not
// a freshness gate here.

import {
  MODERN_BASE,
  modernHeaders,
  parseOgcValue,
  toMonitoringLocationId,
  type OgcFeature,
} from '@/lib/flow-providers/usgs';

export const PARAM_WATER_TEMP_C = '00010';

/**
 * Physical plausibility for a river in this product's coverage: below -5°C the
 * river is ice (and the sensor is lying), above 45°C the value is a sentinel
 * or a failure (-999999 is USGS's usual marker). Rejecting here means an
 * invalid value renders as "no water temperature", never as a number.
 */
const MIN_PLAUSIBLE_C = -5;
const MAX_PLAUSIBLE_C = 45;

export interface WaterTemperature {
  valueF: number;
  /** When the sensor read it — display it WITH this, always. */
  observedAt: string;
  source: 'usgs';
}

export function celsiusToFahrenheit(celsius: number): number {
  return Math.round(((celsius * 9) / 5 + 32) * 10) / 10;
}

/** Pure half, so the parsing and validation are testable without a network. */
export function parseWaterTemperature(features: OgcFeature[]): WaterTemperature | null {
  for (const feature of features) {
    const props = feature.properties;
    if (props?.parameter_code !== PARAM_WATER_TEMP_C) continue;
    if (!props.time) continue;
    const celsius = parseOgcValue(props.value);
    if (!Number.isFinite(celsius)) continue;
    if (celsius < MIN_PLAUSIBLE_C || celsius > MAX_PLAUSIBLE_C) continue;
    return { valueF: celsiusToFahrenheit(celsius), observedAt: props.time, source: 'usgs' };
  }
  return null;
}

/**
 * Latest 00010 value for one site, or null — for absence, for an implausible
 * value, and for any fetch failure. A missing water temperature must never
 * cost the gauge payload it rides on.
 */
export async function fetchWaterTemperature(siteId: string): Promise<WaterTemperature | null> {
  try {
    const url = new URL(`${MODERN_BASE}/latest-continuous/items`);
    url.searchParams.set('f', 'json');
    url.searchParams.set('monitoring_location_id', toMonitoringLocationId(siteId));
    url.searchParams.set('parameter_code', PARAM_WATER_TEMP_C);
    url.searchParams.set('limit', '10');

    const response = await fetch(url.toString(), {
      headers: modernHeaders(),
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { features?: OgcFeature[] };
    return parseWaterTemperature(data.features ?? []);
  } catch (error) {
    console.warn(`[WaterTemp] ${siteId}: fetch failed`, error);
    return null;
  }
}
