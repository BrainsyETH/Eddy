// eddy-ios/src/map/layers.ts
// What the map can draw, and what each thing is called and coloured.
//
// One definition per layer, in one place, because the same list drives three
// things that would otherwise drift: the layer sheet, the pin colours, and the
// callout that appears when a pin is tapped. A row in the sheet is only a legend
// if its colour is literally the colour of the pins it toggles.
//
// COLOURS ARE ROLES, NOT HUES. Every value here resolves through the palette or
// through CONDITION_SYSTEM. Hazards borrow the canonical `dangerous` red on
// purpose: a paddler who has learnt that red means "do not float" should read a
// low-water dam the same way without being taught twice.

import { neutral, primary, type Palette } from '@/theme/palette';
import { conditionColor } from '@/theme/conditions';
import { flowBandColor } from '@/theme/flow';
import type { EddySymbolName } from '@/components/EddySymbol';
import type { Ionicons } from '@expo/vector-icons';

export type LayerKey =
  | 'access'
  | 'campgrounds'
  | 'gauges'
  | 'allGauges'
  | 'hazards'
  | 'outfitters'
  | 'dams'
  | 'weatherRadar'
  | 'publicLand';

/**
 * The layers that draw PINS — every key except the ones that draw AREAS.
 *
 * Exists because `Record<LayerKey, FeatureCollection>` stopped being true the
 * moment a raster layer joined the union, and the honest fix is not an empty
 * collection stapled on to keep the record total. A raster has no point features
 * and never will; a fake entry would compile, mean nothing, and be inherited by
 * every non-pin layer added after it — as `publicLand`, which draws polygons,
 * duly was.
 *
 * Kept as an explicit Exclude rather than derived from a runtime flag, because
 * this has to hold at compile time. Add a layer that is not made of pins, add it
 * here.
 */
export type PinLayerKey = Exclude<LayerKey, 'weatherRadar' | 'publicLand'>;

export interface LayerDef {
  key: LayerKey;
  label: string;
  /** One line under the label, saying what the layer actually shows. */
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /**
   * Eddy's own mark for this layer. Every layer has one.
   *
   * These are fixed-colour art, so a layer with a symbol keeps its `color` for
   * the well's border and nothing recolours the mark itself. That works here,
   * and only here, because a row is a LEGEND rather than a pin: the pins on the
   * map are still SDF and still wear their condition.
   *
   * Optional only because `icon` is the fallback a new layer starts life with,
   * before the catalog has drawn for it.
   */
  symbol?: EddySymbolName;
  color: (colors: Palette) => string;
  /**
   * Layers this row switches, when the row is a THING rather than a layer.
   *
   * Gauges are one thing on the map — a station with a number on it — drawn in
   * two tiers, and the sheet used to offer them as two unrelated switches
   * sitting next to each other. Nothing said the second was the complement of
   * the first, so "Gauges" read as a subset of "Other USGS gauges" and turning
   * both on looked like a way of drawing some of them twice. One row now owns
   * the question, and the tiers are a strip underneath it.
   *
   * The KEYS ARE STILL SEPARATE everywhere else — the two tiers are drawn by
   * different code with different rules (see contextGaugeLayer in RiverMap),
   * and merging them into one layer key would merge those too.
   */
  tiers?: LayerKey[];
  /** How this layer is named inside a tier strip, where the row is the context. */
  tierLabel?: string;
  /**
   * How this layer is MARKED inside a tier strip. Sibling of `tierLabel`, and
   * needed for the same reason it is.
   *
   * A row and its first tier are one definition here — `gauges` is both the
   * "Gauges" row and the "Eddy-rated" chip under it — and the two want
   * different marks. The row asks "show me gauges", which is the staff gauge.
   * The chip asks "the ones Eddy graded, or the rest", which is Eddy's own face
   * against the plain USGS staff. One field could not say both.
   */
  tierSymbol?: EddySymbolName;
  /** True when the layer only ever appears as a tier and never as a row. */
  nested?: boolean;
  /**
   * True when the layer draws IMAGERY rather than places.
   *
   * Two things follow from it and neither is cosmetic. A raster has no count —
   * "37 rain" is not a sentence — so the sheet must be handed `undefined` and
   * not 0, which it already renders differently (absent, not zero). And a
   * raster is not in an offline pack: tiles stream from a third party and a
   * downloaded river cannot carry live weather, so the row has to say so rather
   * than appearing to work and drawing nothing.
   */
  raster?: boolean;
}

/**
 * Access points, hazards and BOTH gauge tiers are on by default.
 *
 * The questions someone opens the map with are "where can I get on this river",
 * "is there any water in it" and "is any of it going to kill me", and those are
 * exactly these layers. Everything else is a follow-up question and stays off
 * until asked — a river under five layers of pins answers nothing. The choice
 * sticks for the session.
 *
 * ── Hazards joined this list when they stopped being river-scoped ──────────
 *
 * They were off by default for a defensible reason: the layer held nothing
 * until a river had been chosen, so switching it on before that did visibly
 * nothing. Now it draws all 19 hazards Eddy has, across 11 of 25 rivers, from
 * the launch bundle. Nineteen pins is not clutter, and a layer that answers
 * "which of these rivers has a low-water dam on it" belongs ON while somebody
 * is still deciding which river to drive to. Defaulting safety data off is a
 * hard thing to defend once the data is actually there.
 *
 * `allGauges` used to be excluded, on the grounds that the national tier is a
 * reference someone asks for and that defaulting it on would fire a viewport
 * request at every cold start. That made the map wait for a river selection
 * before it felt useful. Both tiers now answer the opening statewide view:
 * curated gauges as compact condition dots and the national tier as clusters.
 * The full station marks and labels arrive only when the camera is closer.
 */
export const DEFAULT_LAYERS: LayerKey[] = ['access', 'hazards', 'gauges', 'allGauges'];

/**
 * ── THE ZOOM LADDER ─────────────────────────────────────────────────────────
 *
 * One table, because every layer on this map is statewide now and the map is
 * only legible if they all change character together. These numbers were set
 * one layer at a time as each was written — access clustered to 9, the national
 * gauge tier to 11, access icons appeared at 10, its labels at 11, curated
 * gauges swapped representation at 8.5 — so panning in crossed six different
 * thresholds at six different moments and the map reorganised itself the whole
 * way. Rungs, not opinions per layer.
 *
 *   OFF      below 5.5   Lines only. Nothing statewide draws or fetches; a
 *                        continental view asks for nothing.
 *   COUNTS   5.5 – 8     Clusters and small coloured dots. "Where is there
 *                        water, and where can I get on it" at a glance.
 *   PLACES   8 – 10.5    Individual pins, no names. Enough to see arrangement.
 *   NAMES    10.5+       Labels. The camera is close enough for text to land
 *                        beside the thing it names rather than across it.
 *
 * A layer may sit out a rung — hazards never cluster, and the raster has its own
 * pair — but nothing invents a rung of its own.
 */
export const ZOOM = {
  /** Below this, statewide layers neither draw nor fetch. */
  min: 5.5,
  /** Clusters collapse into individual pins at this zoom. */
  cluster: 8,
  /** Pins gain their full mark, and dots give way to symbols. */
  places: 10.5,
  /** Labels switch on. */
  names: 10.5,
} as const;

/**
 * Below this zoom NEITHER gauge tier draws or fetches.
 *
 * Kept just below the phone's statewide opening view. It prevents a continental
 * request when somebody deliberately zooms far out without recreating the old
 * click-a-river-first flow. Both tiers share it so reference clusters never
 * appear without the curated condition dots that carry Eddy's verdicts.
 *
 * An alias for the ladder's floor. It keeps its own name because the two
 * VIEWPORT hooks read it as a fetch gate rather than as a paint threshold —
 * useViewportGauges and usePublicLands ask for nothing below it — and that is a
 * different claim from "do not draw".
 */
export const MIN_GAUGE_ZOOM = ZOOM.min;

/**
 * Where curated gauges change from overview dots to full staff marks + labels.
 *
 * Forty full symbols and place names obscure a statewide phone map; forty small
 * coloured dots do not. Keeping representation separate from visibility is the
 * important distinction: the readings are present and tappable immediately,
 * then gain detail as the camera moves closer.
 */
export const GAUGE_DETAIL_ZOOM = ZOOM.places;


export const MAP_LAYERS: LayerDef[] = [
  {
    key: 'access',
    label: 'Access points',
    description: 'Put-ins and ramps on every river',
    icon: 'location',
    // A destination is map content, not an action. Teal keeps coral reserved
    // for Plan a float and the plan endpoint the user explicitly chose.
    // Shape still separates this pin from the gauge droplet.
    symbol: 'accessPoint',
    color: (c) => c.interactive,
  },
  {
    key: 'gauges',
    // ONE ROW FOR ONE QUESTION — "show me gauges" — with the partition offered
    // as a strip underneath rather than as a second switch beside it. The two
    // tiers are still named for what separates them (see tierLabel below and on
    // the row after this one), because that distinction is the whole point:
    // both hold USGS gauges, and only one of them carries a verdict.
    label: 'Gauges',
    description: 'Live USGS readings on the water',
    tiers: ['gauges', 'allGauges'],
    tierLabel: 'Eddy-rated',
    icon: 'speedometer-outline',
    symbol: 'gauge',
    tierSymbol: 'eddyRated',
    // Deep River Teal from the brand palette rather than coral: a gauge is a
    // measurement, not a destination, and it should read as instrumentation
    // against the accent-coloured places. Sourced from the palette scale so it
    // moves with the brand instead of being a hex nobody can trace.
    color: (c) => (c.scheme === 'dark' ? primary[300] : primary[600]),
  },
  {
    key: 'allGauges',
    // "Other", not "All". This layer has always DROPPED the curated gauges —
    // the screen filters them out so a rated station is not drawn twice, once
    // as a verdict and once as a comparison a pixel apart — but the old label
    // claimed the opposite, and nothing on screen said the two rows partitioned
    // the same network between them.
    label: 'Other USGS gauges',
    tierLabel: 'Other USGS',
    // A TIER, not a row. It reaches the sheet through the Gauges row above,
    // which is the only place it has ever made sense: this layer is defined as
    // the complement of that one, and a switch that says so out loud is worth
    // more than a switch of its own.
    nested: true,
    // Says what it is AND what it is not. Someone who switches this on gets
    // thousands of dots that look like the gauge pins above them, and the one
    // thing they must understand is that Eddy has not rated any of them.
    description: 'The rest of the USGS network — reading only',
    icon: 'globe-outline',
    // A bare staff gauge in water, against Eddy's face on the tier above it:
    // the pair says "graded" and "not graded" without either chip having to.
    symbol: 'otherGauge',
    // The middle of the flow ramp, so the sheet row is literally the colour of
    // an average pin it draws — the same "a row is only a legend if it matches"
    // rule the rest of this file follows.
    color: () => flowBandColor('normal'),
  },
  {
    key: 'hazards',
    label: 'Hazards',
    description: 'Low-water dams, strainers, portages',
    icon: 'warning-outline',
    symbol: 'hazard',
    color: () => conditionColor('dangerous'),
  },
  {
    key: 'dams',
    // "Lakes & dams", NEVER "Dams". The hazards row above already draws
    // low-water dams, in the canonical `dangerous` red, and they are a
    // different thing entirely: one is a Corps project with a lake and a
    // generation schedule, the other is the leading killer in paddling. Two
    // rows both called "Dams", one red and one teal, would be a legibility bug
    // with a safety consequence — so the label names the lake, which is what
    // actually distinguishes these ten.
    label: 'Lakes & dams',
    description: 'USACE releases, lake levels and generation',
    icon: 'water-outline',
    // A dedicated spillway mark, separate from both the gauge instrument and
    // the dangerous low-water-dam hazard mark above.
    symbol: 'dam',
    // Instrumentation teal, from the same family as the gauge rows and
    // explicitly NOT the hazard red — for the reason in the label note above. A
    // step darker than `gauges` so the two are siblings rather than twins.
    color: (c) => (c.scheme === 'dark' ? primary[200] : primary[800]),
  },
  {
    key: 'weatherRadar',
    label: 'Rain',
    // Says what it IS and, by saying "live", what it is not: the one layer here
    // that a downloaded river cannot carry.
    description: 'Where it is raining now',
    icon: 'rainy-outline',
    // Already in the bundled catalog — this is the mark the weather panel on
    // the river screen uses, so the two agree about what weather looks like.
    symbol: 'weather',
    raster: true,
    // The rain ramp's middle step, NOT a condition colour and NOT the flow
    // ramp. Radar says nothing about whether a river is floatable — it is
    // sky, not water — and borrowing either vocabulary would imply it does.
    color: (c) => c.rainLikely,
  },
  {
    key: 'publicLand',
    label: 'Public land',
    // SAYS WHAT IT IS NOT, in the one line the sheet gives it. A boundary here
    // is ownership; it is not a right to land, camp or portage, and someone
    // switching this on to answer "can I sleep on that gravel bar" has to meet
    // that sentence before they meet the fill. The longer version renders under
    // the switch (PUBLIC_LAND_OWNERSHIP_NOTE) and again in the callout.
    description: 'Agency boundaries — ownership, not permission',
    icon: 'map-outline',
    // No `symbol`: the catalog has no mark for public land, and `icon` is the
    // documented fallback for a layer before one is drawn for it.
    //
    // Warm stone, from the neutral scale rather than the sandbar one. Two things
    // it must not be: a condition colour (red/amber/green already mean "do not
    // float", "use caution" and "go" on this map, about the water, and a federal
    // ownership class may not borrow that weight), and `warm` — which is
    // secondary-500 and is already the Outfitters row. Per scheme because a
    // stone dark enough to read on the light map vanishes on the dark one.
    color: (c) => (c.scheme === 'dark' ? neutral[300] : neutral[700]),
  },
  {
    key: 'campgrounds',
    label: 'Campgrounds',
    description: 'Places to sleep on the river',
    icon: 'bonfire-outline',
    symbol: 'campground',
    color: (c) => c.success,
  },
  {
    key: 'outfitters',
    label: 'Outfitters',
    description: 'Rentals, shuttles and lodging',
    icon: 'boat-outline',
    symbol: 'outfitter',
    color: (c) => c.warm,
  },
];

/**
 * The rows the layers sheet draws, which is MAP_LAYERS minus the tiers.
 *
 * Kept as a derived list rather than a second array: a tier still needs its
 * label, its colour and its icon everywhere else — the pin callout looks a
 * layer up by key, and the tier strip draws its own chips from these — so
 * removing it from MAP_LAYERS would break more than it tidied.
 */
export const SHEET_LAYERS: LayerDef[] = MAP_LAYERS.filter((layer) => !layer.nested);

/** Every layer key one sheet row switches: its tiers, or just itself. */
export function layerKeysFor(layer: LayerDef): LayerKey[] {
  return layer.tiers ?? [layer.key];
}

/** Service types that belong under the Outfitters row rather than Campgrounds. */
export const OUTFITTER_SERVICE_TYPES = ['outfitter', 'canoe_rental', 'shuttle', 'lodging'];

// ── One place, one pin ──────────────────────────────────────────────────────
//
// A campground can reach the map from two tables. `access_points` holds the ones
// you can also put in at — Red Bluff, Hazel Creek, Montauk — tagged `campground`
// among their types. `nearby_services` holds campgrounds as businesses, and
// several of them are the SAME PLACE as an access point, seeded separately years
// apart from different sources.
//
// That was survivable for exactly as long as the two copies disagreed about
// where the place is, because the duplicate landed miles away and read as a
// second campground. It is not survivable once they agree: two pins on one
// coordinate, one of them carrying the access point's planner actions and photo
// and one of them carrying a phone number, with no way to tell which is on top.
//
// So a service that sits on top of a drawn access point is dropped, and the
// access point — the richer record, and the one the planner can use — wins.

/**
 * How close counts as "the same place", in degrees of latitude.
 *
 * ~0.002° is a little over 200 m. Generous on purpose: the two records were
 * geocoded independently, and a campground is an area rather than a point — a
 * service pinned at the entrance and an access point pinned at the ramp are one
 * place even though they are two hundred metres apart. Nothing legitimate is
 * lost at this radius; two DIFFERENT campgrounds that close together on one
 * river do not exist in this dataset.
 */
const SAME_PLACE_DEGREES = 0.002;

/**
 * Is this service already on the map as an access point?
 *
 * Position, not name. "Red Bluff Campground" and "Red Bluff Recreation Area"
 * are one place under two names, and the reverse trap exists too — matching on
 * names would eventually collapse two genuinely different places that share a
 * creek's name. What the reader is being spared is two pins in one spot, which
 * is a question about coordinates.
 *
 * Longitude is scaled by latitude so the box is square on the ground. At 37°N a
 * degree of longitude is about four fifths of a degree of latitude, and an
 * unscaled comparison would quietly make the box wider than it is tall.
 */
export function drawnAsAccessPoint(
  service: { latitude: number | null; longitude: number | null },
  points: readonly { coordinates: { lng: number; lat: number } }[],
): boolean {
  const { latitude, longitude } = service;
  if (latitude == null || longitude == null) return false;
  const lngScale = Math.max(0.2, Math.cos((latitude * Math.PI) / 180));
  return points.some(
    (point) =>
      Math.abs(point.coordinates.lat - latitude) <= SAME_PLACE_DEGREES &&
      Math.abs(point.coordinates.lng - longitude) <= SAME_PLACE_DEGREES / lngScale,
  );
}

// ── Weather radar tiles ─────────────────────────────────────────────────────
//
// ── Why not NOAA directly ──────────────────────────────────────────────────
// This is NEXRAD — NOAA's own radar — but it does not come from NOAA, and that
// is a technical constraint rather than a preference. NOAA publishes radar as
// WMS and as an ArcGIS ImageServer `exportImage` call; neither is an XYZ tile
// service. MapLibre can paper over that with the `{bbox-epsg-3857}` token, and
// Mapbox's iOS SDK — which is what this app runs — does not support it. There
// is no arrangement of a NOAA endpoint that a RasterSource here can consume.
//
// Iowa State's Environmental Mesonet re-serves the same NEXRAD composite as
// plain XYZ PNG, keyless and free, and has done for years. That is what this
// is. The data is NOAA's; the tiling is theirs.
//
// ── The alternative, and why not it ────────────────────────────────────────
// The website uses RainViewer, which would match it exactly. RainViewer is a
// commercial aggregator with a free tier, and putting a rate-limited third
// party in front of a safety-adjacent layer on a phone that may be on one bar
// of signal is a worse trade than a university mirror of the public feed.
export const RADAR_TILE_URL =
  'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png';

/**
 * Required attribution, shown on its own muted line under the Rain switch
 * whenever the layer is drawing.
 *
 * Not optional and not decorative: IEM asks for credit, and a reader looking at
 * rain on a map is owed the knowledge that Eddy did not measure it.
 */
export const RADAR_ATTRIBUTION = 'Radar: NOAA NEXRAD via Iowa State Mesonet';

/**
 * How transparent the radar sits over the map.
 *
 * Matches the website's `'raster-opacity': 0.6`. Light enough that the river
 * line and its pins stay readable underneath — the radar is the answer to a
 * question about the sky, and the river is still the subject of the screen.
 */
export const RADAR_OPACITY = 0.6;

/**
 * The composite is national and its tiles are cheap, but there is no point
 * fetching them for a continent-wide view where a storm is three pixels.
 *
 * Lower than MIN_GAUGE_ZOOM on purpose: weather remains legible even farther
 * out because a rain band is hundreds of miles across where a gauge is a point.
 */
export const MIN_RADAR_ZOOM = 4;

/**
 * The highest native zoom published by IEM's NEXRAD composite.
 *
 * Requests above z9 return blank PNGs rather than an overzoomed radar tile.
 * Giving Mapbox the real source ceiling makes it reuse and upscale z9 at the
 * river-scale zooms where the app normally runs.
 */
export const MAX_RADAR_ZOOM = 9;

// ── Public land (PAD-US) ────────────────────────────────────────────────────
//
// The layer's colours are NOT here. They are PUBLIC_LAND_ACCESS_STYLE in
// @eddy/types, shared with the website — which draws the same federal dataset
// with a different rendering engine, and which must not teach a reader a
// different meaning for the same shade. (The website cannot import the package
// at runtime, so it mirrors the table and a test in the web suite pins the two
// together. This app can, so it does.)

/**
 * Below this the layer draws nothing and asks for nothing.
 *
 * A parcel boundary is a line you read AGAINST a river; at a statewide zoom
 * there is no river to read it against, only a wash of fill over four states.
 * Matches the floor the API enforces, which returns an empty collection below it
 * regardless of what the client asks for.
 *
 * Higher than the gauge overview and below GAUGE_DETAIL_ZOOM on purpose: small
 * gauge dots can describe a state before parcel boundaries become useful, while
 * a national forest still becomes legible before individual gauge labels do.
 */
export const MIN_PUBLIC_LAND_ZOOM = 7;

/**
 * Required attribution, shown whenever the layer is drawing.
 *
 * PAD-US is public domain and USGS asks for credit rather than requiring it —
 * which is the reason to give it, not a reason to skip it. A reader looking at
 * an ownership boundary is owed the knowledge that Eddy did not draw it.
 */
export const PUBLIC_LAND_ATTRIBUTION = 'Boundaries: USGS PAD-US';
