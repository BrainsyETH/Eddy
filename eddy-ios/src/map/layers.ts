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
import { PUBLIC_LAND_OWNERSHIP_NOTE } from '@eddy/types';
import { CONDITION_ORDER } from '@eddy/conditions';
import { neutral, primary, type Palette } from '@/theme/palette';
import { conditionColor, conditionLabel } from '@/theme/conditions';
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
  /**
   * One short line under the row, and it earns its place only by answering
   * WHAT THIS DRAWS.
   *
   * ── The rule this field is now held to ────────────────────────────────────
   * A "Show on map" sheet is a control surface, and every sentence on it
   * competes with the switch beside it. Subtext survives here only if a reader
   * cannot tell what the row draws from its label, its mark and its count —
   * which the label, mark and count already answer for most rows. Hazards and
   * Lakes & dams carry none, deliberately.
   *
   * Everything ELSE that was on these rows — how much of the directory has
   * been geocoded, which mark a place ended up wearing, which agency published
   * a boundary — went to `info` or off the sheet entirely. Those are facts
   * about Eddy's data, and this drawer is where somebody controls a map.
   */
  description?: string;
  /**
   * The longer explanation, behind an ⓘ rather than printed inline.
   *
   * For a caveat that MATTERS but is too long to sit under a switch. Public
   * land is the case that defines it: "ownership, not permission" is the whole
   * reason the layer is allowed to draw, and it is also three lines of prose
   * that pushed every row below it off a phone screen. Behind a tap it is still
   * one gesture from the fill it qualifies, and it is no longer competing with
   * the controls.
   *
   * Attribution belongs here for the same reason — required, and not something
   * anyone reads while deciding which layers to switch on.
   */
  info?: string;
  /** Extra context for assistive technology when the visible label is enough. */
  accessibilityHint?: string;
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
  /**
   * Where each tier's count is measured, when the tiers do not all measure
   * the same universe.
   *
   * The gauges row is the only holder today: the rated tier is counted
   * statewide while the national tier is counted per viewport, and
   * layerRowCount refuses to sum across scopes — the row prints nothing and
   * the tier chips keep their own honestly-scoped figures. Absent means every
   * tier is statewide, which keeps every other row's arithmetic untouched.
   */
  scopes?: Partial<Record<LayerKey, 'statewide' | 'viewport'>>;
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
   * Which heading this row sits under, or none for the ungrouped rows above.
   *
   * ── A HEADING, AND EMPHATICALLY NOT A FILTER ─────────────────────────────
   *
   * It groups rows on screen and does nothing else. There is no parent switch,
   * no combined count, no `placesToStay` layer key, no population of its own —
   * a section cannot be toggled, cannot be counted, and never reaches the
   * resolver. Camping and Cabins stay two independent, non-exclusive switches
   * over two overlapping populations, which is why summing them would be wrong
   * and why nothing here sums them.
   *
   * The distinction is worth stating because the obvious next step is not: an
   * aggregate "Places to stay" toggle would need one population, and camping and
   * lodging genuinely overlap — 35 of the directory's mapped rows are both — so
   * that population would either double-count or force a place to pick a side.
   * The whole point of `serviceTiers` returning a SET is that it does not have
   * to.
   */
  section?: LayerSectionKey;
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
 * Whether a phone that has never opened the layers sheet draws this layer.
 *
 * ── A TOTAL RECORD, for the reason KNOWN_LAYERS is one ────────────────────
 *
 * It was a three-key array literal, and under the old rule — almost everything
 * off — a layer added to the union and forgotten here defaulted to off, which
 * was both silent and correct. The rule has inverted, so the same omission is
 * now silently WRONG: a new row would arrive dark on a sheet whose every other
 * row is lit, and nothing would fail. As a `Record<LayerKey, boolean>` the
 * omission is a compile error and the new layer has to state its answer. Same
 * technique, same argument, as KNOWN_LAYERS in mapPreferences.ts.
 *
 * Listed in catalog order so this table can be read against MAP_LAYERS below.
 */
const LAYER_DEFAULTS: Record<LayerKey, boolean> = {
  access: true,
  // ── THE ONE `false` THAT IS NOT AN OVERLAY, and it is a TIER ───────────
  // A ramp IS an access point and is already drawn as one; this tier only
  // changes which MARK it wears. The family index clusters ramps with the
  // rest of the access family below ZOOM.cluster, so switching the tier on no
  // longer costs the statewide view anything — the default stays off because
  // the tier ADDS no place to the map, only a different mark on places
  // already drawn, and that is a distinction someone asks for.
  boatRamps: false,
  gauges: true,
  allGauges: true,
  hazards: true,
  dams: true,
  weatherRadar: false,
  publicLand: false,
  campgrounds: true,
  outfitters: true,
  lodging: true,
};

/**
 * What the app opens with: EVERY ROW EXCEPT THE OVERLAYS SECTION.
 *
 * ── The rule, and the one it replaced ──────────────────────────────────────
 *
 * This was `['access', 'gauges', 'allGauges']`, on the argument that the map
 * opens with two questions — "where can I get on this river" and "is there any
 * water in it" — and that everything else is a follow-up which should stay off
 * until asked, because a river under five layers of pins answers nothing.
 *
 * The rule now is the other way round, and the line has moved to WHAT A LAYER
 * DOES TO THE MAP rather than to how central its question is. A pin layer adds
 * to the map: it puts things on the river, and a reader who does not want them
 * has a labelled switch to say so. The two overlays do not add, they COVER —
 * a translucent raster wash and agency polygon fills, both of them over the
 * whole viewport — so they change how readable everything underneath is, which
 * is a thing to opt into rather than out of. Both also keep asking as the
 * camera moves: radar as third-party tiles a downloaded river cannot carry,
 * public land as parcel geometry heavy enough that its hook caches on the zoom
 * as well as the box (usePublicLands).
 *
 * The discovery argument runs the same way. This sheet is a legend as much as
 * a control — every row is drawn in its layer's own colour and mark — and a
 * reader can only learn that Eddy knows where the cabins are by seeing cabins.
 * Seven of the nine rows opened dark under the old rule, and a dark switch
 * teaches nobody what is behind it.
 *
 * ── WHAT THIS COST, and what was done about it ─────────────────────────────
 *
 * It made the opening statewide view unreadable, and that is not a hypothetical
 * — it shipped that way for a build. Hazards, Camping, Cabins, Rentals and
 * ramps each drew a full 22pt mark at every zoom while only access and the
 * gauge tiers clustered, so switching them all on put ~285 icons over the
 * rivers they annotate. It was the exact objection that took hazards out of
 * this list once before, arriving for five more layers at once.
 *
 * The answer was the ZOOM ladder above rather than a retreat to switching them
 * off, because a layer nobody can see is a layer nobody knows to turn on. Every
 * place layer is on the rungs now, and the COUNTS band belongs to the two
 * family indexes in RiverMap — so the statewide view is bubbles and the marks
 * arrive as the camera does.
 *
 * The other cost is two requests on first paint that the old default did not
 * make: /api/services once, statewide, and /api/dams, which reads through to
 * CWMS and can be slow on a cold entry. Neither blocks the map — services fail
 * to null and leave their counts absent, and the dam PINS ship in the binary
 * (DAM_CATALOG), so a slow answer costs the live generation figures and not the
 * layer.
 *
 * ── Hazards on, and why the map is not the duty to warn ────────────────────
 *
 * NO HAZARD WAS EVER HIDDEN BY THE OLD DEFAULT, and none depends on this one:
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
 *     mapPreferences' header draws between a layer and a filter.
 *
 * The map is a way to find a river. The river screen is where you are told
 * what is on it. That was true when this layer defaulted off and it is why
 * defaulting it on is a legibility decision rather than a safety one.
 *
 * ── Existing devices keep what they chose ──────────────────────────────────
 *
 * This is the default for a phone that has never opened the layers sheet.
 * Anyone who has is restored from AsyncStorage and keeps exactly what they
 * chose, because `readMapLayers` returning a stored set means somebody made a
 * choice — and bumping the key to force this on them would also throw away
 * every other layer decision they have made. See mapPreferences.ts.
 *
 * `allGauges` was excluded once too, on the grounds that the national tier is a
 * reference someone asks for and that defaulting it on would fire a viewport
 * request at every cold start. That made the map wait for a river selection
 * before it felt useful. Both tiers answer the opening statewide view: curated
 * gauges as compact condition dots and the national tier as clusters. The full
 * station marks and labels arrive only when the camera is closer.
 *
 * Derived rather than typed out again — the table above is the only place a
 * default is stated. Order follows it, and nothing reads this as ordered:
 * every consumer asks `includes`, and `isDefaultLayers` compares membership.
 */
export const DEFAULT_LAYERS: LayerKey[] = (Object.keys(LAYER_DEFAULTS) as LayerKey[]).filter(
  (key) => LAYER_DEFAULTS[key],
);

/**
 * The headings the layers sheet groups its last rows under.
 *
 * ── WHY GROUP AT ALL, AND WHY ONLY THESE ─────────────────────────────────
 *
 * A reader arrives with a question, and two of this sheet's rows answer the
 * same one. "Where do I sleep" is Camping OR Cabins & lodges, and a flat list
 * put them either side of a row about canoe rental — so a reader who found
 * Camping had no reason to believe anything else on the sheet was about sleeping
 * at all. The rows were already right; their adjacency was not.
 *
 * Access points, Gauges, Hazards and Lakes & dams stay ungrouped at the top.
 * Each answers a question nothing else on the sheet answers, so a heading over
 * any of them would be a heading over one row — a label pretending to be a
 * category. Grouping arrives exactly where there is something to group.
 *
 * ── `overlays` GROUPS BY WHAT THE ROWS DO, not by what they are about ─────
 *
 * Rain and Public land have nothing in common as subjects — one is weather and
 * one is ownership — so by the rule above they should be two ungrouped rows,
 * and they were. What they share is everything else: they are the only rows
 * that draw OVER the map rather than on it (a raster wash, polygon fills), the
 * only two with no pins and therefore no mark to read them by, the only two
 * carrying an ⓘ — and since the defaults inverted, THE ONLY TWO THAT OPEN OFF.
 *
 * That last one is what makes the heading worth its line. Every other row on
 * this sheet is lit, so two dark switches loose among them read as a state
 * somebody left them in. Under a heading of their own at the bottom they read
 * as what they are: the things you switch on when you want them.
 *
 * The heading still groups and nothing more — see LayerDef.section. There is no
 * "Overlays" switch and no overlay count; radar has no count at all and a
 * parcel total is a viewport fact, so a combined figure could not be written
 * even if a section were allowed one.
 *
 * ── THE ORDER IS THE READING ORDER ───────────────────────────────────────
 *
 * `stay` before `services`: where you sleep decides a trip and who rents you a
 * canoe follows from it, which is the same priority MARK_PRIORITY encodes when
 * one place has to pick a mark. `overlays` last, because a reader scrolling
 * this sheet is looking for something to switch OFF until they reach it.
 */
export type LayerSectionKey = 'stay' | 'services' | 'overlays';

export const LAYER_SECTIONS: readonly { key: LayerSectionKey; label: string }[] = [
  { key: 'stay', label: 'Places to stay' },
  // ── "Services" IS ALLOWED HERE, and was not allowed as a ROW label ──────
  //
  // The `outfitters` row carried a comment refusing the word: a row called
  // "Services" that excluded campgrounds would overclaim, campgrounds being 44
  // of the same directory. That objection was about a ROW, and it still holds —
  // which is why the row below is now named for what it draws, "Rentals &
  // shuttles", and no longer claims the whole word.
  //
  // A heading is a different kind of thing. It names a GROUP OF QUESTIONS
  // rather than a population, it draws nothing, and it counts nothing. Nobody
  // reads "Services" here and concludes that camping is not one — they read it
  // after "Places to stay" has already answered that question.
  { key: 'services', label: 'Services' },
  // "Overlays", the word every map app uses for imagery and boundaries laid
  // over a basemap, and the one that does not overclaim: it says how these two
  // draw, which is the only thing they have in common. "Weather & land" would
  // name their subjects and then be wrong about the next row added here.
  { key: 'overlays', label: 'Overlays' },
];

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
 *   PLACES   8 – 9.5     Individual places as compact dots, no marks and no
 *                        names. Enough to see arrangement.
 *   MARKS    9.5+        The full Eddy mark. 9.5 rather than 10.5: at 10 the
 *                        camera already frames a single river valley, and a
 *                        reader choosing a bank there was still looking at
 *                        anonymous dots — the marks arrived one rung after
 *                        the zoom where they are needed.
 *   NAMES    10.5+       Labels. Text still waits a rung past the marks,
 *                        because an icon reads at a distance a name does not.
 *
 * ── AND THE PLACE LAYERS FINALLY CLIMB IT ────────────────────────────────
 *
 * For a while this table described the gauge tiers and nothing else. Camping,
 * cabins, rentals, ramps and hazards drew their full 22pt mark at EVERY zoom,
 * so the layer holding fourteen thousand gauges collapsed into bubbles while
 * the ~285 places did not — the statewide view was a wall of tents with the
 * rivers underneath it. Every one of them is on the rungs now; see the family
 * index in RiverMap, which owns the COUNTS band for the access and service
 * families so that switching a layer on can no longer take pins OUT of a
 * cluster.
 *
 * A layer may sit out a rung, and two do. Hazards never cluster — a hazard must
 * not disappear into a count — and take their mark at ZOOM.cluster rather than
 * waiting for PLACES, so they resolve as soon as the bubbles break. Lakes &
 * dams keep their labels at every zoom: there are two dozen, they are
 * landmarks, and an unnamed dot cannot be told from the lake it sits on. The
 * raster has its own pair. Nothing invents a rung of its own.
 */
export const ZOOM = {
  /** Below this, statewide layers neither draw nor fetch. */
  min: 5.5,
  /** Clusters collapse into individual pins at this zoom. */
  cluster: 8,
  /** Pins gain their full mark, and dots give way to symbols. */
  places: 9.5,
  /** Labels switch on — one rung after the marks, see the ladder above. */
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

/**
 * Where the national tier's fetch budget flips from OVERVIEW to DETAIL.
 *
 * A FETCH parameter, deliberately NOT an alias for ZOOM.places. It was, and
 * that coupling meant retuning the ladder's marks rung — a purely visual
 * decision — silently moved this flip with it, changing how many gauges a
 * mid-zoom viewport requests. useViewportGauges asks for the server's full
 * page below this and the smaller detail page above it; that trade is about
 * payload size against viewport area, and it does not move when an icon does.
 */
export const GAUGE_FETCH_DETAIL_ZOOM = 10.5;


/**
 * Required attribution for the radar tiles.
 *
 * Not optional and not decorative: IEM asks for credit, and a reader looking at
 * rain on a map is owed the knowledge that Eddy did not measure it. It sits
 * behind the row's ⓘ rather than under the switch — see LayerDef.info. Declared
 * above MAP_LAYERS because the catalog reads it; the rest of the radar
 * constants stay with the tile URL further down.
 */
export const RADAR_ATTRIBUTION = 'Radar: NOAA NEXRAD via Iowa State Mesonet';

/**
 * Required attribution for the public-land boundaries.
 *
 * PAD-US is public domain and USGS asks for credit rather than requiring it —
 * which is the reason to give it, not a reason to skip it. A reader looking at
 * an ownership boundary is owed the knowledge that Eddy did not draw it.
 * Declared here for the same reason as RADAR_ATTRIBUTION above.
 */
export const PUBLIC_LAND_ATTRIBUTION = 'Boundaries: USGS PAD-US';

export const MAP_LAYERS: LayerDef[] = [
  {
    key: 'access',
    label: 'Access points',
    description: 'Put-ins and boat ramps',
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
    label: 'USGS gauges',
    // ── The map's one colour key, behind the ⓘ ────────────────────────────
    // The floating legend card was removed for covering the water it
    // explained, and the sheet's rows only teach the LAYER colours — nothing
    // on the map surface paired the condition ladder with its words until a
    // pin was tapped. One derived sentence closes that: derived from
    // CONDITION_ORDER so a new code reaches it without anyone remembering to,
    // which is the same argument CLUSTER_CONDITION_COLOR makes in RiverMap.
    info: `Rated stations wear a condition colour, graded against each river's own ladder — ${CONDITION_ORDER.map(
      (code) => conditionLabel(code),
    ).join(' · ')}. Grey means the station has no current rating.`,
    accessibilityHint: 'Live USGS readings on the water',
    tiers: ['gauges', 'allGauges'],
    // The rated tier is one statewide list; the national tier holds whatever
    // the camera holds. layerRowCount reads this and declines to add them —
    // the sum was a number that changed on every pan and meant nothing.
    scopes: { gauges: 'statewide', allGauges: 'viewport' },
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
    accessibilityHint: 'Low-water dams, strainers, and portages',
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
    accessibilityHint: 'USACE releases, lake levels, and generation',
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
    label: 'Rain radar',
    section: 'overlays',
    // ── "needs a connection" is gone, and that is not a loss ───────────────
    // It was true — radar streams tiles from a third party and an offline pack
    // cannot carry live weather — but it was answering a question nobody asks
    // while choosing layers, in the one line the row had for saying what it
    // draws. A layer that draws nothing offline is a state the map itself can
    // report if it ever needs to; a control sheet is not the place to
    // pre-emptively explain a failure that has not happened.
    description: 'Live precipitation radar',
    // The delay is disclosed with the attribution: the composite is minutes
    // behind the sky, cached on top of that, and a paddler deciding whether to
    // get off the water reads an undated image as "now" — the same misreading
    // updatedAt exists to prevent on every gauge pin.
    info: `${RADAR_ATTRIBUTION}. Radar imagery runs several minutes behind the sky.`,
    accessibilityHint: 'Live precipitation radar. Needs a connection.',
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
    section: 'overlays',
    description: 'Agency boundaries',
    // ── The caveat is BEHIND the ⓘ, and is still one tap from the fill ─────
    // "Ownership, not permission" is the entire reason this layer is allowed
    // to draw, and it is also three lines of prose. Printed under the switch it
    // pushed the rows below it off the screen and read as the sheet explaining
    // its data model rather than as a control. It is unchanged, shared with the
    // website through @eddy/types so the two maps cannot say different things
    // about the same boundaries, and it still reaches the reader — here, and in
    // the parcel callout, which is where somebody who has tapped a boundary is
    // actually asking what it means.
    info: `${PUBLIC_LAND_OWNERSHIP_NOTE} ${PUBLIC_LAND_ATTRIBUTION}.`,
    accessibilityHint: 'Shows agency ownership boundaries, not permission to access, camp, or portage',
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
    // "Camping", not "Campgrounds", and the row's own comment is why: its
    // population is every place you can sleep on the ground — access points
    // tagged `campground` and directory rows with a camping offering, whoever
    // runs them. "Campgrounds" named the smaller of those two and undersold the
    // row it labelled. The KEY stays `campgrounds`; see the note on `outfitters`
    // about what a rename would throw away.
    label: 'Camping',
    section: 'stay',
    // ── THIS ROW OWNS ALL OF CAMPING, and that is a deliberate ruling ──────
    // It already merged access points tagged `campground` with campground
    // services, so it is the one control a reader has learnt means "where do I
    // sleep on the ground". When services gained tier membership, camping could
    // have become a tier of the row below instead — and then two switches would
    // have drawn overlapping sets of the same tents. A service earns this layer
    // by having a camping OFFERING or a campground kind, whoever runs it.
    accessibilityHint: 'Places to sleep outdoors near the river',
    icon: 'bonfire-outline',
    symbol: 'campground',
    color: (c) => c.success,
  },
  {
    key: 'outfitters',
    // ── IT NAMES WHAT IT DRAWS NOW, WHICH IT DID NOT BEFORE ───────────────
    //
    // This was "River services" with two tiers, and the label carried a comment
    // refusing to be called "Services" because campgrounds are services too and
    // have their own row. That reasoning was right and it applied to a row that
    // had swallowed cabins along with canoes.
    //
    // Cabins & lodges is its own row under "Places to stay" now — where a reader
    // looking for a roof will actually find it — so this row draws rentals and
    // shuttles and nothing else, and says so. The heading above it may use the
    // broad word precisely because this row no longer does; see LAYER_SECTIONS.
    //
    // The key stays `outfitters`. It is what a phone has in AsyncStorage from
    // every release so far, and renaming it would throw away the layer choices
    // of everyone who has ever opened the sheet. See mapPreferences.
    label: 'Rentals & shuttles',
    section: 'services',
    accessibilityHint: 'Canoe, kayak, and raft rentals and shuttle services',
    // No `tiers`: with lodging promoted this row switches one layer, so
    // layerRowCount falls through to its own key. Nothing sums, which is the
    // only correct arithmetic here — a business in both rows is one place, and
    // adding the two rows' membership counts would report it twice.
    icon: 'boat-outline',
    symbol: 'outfitter',
    color: (c) => c.warm,
  },
  {
    key: 'lodging',
    label: 'Cabins & lodges',
    section: 'stay',
    // ── A ROW NOW, AND THE REASON IT WAS NOT IS SPENT ─────────────────────
    //
    // This said: "A TIER, never a row — forty-one rows of which two are geocoded
    // does not carry a top-level switch, and the question it answers ('a roof
    // rather than a tent') is a refinement of the row above."
    //
    // Both halves have expired, and the second is the important one.
    //
    // The count was computed from `type` alone. The shipped `serviceTiers` also
    // reads `services_offered`, so every outfitter that rents cabins reaches
    // this tier — 13 mapped of 81 eligible, not 2 of 41 (see W3b in
    // docs/MAPS_SHEET_SERVICE_MODEL_PLAN.md, which measured it after the
    // classifier landed). Six times the pins it was judged on.
    //
    // And "a refinement of the row above" was only true while the row above was
    // "River services". A roof is not a refinement of a canoe rental; it is an
    // answer to the question Camping answers, given differently. Filed under
    // rentals, it was reachable only by a reader who had already decided to look
    // at outfitters — which is the wrong two clicks for somebody deciding where
    // to sleep. Its neighbour is Camping, and it sits there now.
    //
    // No `tierLabel`: a row is its own context, so `label` says it once.
    accessibilityHint: 'Cabins, lodge rooms, and cottages',
    icon: 'bed-outline',
    // `symbol`, not `tierSymbol`. The mark landed while the instruction to wire
    // it as a tier's was still written above — but by then this was a ROW, and
    // `tierSymbol` is only ever drawn in a tier chip strip, which a row has
    // none of. So the map got the cabin and the layers sheet — the legend, the
    // one surface that has to teach the mark — kept the generic bed glyph.
    symbol: 'lodging',
    // ── The cabin mark distinguishes the row; colour stays neutral ────────
    // The obvious choice is a deeper step of the tan the row already wears, and
    // the secondary scale has no such step — it is 500/200/100/50, and 500 IS
    // `warm`. So this borrows the neutral stone instead, a clear step off the
    // one `publicLand` uses, which keeps it out of the condition ladder (red,
    // amber and green all mean something about water here) and out of coral
    // (reserved for the float CTA).
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
