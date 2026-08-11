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

import type { ServiceLayerKey } from './serviceLayers';
import type { AccessLayerKey } from './accessLayers';
import { neutral, primary, type Palette } from '@/theme/palette';
import { conditionColor } from '@/theme/conditions';
import { flowBandColor } from '@/theme/flow';
import type { EddySymbolName } from '@/components/EddySymbol';
import type { Ionicons } from '@expo/vector-icons';

export type LayerKey =
  | 'access'
  | 'boatRamps'
  | 'campgrounds'
  | 'gauges'
  | 'allGauges'
  | 'hazards'
  | 'outfitters'
  | 'lodging'
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
  /**
   * True when this row's tiers REFINE one population rather than splitting it.
   *
   * ── A COUNT IS ONLY SUMMABLE WHEN THE SETS ARE DISJOINT ─────────────────
   *
   * Every other tiered row partitions its members: a gauge is rated or it is
   * not, and a service is one pin under whichever tier claims it (see
   * lodgingPins, which drops what rentals already draws). Adding those tiers up
   * gives the row's total.
   *
   * Access points do not work that way. A boat ramp IS an access point — the
   * Boat ramps tier marks a SUBSET of the row's own population rather than a
   * slice taken out of it — so summing the two would count every ramp twice.
   *
   * ── SO THE TIERS ARE ORDERED, OUTERMOST FIRST ───────────────────────────
   *
   * Each refining tier is contained by the one before it, which is what lets
   * the row report the outermost LIVE tier — see layerRowCount. The order is
   * load-bearing rather than cosmetic: reading the row's own key instead would
   * be wrong in the state where the chips leave "All access" off and "Boat
   * ramps" on, which is reachable because a chip toggles independently of its
   * row, and which draws ten places under a row that would claim fifty.
   */
  tiersRefine?: boolean;
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
 * Access points and BOTH gauge tiers are on by default. Hazards are not.
 *
 * The questions someone opens the map with are "where can I get on this river"
 * and "is there any water in it", and those are exactly these layers.
 * Everything else is a follow-up question and stays off until asked — a river
 * under five layers of pins answers nothing.
 *
 * ── Hazards were on, and are off again ─────────────────────────────────────
 *
 * They joined this list when they stopped being river-scoped, on the argument
 * that a layer answering "which of these rivers has a low-water dam on it"
 * belongs on while somebody is deciding which river to drive to, and that
 * defaulting safety data off is hard to defend once the data is there.
 *
 * That argument was about the DATA and not about the map. What it missed is
 * that hazard pins are statewide, unclustered by design, and drawn at every
 * zoom — so on the opening view they scatter across the whole state at the
 * exact moment nothing has been chosen and every pin is equally irrelevant.
 * The layer that was meant to answer "which river" instead crowded the two
 * layers that do.
 *
 * ── What makes this defensible, and it is not "it is only a default" ───────
 *
 * NO HAZARD IS HIDDEN BY THIS. The map is not, and has never been, where this
 * app discharges its duty to warn:
 *
 *   • Every river screen carries a free Hazards section that names its critical
 *     count and wears a severity dot per critical hazard WHILE SHUT — see
 *     CollapsibleSection's header on why a folded section must still say what
 *     it is hiding, and why that rule was written for this data specifically.
 *   • A river whose hazards failed to load says so, and opens expanded.
 *   • The float plan lists every hazard on the stretch it returns, free, and
 *     never summarises them away.
 *   • The layers sheet lists Hazards with its switch, so an off layer is
 *     visible AS off the moment anyone looks — which is the distinction
 *     mapPreferences' header draws between a layer and a filter, and it is the
 *     reason this is a defensible default rather than a quiet removal.
 *
 * The map is a way to find a river. The river screen is where you are told
 * what is on it.
 *
 * ── Existing devices keep what they chose ──────────────────────────────────
 *
 * This is the default for a phone that has never opened the layers sheet.
 * Anyone who has is restored from AsyncStorage and keeps hazards on, because
 * `readMapLayers` returning a stored set means somebody made a choice — and
 * bumping the key to force this on them would also throw away every other
 * layer decision they have made. See mapPreferences.ts.
 *
 * `allGauges` used to be excluded, on the grounds that the national tier is a
 * reference someone asks for and that defaulting it on would fire a viewport
 * request at every cold start. That made the map wait for a river selection
 * before it felt useful. Both tiers now answer the opening statewide view:
 * curated gauges as compact condition dots and the national tier as clusters.
 * The full station marks and labels arrive only when the camera is closer.
 */
export const DEFAULT_LAYERS: LayerKey[] = ['access', 'gauges', 'allGauges'];

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
    // ── Boat ramps are a TIER here, not a ninth row ────────────────────────
    // EddySymbol's own ruling says the map catalog carries no boat-ramp mark
    // "on purpose — six type icons on one pin is a legend test, not a map",
    // and this row's description has claimed ramps since it was written. A
    // ramp is a REFINEMENT of the question this row already asks, which is the
    // shape gauges/allGauges and outfitters/lodging already have.
    //
    // It is also the shape that fits the palette. A dedicated row needs a
    // colour that dodges the condition ladder, coral, access teal, campground
    // green, outfitter tan and both neutral stones, and there is no clean one
    // left — while a tier legitimately shares its parent's colour and is told
    // apart by its MARK, which is the argument the gauge tier strip already
    // makes ("a face tells these two tiers apart better than any hue can").
    //
    // The tiers REFINE rather than partition, unlike every other tiered row,
    // and are therefore listed outermost first — see tiersRefine.
    tiers: ['access', 'boatRamps'],
    tiersRefine: true,
    tierLabel: 'All access',
    // A destination is map content, not an action. Teal keeps coral reserved
    // for Plan a float and the plan endpoint the user explicitly chose.
    // Shape still separates this pin from the gauge droplet.
    symbol: 'accessPoint',
    color: (c) => c.interactive,
  },
  {
    key: 'boatRamps',
    label: 'Boat ramps',
    tierLabel: 'Boat ramps',
    // A TIER, never a row — the sibling of `allGauges` and `lodging` above.
    nested: true,
    // Says where the fact comes from. Eddy does not measure a ramp's surface or
    // its slope, so the row may not imply it knows what a trailer will manage.
    description: 'Put-ins tagged as boat ramps',
    // Unused while `symbol` is set — `icon` is the documented fallback a layer
    // takes before the catalog draws its mark, and this one is already drawn.
    icon: 'boat-outline',
    symbol: 'boatRamp',
    // ── THE SAME TEAL AS THE ROW ABOVE, deliberately ──────────────────────
    // A ramp IS an access point, and this file's rule is that a row is only a
    // legend if its colour is literally the colour of the pins it toggles.
    // Ramp pins are drawn in the access family's teal — below ZOOM.places they
    // are the same 4.5px teal circle as every other put-in, and the ramp mark
    // is what appears above it. A second hue would be a legend for a
    // distinction the map does not draw in colour.
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
    // ── THIS ROW OWNS ALL OF CAMPING, and that is a deliberate ruling ──────
    // It already merged access points tagged `campground` with campground
    // services, so it is the one control a reader has learnt means "where do I
    // sleep on the ground". When services gained tier membership, camping could
    // have become a tier of the row below instead — and then two switches would
    // have drawn overlapping sets of the same tents. A service earns this layer
    // by having a camping OFFERING or a campground kind, whoever runs it.
    description: 'Places to sleep on the river',
    icon: 'bonfire-outline',
    symbol: 'campground',
    color: (c) => c.success,
  },
  {
    key: 'outfitters',
    // ── "River services", NOT "Services" ──────────────────────────────────
    // Campgrounds are services too — 44 of the same 156 directory rows — and
    // they have their own row above. A row called "Services" that excluded the
    // largest category of them would overclaim in exactly the way the dam row
    // guards against by being "Lakes & dams" rather than "Dams".
    //
    // The key stays `outfitters`. It is what a phone has in AsyncStorage from
    // every release so far, and renaming it would throw away the layer choices
    // of everyone who has ever opened the sheet. See mapPreferences.
    label: 'River services',
    description: 'Rentals, shuttles, cabins and lodges',
    // Two tiers for the same reason Gauges has two: this is one question —
    // "who can outfit this trip" — with a which underneath it, and a business
    // may answer both. `serviceTiers` returns a SET, so an outfitter that rents
    // cabins is drawn by whichever tier is on rather than having to pick.
    tiers: ['outfitters', 'lodging'],
    tierLabel: 'Rentals & shuttles',
    icon: 'boat-outline',
    symbol: 'outfitter',
    color: (c) => c.warm,
  },
  {
    key: 'lodging',
    label: 'Cabins & lodges',
    tierLabel: 'Cabins & lodges',
    // A TIER, never a row — the sibling of `allGauges` above. Forty-one rows of
    // which two are geocoded does not carry a top-level switch, and the question
    // it answers ("a roof rather than a tent") is a refinement of the row above
    // rather than a separate layer of the map.
    nested: true,
    description: 'Cabins, lodge rooms and cottages',
    icon: 'bed-outline',
    // No `symbol`: the catalog has no lodging mark yet, and `icon` is the
    // documented fallback a layer takes before one is drawn for it. When the
    // mark lands this gains `tierSymbol` and nothing else changes.
    //
    // ── PROVISIONAL, and the reason is the palette, not taste ─────────────
    // The obvious choice is a deeper step of the tan the row already wears, and
    // the secondary scale has no such step — it is 500/200/100/50, and 500 IS
    // `warm`. So this borrows the neutral stone instead, a clear step off the
    // one `publicLand` uses, which keeps it out of the condition ladder (red,
    // amber and green all mean something about water here) and out of coral
    // (reserved for the float CTA). Revisit when the catalog draws the mark —
    // a face tells these two tiers apart better than any hue can, which is the
    // same argument the gauge tier strip already makes.
    color: (c) => (c.scheme === 'dark' ? neutral[200] : neutral[500]),
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

// Which layer draws which service, and what to call it, live in
// `serviceLayers.ts` — pure, and therefore executable by the web suite, which is
// the only runner the Expo app has. This module resolves colours through the
// palette and so cannot be imported from a test at all, not even for a type.
// See that file's header for why `OUTFITTER_SERVICE_TYPES` is gone.
//
// The keys it declares are a SUBSET of LayerKey, and this is where that is
// enforced — the pure module cannot import this one, so the check has to live on
// this side. A service layer renamed here without being renamed there stops
// compiling, which is the whole point: the last time these two ideas drifted,
// nothing failed and 41 rows quietly left the map.
const _serviceLayersAreRealLayers: readonly LayerKey[] = [
  'outfitters',
  'lodging',
  'campgrounds',
] satisfies readonly ServiceLayerKey[];
void _serviceLayersAreRealLayers;

// The access family's keys are checked the same way, from the same side, for the
// same reason: `accessLayers.ts` owns which places each of these three draws and
// which mark each place wears, and it cannot import this module (palette) even
// for a type. Rename a key here without renaming it there and this stops
// compiling.
const _accessLayersAreRealLayers: readonly LayerKey[] = [
  'access',
  'campgrounds',
  'boatRamps',
] satisfies readonly AccessLayerKey[];
void _accessLayersAreRealLayers;

// ── One place, one pin ──────────────────────────────────────────────────────
//
// `drawnAsAccessPoint` used to live here. It is the rule that stops a campground
// reaching the map twice — once from `access_points`, once from `nearby_services`
// as a business, seeded years apart from different sources — and it moved into
// `accessLayers.ts` with the rest of the one-place-one-marker decision, where the
// web suite can finally execute it. Nothing in this module needs it: a layer
// DEFINITION says what a row is called and coloured, and which places it claims
// is a membership question.

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
