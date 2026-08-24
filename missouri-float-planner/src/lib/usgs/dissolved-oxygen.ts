// src/lib/usgs/dissolved-oxygen.ts
// Targeted lookup of a station's latest dissolved oxygen — USGS parameter
// 00300 (dissolved oxygen, water, unfiltered, mg/L).
//
// WHY THIS EXISTS AT ALL, GIVEN water-temperature.ts SAYS 00010 IS ABSENT
// ALMOST EVERYWHERE: the tailwaters are the exception, and they are the
// exception for both parameters at once. Of the six USGS sites below Bull
// Shoals, Norfork and Table Rock, every single one publishes 00010 AND 00300,
// and NONE publishes discharge or stage. They are water-quality monitors, so
// on a tailwater this is not a nice-to-have bolted onto a flow reading — for
// several miles below each dam it is most of what is measured.
//
// It matters because a hypolimnetic release is oxygen-poor by construction.
// Water drawn off the bottom of a stratified reservoir in late summer arrives
// cold and short of oxygen, and re-aerates as it runs. Measured 2026-08-24:
//
//   below Norfork Dam           3.2 mg/L
//   below Bull Shoals Dam       5.2 mg/L, and 7.3 mg/L a few miles down
//   below Table Rock Dam        5.1 mg/L, and 9.2 mg/L ten miles down
//
// NO VERDICT IS ATTACHED. There are published thresholds for what trout can
// tolerate, and this module deliberately does not encode them: the same
// argument docs/TAILWATER_PLAN.md makes about trend labels on regulated water
// ("the card shows a signed number, not a verdict") applies here, and a
// habitat threshold rendered as a badge would read as advice Eddy has not
// sourced. Serve the number, its unit and its timestamp; let the reader judge.

import {
  MODERN_BASE,
  modernHeaders,
  parseOgcValue,
  toMonitoringLocationId,
  type OgcFeature,
} from '@/lib/flow-providers/usgs';

export const PARAM_DISSOLVED_OXYGEN = '00300';

/**
 * Physical plausibility for surface water in mg/L. Below zero is impossible.
 * Above 20 is beyond what even cold, heavily supersaturated water below a
 * spillway reaches, so a larger number is a sentinel or a failed sensor
 * (-999999 is USGS's usual marker) rather than a reading.
 */
const MIN_PLAUSIBLE_MGL = 0;
const MAX_PLAUSIBLE_MGL = 20;

export interface DissolvedOxygen {
  valueMgL: number;
  /** When the sensor read it — display it WITH this, always. */
  observedAt: string;
  source: 'usgs';
}

/** Pure half, so the parsing and validation are testable without a network. */
export function parseDissolvedOxygen(features: OgcFeature[]): DissolvedOxygen | null {
  for (const feature of features) {
    const props = feature.properties;
    if (props?.parameter_code !== PARAM_DISSOLVED_OXYGEN) continue;
    if (!props.time) continue;
    const mgL = parseOgcValue(props.value);
    if (!Number.isFinite(mgL)) continue;
    if (mgL < MIN_PLAUSIBLE_MGL || mgL > MAX_PLAUSIBLE_MGL) continue;
    return {
      valueMgL: Math.round(mgL * 10) / 10,
      observedAt: props.time,
      source: 'usgs',
    };
  }
  return null;
}

/**
 * Latest 00300 value for one site, or null — for absence, for an implausible
 * value, and for any fetch failure. A missing reading must never cost the
 * gauge payload it rides on.
 */
export async function fetchDissolvedOxygen(siteId: string): Promise<DissolvedOxygen | null> {
  try {
    const url = new URL(`${MODERN_BASE}/latest-continuous/items`);
    url.searchParams.set('f', 'json');
    url.searchParams.set('monitoring_location_id', toMonitoringLocationId(siteId));
    url.searchParams.set('parameter_code', PARAM_DISSOLVED_OXYGEN);
    url.searchParams.set('limit', '10');

    const response = await fetch(url.toString(), {
      headers: modernHeaders(),
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { features?: OgcFeature[] };
    return parseDissolvedOxygen(data.features ?? []);
  } catch (error) {
    console.warn(`[DissolvedOxygen] ${siteId}: fetch failed`, error);
    return null;
  }
}
