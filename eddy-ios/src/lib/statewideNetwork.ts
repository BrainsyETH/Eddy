// eddy-ios/src/lib/statewideNetwork.ts
// Every curated river as one condition-coloured GeoJSON collection.
//
// WHY THIS EXISTS: the Map tab used to draw a single river — whichever one was
// selected — so the one question the map is best placed to answer, "where can I
// float today?", was the one it could not answer at all. You had to already
// know which river you wanted before the map would show you anything about it.
// The website answers it by drawing the whole network coloured by condition and
// letting you filter it; this is that, on the phone.
//
// ── This does NOT violate the one-river-at-a-time rule ──────────────────────
// api/client.ts says of /api/rivers/{slug} that it is "the heaviest response
// the app fetches" and must not be fanned out across every river. Still true,
// and still obeyed: that endpoint serves the FULL-RESOLUTION centreline used to
// snap a float route, and the selected river still loads it alone. What this
// module fetches is a different, coarser thing — the statewide dataset the
// website's own map runs on, all 24 rivers in ~260 KB behind a CDN — and it is
// context, not routing geometry. Two payloads, two jobs.
//
// ── Grading happens on the phone, from the same ladder the server uses ──────
// The readings endpoint returns numbers, not verdicts, so the app grades them —
// exactly as it already does for gauge pins in src/lib/gaugeCondition.ts, and
// through the same `classifyReading` out of @eddy/conditions that /api/plan and
// the website's statewide map both call. `strictUnit: true` matters: a cfs-rated
// river with no discharge reading must come back 'unknown' rather than have its
// stage in feet compared against cfs thresholds.

import type { Feature, FeatureCollection, LineString } from 'geojson';
import { classifyReading, hasLadder } from '@eddy/conditions/condition-ladder';
import type { ConditionCode } from '@eddy/conditions';
import { conditionColor } from '@/theme/conditions';

/** A river as the statewide dataset ships it. Only the fields we use. */
export interface StatewideRiver {
  id: string;
  slug: string;
  name: string;
  region: string | null;
  geometry: LineString | null;
  gauges: StatewideRiverGauge[] | null;
}

/** A gauge's editorial ladder, as carried on the river that rates it. */
export interface StatewideRiverGauge {
  site_id: string;
  is_primary: boolean;
  threshold_unit: 'ft' | 'cfs' | null;
  level_too_low: number | null;
  level_low: number | null;
  level_optimal_min: number | null;
  level_optimal_max: number | null;
  level_high: number | null;
  level_dangerous: number | null;
  flood_stage_ft: number | null;
}

/** A live reading, keyed by site and river (one gauge can rate two rivers). */
export interface StatewideReading {
  site_no: string;
  river_id: string;
  is_primary: boolean;
  dischargeCfs: number | null;
  gaugeHeightFt: number | null;
}

export interface NetworkFeatureProps {
  slug: string;
  name: string;
  code: ConditionCode;
  /** Resolved paint colour, so the layer can read it straight off the feature. */
  color: string;
}

export type NetworkCollection = FeatureCollection<LineString, NetworkFeatureProps>;

/**
 * Reading lookup key.
 *
 * River + site FIRST, because a single physical gauge can be the primary for
 * more than one river, each with its own editorial thresholds, and keying by
 * site alone would let those rivers overwrite each other. The website's
 * mo-statewide-data.ts keys it the same way for the same reason.
 */
function readingKey(riverId: string, siteId: string): string {
  return `${riverId}::${siteId}`;
}

/** Grade one river off its primary gauge. Anything unrated reads 'unknown'. */
export function gradeRiver(
  river: StatewideRiver,
  readings: Map<string, StatewideReading>,
): ConditionCode {
  const gauge = river.gauges?.find((g) => g.is_primary) ?? river.gauges?.[0];
  if (!gauge) return 'unknown';

  const unit = gauge.threshold_unit ?? 'ft';
  const thresholds = {
    levelTooLow: gauge.level_too_low,
    levelLow: gauge.level_low,
    levelOptimalMin: gauge.level_optimal_min,
    levelOptimalMax: gauge.level_optimal_max,
    levelHigh: gauge.level_high,
    levelDangerous: gauge.level_dangerous,
    thresholdUnit: unit,
    floodStageFt: gauge.flood_stage_ft,
  };
  // No ladder means no opinion. Colouring an unrated river green because its
  // gauge happens to read a number would be worse than leaving it grey.
  if (!hasLadder(thresholds)) return 'unknown';

  // ...but fall back to the site alone when the readings payload carries no row
  // for this river. It happens: Courtois Creek's primary gauge IS Huzzah
  // Creek's (USGS 07014000), and the statewide readings emit that site only
  // under Huzzah, which left Courtois grey on the map while every other surface
  // called it floatable.
  //
  // Borrowing the reading is safe in a way that borrowing a VERDICT would not
  // be: the ladder above is still Courtois's own, out of its own row, so the
  // number is graded against Courtois's thresholds. Same gauge, same water, same
  // instant — only the river's opinion of it differs, and we keep that.
  const reading =
    readings.get(readingKey(river.id, gauge.site_id)) ?? readings.get(gauge.site_id);
  if (!reading) return 'unknown';

  return classifyReading(
    reading.gaugeHeightFt,
    thresholds,
    reading.dischargeCfs,
    { strictUnit: true },
  );
}

/**
 * Build the drawable collection: one condition-coded LineString per river.
 *
 * Rivers with no geometry are dropped rather than emitted empty — an empty
 * LineString is a feature the map has to skip on every repaint for nothing.
 */
export function buildNetwork(
  rivers: StatewideRiver[],
  readings: StatewideReading[],
): NetworkCollection {
  const byKey = new Map<string, StatewideReading>();
  for (const r of readings) {
    byKey.set(readingKey(r.river_id, r.site_no), r);
    // Site-only fallback entry. `is_primary` wins so that when one physical
    // gauge appears under several rivers, the reading kept under the bare site
    // key is the one its own river treats as authoritative.
    const existing = byKey.get(r.site_no);
    if (!existing || (r.is_primary && !existing.is_primary)) byKey.set(r.site_no, r);
  }

  const features: Feature<LineString, NetworkFeatureProps>[] = [];
  for (const river of rivers) {
    if (!river.geometry?.coordinates?.length) continue;
    const code = gradeRiver(river, byKey);
    features.push({
      type: 'Feature',
      id: river.slug,
      geometry: river.geometry,
      properties: {
        slug: river.slug,
        name: river.name,
        code,
        // Resolved here rather than in the layer so the paint expression stays
        // a plain ['get','color'] and no condition hex is ever written into a
        // StyleSheet — see the colour rule in README.md.
        color: conditionColor(code),
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/** Bounding box [west, south, east, north] over the whole network. */
export function networkBounds(collection: NetworkCollection): [number, number, number, number] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const f of collection.features) {
    for (const [lng, lat] of f.geometry.coordinates) {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }

  return Number.isFinite(west) ? [west, south, east, north] : null;
}
