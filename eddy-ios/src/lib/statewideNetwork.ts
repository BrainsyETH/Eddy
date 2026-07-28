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

import { classifyReading, hasLadder } from '@eddy/conditions/condition-ladder';
import type { ConditionCode } from '@eddy/conditions';
import { conditionColor } from '@/theme/conditions';

// GeoJSON shapes declared here rather than imported from `geojson`. That
// package is present only TRANSITIVELY (via @types/geojson, pulled in by a
// dependency of a dependency), so importing it works today and disappears
// without warning the next time the lockfile is refreshed. Three interfaces is
// a cheaper price than a build that breaks for a reason nobody can see.
interface LineString {
  type: 'LineString';
  coordinates: number[][];
}

interface Feature<P> {
  type: 'Feature';
  id?: string;
  geometry: LineString;
  properties: P;
}

export interface FeatureCollection<P> {
  type: 'FeatureCollection';
  features: Feature<P>[];
}

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
  /**
   * Display position — snapped onto the river's own line when the USGS site is
   * within 500 m of it, else the raw site. Already on the wire; this type simply
   * never declared it. It is what lets a reach be painted by the gauge that
   * actually watches it.
   */
  lon: number;
  lat: number;
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
  /**
   * The RIVER's verdict, from its primary gauge — not this piece's.
   *
   * Load-bearing that it is the whole river's: this is what the condition chips
   * filter on and what the rivers list shows, and a filter that hid two thirds
   * of a river because a middle gauge disagreed with its primary would read as
   * a rendering bug.
   */
  code: ConditionCode;
  /**
   * Paint colour for THIS PIECE of the river, which on a multi-gauge river is
   * not `conditionColor(code)`. See buildNetwork.
   */
  color: string;
}

export type NetworkCollection = FeatureCollection<NetworkFeatureProps>;

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
  return gradeGauge(river, gauge, readings);
}

/**
 * Grade ONE gauge against the ladder the given river rates it with.
 *
 * Per river, not per site, because a single physical gauge can be primary for
 * two rivers with different editorial thresholds — 07014000 rates both Huzzah
 * and Courtois — and the same number is a different verdict on each.
 */
export function gradeGauge(
  river: StatewideRiver,
  gauge: StatewideRiverGauge,
  readings: Map<string, StatewideReading>,
): ConditionCode {
  // A DECLARED unit or nothing. Defaulting to feet and then grading with
  // strictUnit would compare a stage against whatever ladder the row carries —
  // which is exactly the cross-unit substitution primaryReading() exists to
  // refuse. No live row hits this today; it is a guard, not a fix.
  const unit = gauge.threshold_unit;
  if (!unit) return 'unknown';

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

// ── Painting a river by its gauges ──────────────────────────────────────────
//
// A river used to be ONE colour, taken from its primary gauge. On the Current
// River that means one reading at Van Buren deciding the colour of a hundred
// miles of water that four other gauges are also watching — and when the upper
// river is bony while the lower is running, the map says one thing and is wrong
// about most of its own length.
//
// The website's /river-map answers this with an SVG <linearGradient> per river,
// stops placed at each gauge's position along the line. Mapbox GL has an
// equivalent in `line-gradient`, but it cannot be data-driven: one expression
// serves a whole layer, so 24 rivers would need 24 layers. So the gradient is
// baked into the GEOMETRY instead — the line is cut into runs, each carrying
// its own colour — which keeps a single data-driven layer and, unlike the web's
// straight-line gradient axis, follows the river even where it doubles back.

/** How much of each gauge-to-gauge gap is spent fading. Matches the website. */
const BLEND_FRACTION = 0.4;

/**
 * Colour levels a blend is quantised to.
 *
 * The mix is continuous, but adjacent vertices resolving to the SAME colour is
 * what lets them coalesce into one feature instead of one per vertex. 12 is
 * past the point the steps are visible at map zoom and still leaves the long
 * held spans as single runs.
 */
const BLEND_STEPS = 12;

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === R ? ((G - B) / d + (G < B ? 6 : 0))
      : max === G ? (B - R) / d + 2
        : (R - G) / d + 4;
  return [h / 6, s, l];
}

function hslToHex([h, s, l]: [number, number, number]): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Blend two condition colours THROUGH HUE rather than through RGB.
 *
 * Straight RGB between the green of Flowing and the red of Dangerous passes
 * through a dead brown; hue passes through amber, which is the colour the
 * intermediate condition would actually be. Shortest way round the wheel, so
 * green→red does not detour through blue.
 */
function mixColor(a: string, b: string, t: number): string {
  const [h1, s1, l1] = rgbToHsl(hexToRgb(a));
  const [h2, s2, l2] = rgbToHsl(hexToRgb(b));
  let dh = h2 - h1;
  if (dh > 0.5) dh -= 1;
  if (dh < -0.5) dh += 1;
  return hslToHex([(h1 + dh * t + 1) % 1, s1 + (s2 - s1) * t, l1 + (l2 - l1) * t]);
}

interface ColorStop {
  /** Where along the line, 0 at the first vertex and 1 at the last. */
  at: number;
  color: string;
}

/**
 * The colour at position `u`, holding each gauge's colour across its reach and
 * fading only across a band around the midpoint between two.
 *
 * A straight interpolation between stops would let a single flooded gauge tint
 * half the river; holding, then fading late, keeps most of each reach reading
 * true and confines the intermediate hue to a sliver.
 */
function colorAt(stops: ColorStop[], u: number): string {
  if (stops.length === 1) return stops[0].color;
  if (u <= stops[0].at) return stops[0].color;
  const last = stops[stops.length - 1];
  if (u >= last.at) return last.color;

  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const cur = stops[i];
    if (u > cur.at) continue;
    if (prev.color === cur.color) return prev.color;

    const mid = (prev.at + cur.at) / 2;
    const half = (BLEND_FRACTION * (cur.at - prev.at)) / 2;
    if (u <= mid - half) return prev.color;
    if (u >= mid + half) return cur.color;

    const t = (u - (mid - half)) / (2 * half);
    // Smoothstep, so the colour is barely moving where the band meets the held
    // spans and there is no visible kink at either edge.
    const eased = t * t * (3 - 2 * t);
    return mixColor(prev.color, cur.color, Math.round(eased * BLEND_STEPS) / BLEND_STEPS);
  }
  return last.color;
}

/** Cumulative position of each vertex along the line, normalised to 0..1. */
function progressAlong(coords: number[][]): number[] {
  const out = [0];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    // Longitude degrees are SHORTER than latitude ones this far north, so the
    // east-west delta is the one scaled DOWN, by the cosine of the latitude it
    // is measured at. This used to divide the latitude delta by that cosine
    // instead, which stretched north-south legs — the opposite correction, from
    // a comment describing the right one.
    //
    // Small either way: over Missouri's 36–40°N the cosine only moves between
    // 0.81 and 0.77, and a constant factor would cancel in the normalisation
    // below. It does not cancel, because the factor is taken per vertex.
    //
    // Planar is fine — this is a position along one line, not a distance.
    const dx =
      (coords[i][0] - coords[i - 1][0]) * Math.cos((coords[i][1] * Math.PI) / 180);
    const dy = coords[i][1] - coords[i - 1][1];
    total += Math.hypot(dx, dy);
    out.push(total);
  }
  return total > 0 ? out.map((d) => d / total) : out.map(() => 0);
}

/** Where a gauge sits along the line, as the progress of its nearest vertex. */
function nearestProgress(coords: number[][], progress: number[], lon: number, lat: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = (coords[i][0] - lon) ** 2 + (coords[i][1] - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return progress[best];
}

/**
 * Build the drawable collection: each river cut into colour runs.
 *
 * A river with one usable gauge emits ONE feature, exactly as before. Only
 * multi-gauge rivers are subdivided, and only where the colour actually changes
 * — a run continues until `colorAt` returns something different, so a river
 * whose gauges all agree stays a single feature no matter how many it has.
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

  const features: Feature<NetworkFeatureProps>[] = [];
  for (const river of rivers) {
    const geometry = river.geometry;
    const coords = geometry?.coordinates;
    if (!geometry || !coords?.length) continue;

    const code = gradeRiver(river, byKey);
    // Resolved here rather than in the layer so the paint expression stays a
    // plain ['get','color'] and no condition hex is ever written into a
    // StyleSheet — see the colour rule in README.md.
    const props = { slug: river.slug, name: river.name, code };

    const progress = progressAlong(coords);
    const stops: ColorStop[] = [];
    if (coords.length >= 2) {
      const seen = new Set<number>();
      for (const gauge of river.gauges ?? []) {
        if (!Number.isFinite(gauge.lon) || !Number.isFinite(gauge.lat)) continue;
        const graded = gradeGauge(river, gauge, byKey);
        // A gauge we cannot grade contributes no opinion. Painting its reach
        // grey because its ladder is missing would make the river look broken
        // rather than unmeasured, and its neighbours already cover the water.
        if (graded === 'unknown') continue;
        const at = nearestProgress(coords, progress, gauge.lon, gauge.lat);
        // Two gauges snapping to the same vertex would make a zero-width blend
        // band and a division by zero in colorAt. First one wins.
        if (seen.has(at)) continue;
        seen.add(at);
        stops.push({ at, color: conditionColor(graded) });
      }
      stops.sort((a, b) => a.at - b.at);
    }

    // No gradable gauge anywhere: fall back to the river's own verdict, which
    // is what the whole line used to be painted with.
    if (stops.length === 0) {
      features.push({
        type: 'Feature',
        id: river.slug,
        geometry,
        properties: { ...props, color: conditionColor(code) },
      });
      continue;
    }

    let runStart = 0;
    let runColor = colorAt(stops, progress[0]);
    for (let i = 1; i < coords.length; i++) {
      const next = colorAt(stops, progress[i]);
      if (next === runColor && i < coords.length - 1) continue;
      // Runs SHARE their boundary vertex. Ending one at i-1 and starting the
      // next at i would leave a hairline gap at every colour change, which at
      // 2.5pt reads as a dashed river.
      features.push({
        type: 'Feature',
        id: `${river.slug}:${runStart}`,
        geometry: { type: 'LineString', coordinates: coords.slice(runStart, i + 1) },
        properties: { ...props, color: runColor },
      });
      runStart = i;
      runColor = next;
    }
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
