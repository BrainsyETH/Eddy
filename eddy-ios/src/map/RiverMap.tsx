import { serviceContactActions, type ServiceContactAction } from '@/lib/serviceContactActions';
// eddy-ios/src/map/RiverMap.tsx
// The Mapbox view: every curated river drawn in its live condition colour, the
// selected one drawn brighter on top, plus whichever layers the sheet has
// switched on, plus the planned float when there is one.
//
// The network underneath is why `river` is nullable. The map used to require a
// selection and open on whichever river won a sort, which meant it could only
// show you a river you had already chosen — the opposite of what a map is for.
//
// Mapbox is reached through loadMapbox() at RENDER time rather than by importing
// components at module scope. That is what keeps this file safe to import from a
// screen that also has to work in Expo Go — see runtime.ts.
//
// ── Pin shapes ──────────────────────────────────────────────────────────────
// Every curated layer uses a compact, full-colour Eddy utility mark, plus a
// SymbolLayer of plain text when the camera has room. Condition-sensitive marks
// sit over a data-coloured badge:
//
//   gauges       a staff gauge, backed by the gauge's own condition colour
//   access       a map marker, anchored at its point
//   hazards      a warning triangle
//   campgrounds  a tent
//   outfitters   a life jacket and paddles
//   dams         a spillway wall
//
// These are generated and BUNDLED (assets/map, built by build-map-icons.py),
// rather than names borrowed from the outdoors style's sprite sheet. The
// full-colour mark says WHAT a point is; the circle beneath it retains the
// condition/severity colour that a sticker alone cannot carry. The route
// endpoints reuse those same illustrations with a different badge colour.
//
// Colour comes from src/map/layers.ts so a filter chip is literally the colour
// of the pins it toggles.
//
// ── Draw order ──────────────────────────────────────────────────────────────
// Later sources paint over earlier ones, so the order below is deliberate:
// river line, then the planned segment on top of it, then places, then
// campgrounds over places, then gauges, then hazards over everything. A hazard
// must never be hidden under a put-in.
//
// ── Label ink is not the theme's text colour ────────────────────────────────
// Mapbox's outdoors style is a LIGHT basemap in both app appearances — there is
// no dark outdoors style to switch to — so pin labels are painted in the brand's
// darkest stone with a white halo regardless of scheme. Using colors.text here
// (as this once did) put white text inside a white halo on dark mode: a map full
// of invisible labels.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MapPlacesSheet } from '@/components/MapPlacesSheet';
import { gestureStarted, pointNeedsReveal } from './mapInteraction';
import { nearestHitId, pinStacks, stackTap, type HitCandidate, type PinStack, type StackCandidate } from './pinStacks';
import { PublicLandCallout } from './PublicLandCallout';
import type {
  CampsiteAvailabilitySummary,
  Hazard,
  MapAccessPoint,
  MapSpring,
  MapGauge,
  PublicLandAccess,
  PublicLandFeature,
  PublicLandProperties,
  RiverGeometry,
  RiverService,
} from '@eddy/types';
import {
  accessPointTypes,
  hasCoordinates,
  PUBLIC_LAND_ACCESS_STYLE,
} from '@eddy/types';
import {
  hazardConditionCode,
  hazardTypeLabel,
  portageNote,
  severityLabel,
} from '@eddy/hazards';
import { conditionColor, conditionLabel } from '@/theme/conditions';
import { lightPalette, neutral, primary, type Palette } from '@/theme/palette';
import { useTheme } from '@/theme/ThemeProvider';
import { readingAge } from '@/lib/readingCopy';
import {
  gaugeConditionCode,
  gaugePlaceLabel,
  gaugeReadingText,
  gaugeRiverSlug,
} from '@/lib/gaugeCondition';
import type { NetworkCollection } from '@/lib/statewideNetwork';
import type { PlaceRiver } from '@/lib/placeRiver';
import type { MilePost } from '@eddy/geo';
import { loadMapbox, STYLE_URL } from './runtime';
import { mapAccessPointPin } from './accessPin';
import {
  GAUGE_DETAIL_ZOOM,
  MAP_LAYERS,
  MAX_RADAR_ZOOM,
  MIN_RADAR_ZOOM,
  ZOOM,
  RADAR_OPACITY,
  RADAR_TILE_URL,
  type LayerKey,
  type PinLayerKey,
} from './layers';
import { warn } from '@/lib/monitoring';
import {
  activeRoles,
  resolveAccessMarkers,
  markCues,
  ROLE_LAYER,
  type ResolvedServiceMarker,
} from '@/map/accessLayers';
import { serviceTypeLabel, type ServiceLayerKey } from '@/map/serviceLayers';
import { cameraAnimation, type MapBounds, type MapCameraCommand } from '@/map/cameraBehavior';
import type { MapCameraPadding } from './mapLayout';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export { mapAccessPointPin } from './accessPin';

/**
 * Ink for text drawn ON the map, in either app appearance.
 *
 * Warm Stone 900 rather than black: it is the brand's own darkest text colour,
 * and it sits on the outdoors style's greens and gravels without the harshness
 * of pure black. Paired with a white halo, which is what keeps it legible over
 * both forest and water.
 */
const LABEL_INK = neutral[900];
const LABEL_HALO = '#FFFFFF';

/** Which Eddy mark a layer's pins are drawn with. */
type PinShape =
  | 'dot'
  | 'drop'
  | 'pin'
  | 'hazard'
  | 'campground'
  | 'boatRamp'
  | 'outfitter'
  | 'lodging'
  | 'dam'
  | 'spring';

/**
 * The bundled map icons, and how each one sits on its coordinate.
 *
 * ANCHORING IS THE POINT OF THE DISTINCTION. A droplet is a symbol for the
 * thing, so it centres on the gauge. A map marker is a POINTER — its tip is the
 * location and its bulb is a label floating above it — so it anchors at the
 * bottom. Centre a marker and every access point sits half a pin upstream of
 * where it actually is.
 *
 * Every asset is a 66px `@3x` file, which is what makes it draw at 22pt rather
 * than 66. The density lives in the FILENAME, not in a `scale` field on the
 * registration: rnmapbox forwards that field to React Native's image loader,
 * and a native build that dropped it (2026-09) drew every place mark at 3x.
 * An `@3x` name is resolved to scale 3 by React Native itself, so there is no
 * second number to lose. Regenerate with scripts/build-map-icons.py, which
 * writes these names.
 */
const PIN_ICONS: Record<PinShape, { image: string; anchor: 'center' | 'bottom'; labelOffset: number; themed: boolean } | null> = {
  dot: null,
  drop: { image: 'eddy-gauge-map', anchor: 'center', labelOffset: 1.45, themed: true },
  // Already sitting entirely above its point, so its label needs less room than
  // a centred icon of the same height.
  pin: { image: 'eddy-access-map', anchor: 'bottom', labelOffset: 1.05, themed: true },
  hazard: { image: 'eddy-hazard-map', anchor: 'center', labelOffset: 1.4, themed: true },
  campground: { image: 'eddy-campground-map', anchor: 'center', labelOffset: 1.4, themed: true },
  // Centred, like every other Eddy mark that is a SYMBOL for the thing rather
  // than a pointer at it. Only `pin` is bottom-anchored, because only `pin` is
  // the map-marker silhouette whose tip is the location.
  boatRamp: { image: 'eddy-boat-ramp-map', anchor: 'center', labelOffset: 1.4, themed: true },
  outfitter: { image: 'eddy-outfitter-map', anchor: 'center', labelOffset: 1.4, themed: true },
  lodging: { image: 'eddy-lodging-map', anchor: 'center', labelOffset: 1.4, themed: true },
  dam: { image: 'eddy-dam-map', anchor: 'center', labelOffset: 1.4, themed: true },
  spring: { image: 'eddy-spring-map', anchor: 'center', labelOffset: 1.4, themed: true },
};

/** Which mark each pin layer wears. One table for the layers, the route
 * endpoints and the selection, so a place looks the same in all three. */
const LAYER_SHAPE: Record<PinLayerKey, PinShape> = {
  access: 'pin',
  campgrounds: 'campground',
  boatRamps: 'boatRamp',
  outfitters: 'outfitter',
  lodging: 'lodging',
  springs: 'spring',
  gauges: 'drop',
  hazards: 'hazard',
  dams: 'dam',
  allGauges: 'dot',
};

/** How far a bottom-anchored mark's badge rides up behind its bulb, in pt. */
const ACCESS_BADGE_LIFT = 11;

/** The selected place's scale, against its unselected mark. */
const SELECTED_SCALE = 1.18;

const PIN_IMAGES = {
  'eddy-gauge-map': { image: require('../../assets/map/eddy-gauge.png'), sdf: false },
  'eddy-access-map': { image: require('../../assets/map/eddy-access.png'), sdf: false },
  'eddy-hazard-map': { image: require('../../assets/map/eddy-hazard.png'), sdf: false },
  'eddy-campground-map': { image: require('../../assets/map/eddy-campground.png'), sdf: false },
  // `sdf: false` with the rest of the place marks. These are full-colour themed
  // art generated by build-map-icons.py's `themed` pass. Registering it as SDF would
  // draw it as a solid silhouette in whatever colour the layer last set.
  'eddy-boat-ramp-map': { image: require('../../assets/map/eddy-boat-ramp.png'), sdf: false },
  'eddy-outfitter-map': { image: require('../../assets/map/eddy-outfitter.png'), sdf: false },
  'eddy-lodging-map': { image: require('../../assets/map/eddy-lodging.png'), sdf: false },
  'eddy-dam-map': { image: require('../../assets/map/eddy-dam.png'), sdf: false },
  'eddy-spring-map': { image: require('../../assets/map/eddy-spring.png'), sdf: false },
  // Count badges — see PLACE_COUNT_BADGE. Full colour, never SDF: SDF would
  // flatten the face, ring and shadow into one tint.
  'eddy-count-place-map': { image: require('../../assets/map/count-place.png'), sdf: false },
  'eddy-count-place-wide-map': { image: require('../../assets/map/count-place-wide.png'), sdf: false },
  'eddy-count-usgs-map': { image: require('../../assets/map/count-usgs.png'), sdf: false },
  'eddy-count-usgs-wide-map': { image: require('../../assets/map/count-usgs-wide.png'), sdf: false },
  'eddy-count-stack-map': { image: require('../../assets/map/count-stack.png'), sdf: false },
  'eddy-count-stack-usgs-map': { image: require('../../assets/map/count-stack-usgs.png'), sdf: false },
};

/** iOS emits this even when addMissingImageToStyle starts a native reload.
 * The callback is not proof of a failed asset. Keep unknown keys actionable;
 * registered keys get a truthful dev diagnostic instead of a false failure.
 */
function onPinImageMissing(name: string) {
  if (Object.prototype.hasOwnProperty.call(PIN_IMAGES, name)) {
    if (__DEV__) console.info(`[map] pin image "${name}" registered but not yet available to the style`);
    return;
  }
  warn('map', `unregistered pin image "${name}" — check the image catalog`);
}

/**
 * The palette map marks are painted from: the LIGHT one, in both appearances.
 *
 * The basemap is light in both schemes (see "Label ink" above), and the
 * catalog's dark-scheme layer colours are pale tints chosen for charcoal
 * sheets. Painted on a light map with a white ring they lost their edge — a
 * selected dam's pale-teal badge vanished against its own lake. The sheets
 * keep the scheme-aware tints; the map keeps one set of marks.
 */
const MAP_PAINT: Palette = lightPalette;

/**
 * A layer's map colour, from the single catalog every surface reads, always
 * resolved against MAP_PAINT. Module scope: a pure lookup with no reason to be
 * rebuilt per render.
 */
function layerColorFor(key: LayerKey): string {
  return MAP_LAYERS.find((l) => l.key === key)!.color(MAP_PAINT);
}

/** What a source draws when it has nothing to draw. See the note in the render. */
const EMPTY_COLLECTION = { type: 'FeatureCollection' as const, features: [] };

// ── Public land paint ───────────────────────────────────────────────────────
//
// The table itself is PUBLIC_LAND_ACCESS_STYLE in @eddy/types, shared with the
// website so the same federal dataset cannot mean two different things on the
// two maps. What is local is the EXPRESSION shape, because Mapbox's native
// dialect and MapLibre's are written separately even where they agree.
//
// `['get', 'access']` bare: the API normalises the field — upper-case, never
// null, 'UK' when the agency did not classify it — so neither client needs a
// coalesce or an upcase, and neither can get one subtly wrong.
const PUBLIC_LAND_ACCESS_ORDER: PublicLandAccess[] = ['OA', 'RA', 'XA', 'UK'];

/** A `match` over the access classes, defaulting to the unknown treatment. */
function accessMatch(pick: (code: PublicLandAccess) => string): unknown[] {
  const arms: string[] = [];
  for (const code of PUBLIC_LAND_ACCESS_ORDER) arms.push(code, pick(code));
  // The default arm is not a nicety: PAD-US gains codes without asking us, and
  // an unrecognised one has to draw as "unknown" — never as open.
  return ['match', ['get', 'access'], ...arms, pick('UK')];
}

/**
 * Count badges: every number on the map, in one of two faces.
 *
 * The web planner's numbered marker (globals.css `.planner-marker-face`) — a
 * rounded square, a 2pt ring, a hard offset shadow — drawn as map art by
 * scripts/build-map-icons.py. Two faces and no third:
 *
 *   place — white, Deep River Teal ring. Eddy's own layers: rated gauges,
 *           the place families, dams, and the numbered stacks.
 *   usgs  — parchment, charcoal ring. The USGS reference tier, the same face
 *           the web gives its reference clusters.
 *
 * ── A count wears no condition colour ──────────────────────────────────────
 * Rated clusters used to be painted with the worst verdict inside them. That
 * made the colour of a count mean two different things — a verdict on one
 * badge, a layer's category on the badge beside it — and a red square reading
 * "12" still could not say which of the twelve was in flood. The verdict lives
 * where it can be acted on: the coloured river lines at every zoom, and the
 * individual pins once a tap or a pinch breaks the cluster.
 *
 * Badges are full-colour images, not circles, because Mapbox has no square
 * primitive; the number is the symbol's text, so one image serves every count.
 * Module constants, because a fresh array per render is a style prop that never
 * compares equal — a native paint update for a value that never changes.
 *
 * ── ONE LAYER: THE BADGE AND ITS NUMBER ARE THE SAME SYMBOL ────────────────
 * The image and the number were first two SymbolLayers, badge then count, the
 * way the circle bubbles had been. On device every badge drew and no number
 * did — the count layer evidently reached the native style beneath the badge
 * layer, and an opaque face covers whatever is under it. Within ONE symbol
 * layer Mapbox always draws a symbol's text over its own icon, so the stacking
 * cannot depend on the order layers reach the style.
 */
/**
 * The `clusterMaxZoomLevel` every clustered source takes.
 *
 * Mapbox clusters on every TILE zoom up to and including this value, and a
 * camera at 8.6 still draws z8 tiles — so a source given ZOOM.cluster kept its
 * counts until z9, a whole level after the family index (a layer capped at
 * ZOOM.cluster) had already broken into dots. One below the rung makes every
 * count on the map break at the same moment.
 */
const NATIVE_CLUSTER_MAX_ZOOM = ZOOM.cluster - 1;

const COUNT_INK = primary[900];
const USGS_COUNT_INK = neutral[900];

const countBadgeStyle = (face: 'place' | 'usgs', ink: string) => ({
  // Three-character counts ("100", "1.2k") take the 40pt face, not the 28pt one.
  iconImage: ['step', ['get', 'point_count'], `eddy-count-${face}-map`, 100, `eddy-count-${face}-wide-map`],
  textField: ['get', 'point_count_abbreviated'],
  textSize: 12,
  // Dark ink on a solid face needs no halo.
  textColor: ink,
  // A count that collision detection drops is a cluster that silently
  // vanishes, and a badge with no number lies about being one place. Neither
  // half of the symbol may be dropped, and neither may push anything else.
  iconAllowOverlap: true,
  iconIgnorePlacement: true,
  textAllowOverlap: true,
  textIgnorePlacement: true,
});
const PLACE_COUNT_BADGE = countBadgeStyle('place', COUNT_INK);
const USGS_COUNT_BADGE = countBadgeStyle('usgs', USGS_COUNT_INK);

/**
 * What onMapIdle hands back, structurally.
 *
 * @rnmapbox/maps calls this MapState but does not re-export it from the package
 * root, and this file deliberately never imports Mapbox at module scope (see
 * runtime.ts) — reaching into lib/typescript/... for a type would be a path we
 * do not control. Declared structurally instead, the same way onPress types its
 * own event, and every field is optional because the only cost of a shape
 * change upstream should be no fetch, not a crash on a river.
 */
type MapIdleState = {
  properties?: {
    center?: number[];
    bounds?: { ne?: number[]; sw?: number[] };
    zoom?: number;
  };
  gestures?: { isGestureActive?: boolean };
};

type RenderedFeature = { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: number[] } };
interface MapQueryRef {
  getPointInView: (coordinate: number[]) => Promise<number[]>;
  queryRenderedFeaturesInRect: (box: number[], filter?: unknown[], layers?: string[]) => Promise<{ features: RenderedFeature[] } | undefined>;
}
interface ClusterSourceRef { getClusterExpansionZoom: (feature: RenderedFeature) => Promise<number>; }

interface MapCameraRef {
  setCamera: (stop: {
    centerCoordinate?: [number, number];
    bounds?: { ne: [number, number]; sw: [number, number] };
    zoomLevel?: number;
    padding?: { paddingTop: number; paddingBottom: number; paddingLeft: number; paddingRight: number };
    animationMode?: 'easeTo' | 'none';
    animationDuration?: number;
  }) => void;
}

export type InitialMapCamera =
  | { type: 'center'; lng: number; lat: number; zoom: number }
  | { type: 'bounds'; bounds: MapBounds };

/**
 * Where the map sits before it knows anything.
 *
 * Mirrors DEFAULT_MAP_CENTER / DEFAULT_MAP_ZOOM in the website's
 * src/constants/index.ts, so a cold app and a cold browser open on the same
 * piece of Missouri. Zoom 6.2 rather than the web's 7 because a phone screen is
 * narrower than a browser window and has to fit the same state.
 */
const COLD_START_CENTER: [number, number] = [-91.5, 37.5];
const COLD_START_ZOOM = 6.2;

/**
 * A point the map can draw and hand back when tapped.
 *
 * Everything past `coordinates` exists for the CALLOUT rather than the pin. A
 * tapped hazard that says "Mile 41" and nothing else is a worse answer than no
 * callout at all — the layer's entire job is telling you what is in the water —
 * so each pin carries the sentence it would want to say. Building that here,
 * where the source objects are, keeps the callout a dumb renderer and stops it
 * growing a branch per layer.
 */
export interface MapPin {
  id: string;
  name: string;
  layer: LayerKey;
  subtitle: string | null;
  coordinates: { lng: number; lat: number };
  /**
   * What the map draws under the pin, when that differs from `name`.
   *
   * Only gauges use it, and only because their names are built for a database
   * rather than for a map — see gaugePlaceLabel. Everything else labels itself
   * with the name it is called, and the callout always shows `name` in full.
   */
  label?: string;
  /** Overrides the layer colour. A gauge wears its own condition, not teal. */
  color?: string;
  /**
   * sqrt(discharge), for the reference-gauge layer's radius. Magnitude only —
   * a big dot means a lot of water, never a dangerous river.
   */
  magnitude?: number | null;
  /** Condition or severity code, for a tinted chip in the callout. */
  code?: string;
  codeLabel?: string;
  /** The headline number: a gauge's reading, in its own unit. */
  value?: string | null;
  /** Prose — a hazard's description, a service's blurb, a gauge's qualifier. */
  body?: string | null;
  /**
   * The one thing on this pin that tells you to DO something.
   *
   * Today that is a hazard's portage note, and it used to be joined onto the
   * front of `body` — so the only instruction Eddy ever gives a paddler was
   * rendered by the slot built for descriptions: muted grey, body weight,
   * directly above two more paragraphs written in the same ink. Sorting it
   * first inside a joined string is not rank; it is a hope that the reader
   * notices the first sentence.
   *
   * Its own field for exactly the reason `availability` became one — the note
   * on that field says a fact smuggled through a renderer meant for prose is a
   * data-path bug rather than a styling one, and this is the same bug in the
   * same file.
   */
  instruction?: string | null;
  /**
   * Live campsite availability, for a campground pin that has any.
   *
   * Its own field rather than a line prepended to `body`, so the callout can
   * give it the rank it deserves instead of the prose slot's muted grey. Null
   * is the common case and is emphatically not "full".
   */
  availability?: CampsiteAvailabilitySummary | null;
  /** A river to open from the callout, when the pin belongs to one. */
  riverSlug?: string | null;
  /**
   * The station this pin is, for the gauge screen. Gauges of both tiers.
   *
   * The provider-native site id, NOT the gauge_stations uuid in `id` — every
   * per-gauge route keys off the former. Null for a station carrying neither id
   * column, which is a real case (a USACE dam) and one where no gauge screen can
   * be opened at all.
   */
  siteId?: string | null;
  /**
   * The USACE project this pin is, for the dam screen.
   *
   * SEPARATE from `siteId` rather than overloading it, for two reasons. That
   * field is documented as the key every per-GAUGE route uses, and routing on
   * it would send a dam pin to the gauge screen. And Stockton and Truman have
   * no gauge_stations row at all — they publish nothing to CWMS and exist as
   * SWPA schedule entries — so they have a dam id and no site id, which is
   * exactly the pair a single field could not express.
   */
  damId?: string | null;
  /**
   * When the reading under this pin was TAKEN, pre-composed.
   *
   * Its own field rather than more subtitle, and drawn in the callout's footer,
   * because it qualifies everything above it rather than continuing the
   * identification line. The national tier had no age anywhere — a reading with
   * no date on it invites you to assume it is current, and for a station the
   * hourly sync last touched at :20 that is a guess the pin was making on the
   * reader's behalf.
   */
  updatedAt?: string | null;
  /** Tap-to-call or tap-to-book. Never fabricated: null when there is no number. */
  link?: { label: string; url: string } | null;
  contactLinks?: ServiceContactAction[];
  /**
   * One photograph of the place, when there is one.
   *
   * BEST FIRST, and only the first: a callout is an identification, not a
   * gallery — the detail screen behind `detailRoute` holds the rest. It earns
   * the space it takes because "Cedar Grove Access" is a name and a picture of
   * a gravel ramp with room for two cars is the thing that tells you whether
   * you can get a trailer down it.
   *
   * Coverage is partial and always will be, so every layout using this has to
   * read as normal without it rather than as a photo that failed to load.
   */
  imageUrl?: string | null;
  /**
   * Where the callout's "open" action goes, for pins that have a screen.
   *
   * Distinct from `riverSlug`, which opens the RIVER a pin sits on. This is the
   * pin itself. Access points had neither, so the map was a dead end for the
   * layer it opens on: the detail screen existed and was reachable only by
   * finding the same put-in again in the river screen's list.
   */
  detailRoute?: string | null;
  /** True when an access location requires permission rather than being public. */
  privateAccess?: boolean;
}

/**
 * The selected river, as this component uses it.
 *
 * `geometry` is optional and usually unnecessary: the statewide network already
 * carries every curated river's line, painted per reach by the gauge that
 * watches it, and drawing a second full-resolution copy over the top would
 * flatten that back to one colour. It is here for the river the network does
 * not have — which is a data gap, not a normal state.
 */
export interface MapRiver {
  slug: string;
  name?: string;
  geometry?: RiverGeometry | null;
  /** [w, s, e, n], for the camera. */
  bounds?: [number, number, number, number];
}

/**
 * An access point and the river it belongs to.
 *
 * MapAccessPoint itself carries no river — the endpoint that serves it is
 * already river-scoped, so it never had to. The map's access layer is not, any
 * more, so the pairing has to be explicit here.
 */
export interface MapPinAccessPoint {
  point: MapAccessPoint;
  /** Null means "whichever river is drawn", for a per-river response. */
  riverSlug?: string | null;
}

/**
 * One service, one pin, whichever tier of the River services row draws it.
 *
 * ── THE TIERS OVERLAP; THE PINS MUST NOT ────────────────────────────────
 * An outfitter that rents cabins is in BOTH tiers — that is the whole point
 * of `serviceTiers` returning a set — so drawing each tier independently
 * would put two pins on one coordinate, which is exactly the failure
 * `drawnAsAccessPoint` exists upstream to prevent. The lodging tier therefore
 * drops whatever the rentals tier is currently drawing, the same way
 * `allGauges` drops the curated stations so a rated gauge is never drawn
 * twice.
 *
 * The id is canonical — `service:{id}`, not the tier's name — so a selected
 * pin survives the reader toggling tiers underneath it. Same reasoning as the
 * campgrounds layer keeping `access:{id}` while presenting a put-in as a tent.
 *
 * Exported, like the builders below it, so a search result opens the exact
 * callout a tap would.
 */
export function mapServicePin(
  marker: ResolvedServiceMarker,
  layer: 'outfitters' | 'lodging',
): MapPin {
  const s = marker.service;
  return {
    id: `service:${s.id}`,
    name: s.name,
    layer,
    // ── AND THE ROWS THIS MARK IS HIDING ───────────────────────────────
    //
    // Resolving ownership across the three tiers stopped a place drawing
    // twice and, on its own, would have made it draw once while saying
    // nothing about the row it stopped answering: a canoe outfitter that also
    // rents cabins wore a canoe and the cabins vanished. That is the same
    // defect the access family's caption was fixed for, arriving in the
    // service family by the same mechanism.
    //
    // `serviceTypeLabel` still leads — it says what the BUSINESS is, which is
    // finer than the tier, so `markCues` is asked only for what the mark
    // is hiding. See its header for why that is not symmetric with roleCues.
    subtitle: [
      serviceTypeLabel(s),
      ...markCues(marker.layers, marker.owner),
      [s.city, s.state].filter(Boolean).join(', '),
    ]
      .filter(Boolean)
      .join(' · '),
    coordinates: { lng: s.longitude as number, lat: s.latitude as number },
    body: s.description,
    contactLinks: serviceContactActions(s),
  };
}

/**
 * A directory campground's pin — the tent a service wears on the Camping
 * layer. Exported for the same search-parity reason as mapServicePin above.
 *
 * ── ONE ID NAMESPACE FOR A SERVICE, WHATEVER MARK IT WEARS ─────────────────
 * This was `camp-service:{id}` while rentals and lodging used `service:{id}`,
 * so one directory row had two identities and the branches could each draw it
 * without noticing the other. Canonical now, exactly as the access family
 * keeps `access:{id}` through a change of mark — so a selection survives
 * toggling the layer underneath it.
 *
 * ── The subtitle NAMES THE ROWS THIS TENT IS HIDING ────────────────────────
 * No type label leads here — the tent has already said "campground" — so the
 * cues lead instead. A campground that also rents cabins reads
 * `Camp · Cabins · Salem, MO` rather than drawing a tent and letting the
 * cabins vanish, which is what resolving ownership across the three tiers
 * would otherwise have cost.
 *
 * ── Availability is a FIELD, not a paragraph ───────────────────────────────
 * It used to be joined onto the front of `body`, which meant the one fact
 * that decides whether you care was rendered by the callout's prose slot:
 * muted grey, clipped at four lines, glued to a description written last
 * season. That was a data-path bug, not a styling one. This is still where a
 * Missouri State Park's inventory surfaces at all — campsite_facilities hangs
 * off a nearby_services row, so a state park reaches the map through here or
 * nowhere.
 */
export function mapCampgroundServicePin({
  service: s,
  layers: serviceLayers,
}: Pick<ResolvedServiceMarker, 'service' | 'layers'>): MapPin {
  return {
    id: `service:${s.id}`,
    name: s.name,
    layer: 'campgrounds' as const,
    subtitle: [
      ...markCues(serviceLayers),
      [s.city, s.state].filter(Boolean).join(', '),
      s.managingAgency,
    ]
      .filter(Boolean)
      .join(' · '),
    coordinates: { lng: s.longitude as number, lat: s.latitude as number },
    availability: s.availability ?? null,
    body: s.description ?? null,
    contactLinks: serviceContactActions(s),
  };
}

/**
 * The canonical presentation object for a CURATED gauge.
 *
 * Exported for the same reason mapAccessPointPin is: a search result has to
 * open the exact callout a tap on the pin would, and two builders would be two
 * shapes. The caller filters on hasCoordinates first, as the gauge layer does.
 */
export function mapGaugePin(g: MapGauge): MapPin {
  const code = gaugeConditionCode(g);
  return {
    id: `gauge:${g.id}`,
    name: g.name,
    // "Van Buren, MO", not "Current River at Van Buren, MO". These labels
    // are drawn from ZOOM.places up (see pinLayer), and at statewide zoom a
    // full station name is a paragraph laid across the river it names.
    label: gaugePlaceLabel(g.name),
    layer: 'gauges' as const,
    // The site id is dropped rather than printed when the station has none
    // — "USGS null" under a pin is worse than a subtitle that is only a
    // name. The age lives in the callout footer, so a rated gauge and a
    // reference gauge date their readings the same way instead of one
    // burying it in an identification line and the other not stating it.
    subtitle: g.usgsSiteId ? `USGS ${g.usgsSiteId}` : null,
    coordinates: g.coordinates,
    color: conditionColor(code),
    code,
    codeLabel: conditionLabel(code),
    value: gaugeReadingText(g),
    // The qualifier note is the reason the pin is grey. Saying so beats a
    // colourless dot with no explanation.
    body: g.qualifierNote,
    riverSlug: gaugeRiverSlug(g),
    siteId: g.usgsSiteId,
    updatedAt: readingAge(g.readingAgeHours),
  };
}

/**
 * The canonical presentation object for a spring.
 *
 * ── THE CALLOUT HAS TO SAY HOW WELL EDDY KNOWS WHERE THIS IS ─────────────
 *
 * Eddy holds springs from two sources at two precisions. A `surveyed` position
 * was placed by hand. A `derived` one was interpolated along the river line
 * from a printed river mile — accurate to roughly the spacing of the access
 * points either side of it, which is a couple of hundred metres at best and
 * over a mile at worst. Drawn identically, the second borrows the first's
 * credibility, and the reader who paddles to it finds nothing and concludes the
 * map is wrong rather than approximate.
 *
 * So the caveat goes in `instruction`, the one slot on this pin whose whole
 * documented purpose is a fact that must not be rendered as prose. That field
 * was built for a hazard's portage note, and this is the same kind of thing:
 * not a description of the spring, but something the reader has to act on
 * before trusting the coordinate.
 *
 * The private note rides in the same slot and for the same reason — "you may
 * not land here" is not a description either — and both are shown when both
 * apply, because a private spring in the wrong place is two surprises.
 */
export function mapSpringPin(s: MapSpring & PlaceRiver): MapPin {
  const notes: string[] = [];
  if (s.positionSource === 'derived') {
    notes.push(
      s.positionBracketMiles != null && s.positionBracketMiles > 0
        ? `Approximate position — placed from the river mile printed in the float ` +
          `guide, between access points ${Math.round(s.positionBracketMiles)} miles apart.`
        : 'Approximate position — placed from the river mile printed in the float guide.',
    );
  }
  if (s.isPrivate) {
    notes.push('On private ground. Visible from the water; not somewhere to land.');
  }

  return {
    id: `spring:${s.id}`,
    name: s.name,
    layer: 'springs' as const,
    subtitle: [
      // The river first: "Mile 12" means nothing until it says of what. The
      // tag comes from where the spring was stored — see lib/placeRiver.ts.
      s.riverName ?? null,
      s.riverMile != null ? `Mile ${s.riverMile}` : null,
      // "Approximate" earns a place in the SUBTITLE as well as the note. The
      // subtitle is what a reader skims before deciding to open anything, and
      // the distinction this pin turns on should not need a tap to reach.
      s.positionSource === 'derived' ? 'Approximate' : null,
    ]
      .filter(Boolean)
      .join(' · ') || null,
    coordinates: s.coordinates,
    instruction: notes.length > 0 ? notes.join('\n\n') : null,
    body: s.description,
    // What puts "View river" on the callout.
    riverSlug: s.riverSlug ?? null,
  };
}

/**
 * The canonical presentation object for a hazard. Exported for search, like
 * the two builders above it — found by name or tapped on the map, one shape.
 */
export function mapHazardPin(h: Hazard & PlaceRiver): MapPin {
  const code = hazardConditionCode(h.severity);
  return {
    id: `hazard:${h.id}`,
    name: h.name,
    layer: 'hazards' as const,
    // Which river, as the spring pin above says it. A hazard found from the
    // statewide map is a reason to choose a different river, so it has to
    // say which one. Still no Directions: see sheetActions.
    subtitle: [hazardTypeLabel(h.type), h.riverName ?? null, h.riverMile ? `Mile ${h.riverMile}` : null]
      .filter(Boolean)
      .join(' · '),
    riverSlug: h.riverSlug ?? null,
    coordinates: h.coordinates,
    // Severity, not one flat red. A `caution` shoal and a low-water dam
    // are both hazards and they are not the same news.
    color: conditionColor(code),
    code,
    codeLabel: severityLabel(h.severity),
    // ── THE PORTAGE IS NOT A DESCRIPTION ─────────────────────────────
    // Its own field, drawn as its own block — being first in a string
    // handed to the prose renderer bought nothing but position. Same
    // correction the availability line already got. See MapPin.
    instruction: portageNote(h),
    body: [h.description, h.seasonalNotes].filter(Boolean).join('\n\n') || null,
  };
}

interface Props {
  /** Measured floating chrome/sheet insets; applied only on explicit moves. */
  cameraPadding: MapCameraPadding;
  /** Separate from padding: even a closed sheet has an attribution inset. */
  sheetReady: boolean;
  /** SDK-relative margins for full sheet coverage, with native safe areas removed. */
  ornamentBottomInset?: number;
  ornamentLeftInset?: number;
  /**
   * The river in focus, or NULL when the map is showing the network and the
   * user has not picked one yet. Null is the opening state now, not an error:
   * everything river-scoped below simply does not render.
   *
   * FOUR FIELDS, not a RiverDetail. The screen no longer fetches
   * /api/rivers/{slug} on selection — it reads the river out of the statewide
   * dataset already in memory — and this component only ever wanted a slug to
   * match on, an extent to frame, and a line for the rare case the network is
   * missing that river.
   */
  river: MapRiver | null;
  /**
   * Mile posts along the selected river, computed by the screen (see
   * riverMilePosts there — the length only the river list knows). Null when
   * no river is selected or its length is not in hand; the source stays
   * mounted and empties, per the teardown rule every source here follows.
   */
  milePosts?: MilePost[] | null;
  /** Live condition code, used only for the line colour. */
  conditionCode: string;
  /** Every curated river, condition-coloured. Drawn under the selected one. */
  network?: NetworkCollection | null;
  /**
   * A river line was tapped, with WHERE it was tapped when the event carried it.
   *
   * The coordinate is what lets the caller keep the reader on the stretch they
   * pointed at instead of framing the whole river out from under them.
   */
  onSelectRiverSlug?: (slug: string, at?: { lng: number; lat: number }) => void;
  /**
   * Every access point to draw, each tagged with the river it is on.
   *
   * Tagged rather than bare, because this is no longer the selected river's
   * list: the map draws the whole network's put-ins before anything is
   * selected, and a pin's detail route is built from ITS river. A null slug
   * falls back to the drawn river, which is what a per-river response supplies.
   */
  accessPoints: MapPinAccessPoint[];
  gauges: MapGauge[];
  /**
   * The national tier, already converted to pins by the screen. Drawn CLUSTERED
   * and UNDER the curated gauges — see contextGaugeLayer.
   */
  referenceGauges?: MapPin[];
  /**
   * The USACE projects, already converted to pins by the screen — same
   * arrangement as referenceGauges, and for the same reason: they come from a
   * statewide fetch this component does not own.
   */
  dams?: MapPin[];
  /**
   * PAD-US parcels for the current viewport, fetched by the screen.
   *
   * OWNERSHIP, NOT PERMISSION. A polygon here says a public agency owns the
   * ground and says nothing about a right to land, camp or portage; the layer
   * sheet carries the sentence and the callout repeats it. Nothing in this
   * component may treat one as an access grant.
   */
  publicLands?: PublicLandFeature[];
  /**
   * Fired when the camera settles, so the caller can fetch the new viewport.
   *
   * onMapIdle rather than onCameraChanged: idle fires once when motion stops
   * and hands over bounds and zoom directly, where onCameraChanged fires every
   * frame and would need throttling before it could be used at all.
   */
  onViewportChange?: (viewport: {
    bounds: [number, number, number, number];
    zoom: number;
    /**
     * Where the camera settled, when the event carried it. What the screen
     * remembers for the next launch — see mapCamera.ts. Optional because it
     * comes off a native event: a shape without it must still fetch.
     */
    center?: [number, number];
  }) => void;
  /** A tapped cluster: the caller issues a one-shot closer camera command. */
  onZoomToCluster?: (point: { lng: number; lat: number; zoom?: number }) => void;
  hazards: Hazard[];
  /**
   * Named springs, from the offline bundle rather than a request.
   *
   * Statewide like hazards and access points: springs reach the phone in the
   * launch bundle (see useNetworkPlaces), so this is a read of what is already
   * on disk and the layer costs the map no network at all.
   */
  springs: MapSpring[];
  services: RiverService[];
  /** Which layers are switched on. Anything absent is not fetched into GeoJSON. */
  layers: LayerKey[];
  /** Used only for the map's first native camera settings. */
  initialCamera?: InitialMapCamera | null;
  /** A navigation request applied exactly once, identified by its monotonic id. */
  cameraCommand?: MapCameraCommand | null;
  /**
   * This command will never be acted on again — drop it.
   *
   * Fired when a command is applied AND when a gesture cancels one still waiting
   * for the sheet. Both are "consumed"; the distinction does not survive out
   * here, and the caller's job is the same either way.
   *
   * ── Why the caller has to clear it, and a ref could not ────────────────────
   *
   * `appliedCommandId` is a ref, so it dies with this component. The command
   * itself lives in the screen's state and does not. A remount — which happens
   * whenever the statewide collection momentarily empties and the screen swaps
   * this map for its spinner — therefore came back with an empty applied-id and
   * a still-populated command, and replayed the last navigation over wherever
   * the reader had since moved to.
   */
  onCameraCommandConsumed?: (id: number) => void;
  /**
   * The reader has touched the map. Fired once, on the first gesture only.
   *
   * Latched rather than live because the thing it guards against is late: an
   * opportunistic camera move deciding, half a second after the reader panned
   * and lifted their finger, that nobody was using the map. `isGestureActive` is
   * false by then and answers a different question — whether a finger is down
   * NOW, not whether one ever was.
   */
  onUserGesture?: () => void;
  /**
   * Draw the blue dot. Only ever true once the user has granted location, which
   * the screen asks for on an explicit tap — see useLocation.
   */
  showUserLocation?: boolean;
  /** The planned float, drawn over the river line. */
  planRoute?: RiverGeometry | null;
  planEndpoints?: { putIn: MapAccessPoint; takeOut: MapAccessPoint | null } | null;
  /** The open callout's pin, used only to give its map mark a selected state. */
  selectedPinId?: string | null;
  /**
   * The open callout's pin ITSELF, which the selection layer draws when this
   * map no longer holds it — its layer switched off, or a place opened before
   * any layer drew it. A pin this map does hold is drawn from its own, fresher
   * copy instead.
   */
  selectedPin?: MapPin | null;
  onSelectPin?: (pin: MapPin) => void;
  onBackgroundPress?: () => void;
  placesListOpen?: boolean;
  onClosePlacesList?: () => void;
  /**
   * The camera as of its last stop. Overlapping places are grouped into
   * numbered stacks at this zoom, and the places list reads its bounds.
   */
  visibleViewport?: { bounds: MapBounds; zoom: number };
}

/**
 * GeoJSON for one layer, or for one FAMILY of layers.
 *
 * `color` is written onto every feature, not just the ones that override it, so
 * the paint expression can be a flat `['get','color']` rather than a `case` that
 * has to test for the property's presence.
 *
 * ── WHY defaultColor MAY BE A FUNCTION ───────────────────────────────────
 *
 * Every source here used to hold exactly one layer, so one colour covered the
 * whole collection. The family index sources below hold three layers at once —
 * put-ins, tents and ramps in one clustered source — and a lone campground at
 * statewide zoom has to stay green rather than take the family's teal, or the
 * dot stops being the legend the layers sheet promises. Passed the pin, a
 * caller can answer per feature; passed a string, nothing changes.
 */
function featureCollection(
  pins: MapPin[],
  defaultColor: string | ((pin: MapPin) => string),
  excludedIds?: ReadonlySet<string>,
) {
  return {
    type: 'FeatureCollection' as const,
    features: (excludedIds ? pins.filter(pin => !excludedIds.has(pin.id)) : pins).map((pin) => ({
      type: 'Feature' as const,
      id: pin.id,
      properties: {
        id: pin.id,
        name: pin.name,
        label: pin.label ?? pin.name,
        color:
          pin.color ?? (typeof defaultColor === 'string' ? defaultColor : defaultColor(pin)),
        magnitude: pin.magnitude ?? 0,
        privateAccess: pin.privateAccess ?? false,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [pin.coordinates.lng, pin.coordinates.lat],
      },
    })),
  };
}

export function RiverMap({
  cameraPadding,
  sheetReady,
  ornamentBottomInset = 0,
  ornamentLeftInset = 0,
  river,
  milePosts,
  conditionCode,
  network,
  onSelectRiverSlug,
  accessPoints,
  gauges,
  referenceGauges,
  dams,
  publicLands,
  onViewportChange,
  onZoomToCluster,
  hazards,
  springs,
  services,
  layers,
  initialCamera,
  cameraCommand,
  onCameraCommandConsumed,
  onUserGesture,
  showUserLocation,
  planRoute,
  planEndpoints,
  selectedPinId,
  selectedPin,
  onSelectPin, onBackgroundPress, placesListOpen, onClosePlacesList, visibleViewport,
}: Props) {
  const Mapbox = loadMapbox();
  const { colors } = useTheme();

  const lineFeature = useMemo(
    () =>
      river ? { type: 'Feature' as const, properties: {}, geometry: river.geometry } : null,
    [river],
  );

  const routeFeature = useMemo(
    () =>
      planRoute && planRoute.coordinates?.length
        ? { type: 'Feature' as const, properties: {}, geometry: planRoute }
        : null,
    [planRoute],
  );

  // Read out of the object BEFORE the memo rather than reached through it
  // inside one. `river` is replaced wholesale on every river change while this
  // memo only cares about the slug, and the React Compiler cannot preserve the
  // memoization when the dependency is an optional chain.
  const riverSlug = river?.slug ?? null;

  // ── Pins, one array per layer ─────────────────────────────────
  /**
   * Whether each place-layer is drawing, as booleans the memos below can depend
   * on without depending on the whole `layers` array — so toggling the radar or
   * the public-land overlay does not rebuild three hundred access features.
   */
  const accessLayerOn = layers.includes('access');
  const campgroundLayerOn = layers.includes('campgrounds');
  const boatRampLayerOn = layers.includes('boatRamps');
  const outfitterLayerOn = layers.includes('outfitters');
  const lodgingLayerOn = layers.includes('lodging');

  /**
   * The access family's live layers, in the vocabulary the resolver speaks.
   *
   * The keys come from ROLE_LAYER rather than being typed out again, so the one
   * place a layer key becomes a role stays one place — see accessLayers.ts.
   */
  const accessRoles = useMemo(() => {
    const on: string[] = [];
    if (accessLayerOn) on.push(ROLE_LAYER.access);
    if (campgroundLayerOn) on.push(ROLE_LAYER.campground);
    if (boatRampLayerOn) on.push(ROLE_LAYER.boatRamp);
    return activeRoles(on);
  }, [accessLayerOn, campgroundLayerOn, boatRampLayerOn]);

  /**
   * ── ONE MEMO PER LAYER, not one for all six ───────────────────────────────
   *
   * These were a single memo returning all five arrays, keyed on every input
   * any of them used. So a change to ONE layer rebuilt the features for all of
   * them — and every rebuilt array is a new object identity, which is a fresh
   * upload of that layer's pins across the bridge. Selecting a river re-sent
   * 313 access-point features that had not changed; a gauge refresh re-sent
   * every hazard.
   *
   * Split, each layer's features survive a change to any other layer's data.
   * The combined object below is reassembled from the five and stays cheap: it
   * holds references, not features.
   *
   * ── THE ACCESS FAMILY IS THE ONE EXCEPTION, and it has to be ─────────────
   *
   * Access points, campgrounds and boat ramps are not three populations. They
   * are ONE population under three questions, and which mark a place wears
   * depends on which of the three are switched on — so they cannot be derived
   * independently without the three filters disagreeing, which is exactly what
   * they did. One resolver call answers membership, visibility and ownership
   * together (accessLayers.ts) and the three arrays are grouped out of its
   * result. Gauges, hazards, outfitters and lodging keep their own memos and
   * their own independence.
   */
  /**
   * The service layers that are live, in the resolver's vocabulary.
   *
   * Passed alongside the roles so ONE call answers ownership for both families.
   * Rentals and lodging used to filter the directory themselves; that is what
   * let a campground with canoes draw twice — see SERVICE_MARK_PRIORITY.
   */
  const liveServiceLayers = useMemo(() => {
    const on = new Set<ServiceLayerKey>();
    if (campgroundLayerOn) on.add('campgrounds');
    if (outfitterLayerOn) on.add('outfitters');
    if (lodgingLayerOn) on.add('lodging');
    return on;
  }, [campgroundLayerOn, outfitterLayerOn, lodgingLayerOn]);

  const accessFamily = useMemo(
    () => resolveAccessMarkers({ accessPoints, services }, accessRoles, liveServiceLayers),
    [accessPoints, services, accessRoles, liveServiceLayers],
  );

  /**
   * The put-ins wearing the generic access mark.
   *
   * Each point carries its OWN river, because this layer is no longer one
   * river's put-ins — it is every river's, drawn before anything is selected.
   * Using the drawn river's slug for all of them, which is what this did when
   * the list could only ever be one river's, would send a tap on a Meramec
   * landing to /river/current-river/access/... — a 404 dressed as a detail
   * screen. `riverSlug` remains the fallback for a point with no river of its
   * own, which is what a live per-river response still produces.
   */
  const accessPins = useMemo(
    () =>
      accessFamily.markers
        .filter((marker) => marker.owner === 'access')
        .map(({ entry }) =>
          mapAccessPointPin(entry.point, entry.riverSlug ?? riverSlug, 'access'),
        ),
    [accessFamily, riverSlug],
  );

  /**
   * The put-ins wearing the ramp mark.
   *
   * A ramp is an access point that has been handed over to its own mark while
   * that tier is on, which is the same handover the campgrounds layer has
   * performed since it existed — one place, one marker, and the pin keeps the
   * canonical `access:{id}` identity through it so a selection survives the
   * toggle. Campground beats ramp when both are on; see MARK_PRIORITY.
   */
  const boatRampPins = useMemo(
    () =>
      accessFamily.markers
        .filter((marker) => marker.owner === 'boatRamp')
        .map(({ entry, roles }) => ({
          ...mapAccessPointPin(entry.point, entry.riverSlug ?? riverSlug, 'boatRamps'),
          // ── THE RAMP MARK CAN HIDE THINGS NOW, WHICH IT COULD NOT BEFORE ──
          //
          // A ramp-owned marker used to be able to hide only `access`, and
          // `accessLabel` said "Boat ramp · Pulltite" so the mark was named
          // either way. Composition puts service marks below the ramp in the
          // priority order, so this pin can now be standing in for a canoe
          // rental as well — and a caption that dropped it would repeat the bug
          // the campground pin was fixed for, one layer over.
          //
          // Label becomes the bare name for the same reason the campground pin's
          // did: the cue says "Ramp" already, and accessLabel's prefix would say
          // it twice.
          label: entry.point.name,
          subtitle: [...markCues(roles), `Mile ${entry.point.riverMile.toFixed(1)}`].join(' · '),
        })),
    [accessFamily, riverSlug],
  );

  /**
   * Campgrounds, from the two places they come from.
   *
   * ── The filter now answers its own question ────────────────────────────────
   *
   * This layer used to emit access-point campgrounds only while the Access layer
   * was OFF, to avoid two pins on one coordinate. The effect was that switching
   * Campgrounds on with the default layer set — which has Access on — added the
   * handful of campgrounds that are businesses and none of the ones that are
   * put-ins, i.e. most of them. Red Bluff is a put-in you can sleep at; asking
   * the map for campgrounds and not being shown Red Bluff is the filter failing
   * at the only thing it does.
   *
   * The de-duplication is right and the direction was wrong. One place still
   * draws one pin; what changed is which layer claims it. Turning Campgrounds
   * ON is a request to see the campgrounds AS campgrounds, so they move here and
   * wear the tent, and the access layer drops them for as long as that is true.
   * Nothing is lost when it happens: the pin keeps the access point's id, its
   * photo, its detail route and its privacy state, so it opens the same screen
   * and the planner still recognises it — see `id: access:` below.
   *
   * WHICH LAYER CLAIMS IT is the resolver's call now rather than this memo's,
   * because with three overlapping layers the answer stopped being a boolean.
   * The services half is unchanged: a service that is the same place as one of
   * the access points above never reaches here at all.
   */
  const campgroundPins = useMemo(() => {
    const campgrounds: MapPin[] = [
      ...accessFamily.markers
        .filter((marker) => marker.owner === 'campground')
        .map(({ entry, roles }) => ({
          // Keep the canonical access identity even while it is being presented
          // through the campground layer. If the user enables Access with this
          // callout open, the tent becomes a pin without losing selection.
          ...mapAccessPointPin(entry.point, entry.riverSlug ?? riverSlug, 'campgrounds'),
          // ── The two things a tent says differently from a put-in ────────
          // The mile line names the use, and the map label does NOT carry the
          // type cue: `accessLabel` writes one so a generic pin can say what
          // kind of place it is, and a tent has already said it. Both are how
          // this layer has always drawn; they are stated here because the pin
          // is otherwise the shared builder's, field for field.
          label: entry.point.name,
          // ── AND THE MILE LINE NAMES EVERY ROW THIS PIN IS ANSWERING ────
          //
          // `Camp · Mile 12.3` was true and half the story. Cedargrove is a
          // river access AND a campground; with both rows on it draws one tent,
          // and the caption used to drop the access half — so switching
          // Campgrounds on read as though it had REMOVED the access point, when
          // all it did was change which mark the one place wears.
          //
          // Note the asymmetry this closes rather than creates: with Campgrounds
          // OFF the same place already says `Campground · Cedargrove`, because
          // accessLabel prefixes the strongest type. The fact was available in
          // one of the two states a reader can be in.
          //
          // `roles` is LIVE roles, so a row the reader has switched off is never
          // advertised, and a place answering one row still reads exactly as it
          // did — `Camp · Mile 12.3`, unchanged.
          subtitle: [...markCues(roles), `Mile ${entry.point.riverMile.toFixed(1)}`].join(' · '),
        })),
      // A service campground is somewhere to sleep that is NOT a put-in — which
      // is what makes it worth drawing, and also what makes the ones that ARE
      // put-ins a problem. Several rows in nearby_services are the same place as
      // an access point above, seeded years apart from different sources, and
      // the two records were only ever distinguishable on the map because their
      // coordinates disagreed by miles. The resolver drops those — see
      // drawnAsAccessPoint — along with the closed, the unlocatable and the
      // rows on no camping tier, so what arrives here is what draws.
      ...accessFamily.serviceMarkers
        .filter((marker) => marker.owner === 'campground')
        .map(mapCampgroundServicePin),
    ];
    return campgrounds;
  }, [accessFamily, riverSlug]);

  // A gauge wears its OWN condition, graded on the phone from the ladder that
    // came down with the reading. That is the difference between a layer of
  // labels and a layer that answers "where is the water good right now" —
  // and the colours are the canonical ones, so a green dot here means what a
  // green row means in River Reports.
  const gaugePins: MapPin[] = useMemo(
    () => gauges.filter(hasCoordinates).map(mapGaugePin),
    [gauges],
  );

  const hazardPins: MapPin[] = useMemo(
    () => hazards.filter((h) => hasCoordinates(h)).map(mapHazardPin),
    [hazards],
  );

  const springPins: MapPin[] = useMemo(
    () => springs.filter((s) => hasCoordinates(s)).map(mapSpringPin),
    [springs],
  );

  // One service, one pin, whichever tier draws it — see mapServicePin, which
  // moved to module scope so a search result can build the same pin a tap
  // would. The rules it encodes are unchanged.

  // ── Both tiers now read the ONE resolved list ──────────────────────────
  //
  // `drawableServices` lived here and applied `serviceEligible`, `mappableService`
  // and the coordinate check for every service layer — one gate rather than
  // three, which was the right fix for the drift it replaced. The resolver
  // applies exactly those three tests now, in the same order, for the same
  // reason; keeping a second copy here would have re-created the drift in the
  // shape of a filter that agreed today and diverged later.
  //
  // These used to filter `drawableServices` themselves, which is what let a
  // camping-and-rentals row draw twice: this branch minted `service:{id}` while
  // the campgrounds branch minted `camp-service:{id}`, so neither could see the
  // other. `lodgingPins`' hand-written complement is gone too — SERVICE_MARK_
  // PRIORITY expresses the same rule (rentals beats lodging) in the same place
  // as every other precedence, and now covers camping as well.
  /**
   * A put-in that absorbed a business, drawn on that business's layer.
   *
   * ── WHY AN ACCESS POINT APPEARS UNDER RENTALS AT ALL ────────────────────
   *
   * Because it is the same place. Akers Ferry Canoe Rental sits on Akers Ferry
   * and the resolver composes the two into one place holding both marks; with
   * only Rentals & shuttles on, that place has to draw SOMEWHERE or asking the
   * map for canoe rental hides the one at the put-in you are looking at. It
   * used to draw nothing at all.
   *
   * It keeps `access:{id}` and its detail route, exactly as the campground
   * layer has always done with a put-in wearing a tent — the layer decides
   * which mark, never which record.
   */
  const composedServicePins = useCallback(
    (owner: 'rentals' | 'lodging', layer: 'outfitters' | 'lodging'): MapPin[] =>
      accessFamily.markers
        .filter((marker) => marker.owner === owner)
        .map(({ entry, roles }) => ({
          ...mapAccessPointPin(entry.point, entry.riverSlug ?? riverSlug, layer),
          label: entry.point.name,
          subtitle: [...markCues(roles), `Mile ${entry.point.riverMile.toFixed(1)}`].join(' · '),
        })),
    [accessFamily, riverSlug],
  );

  const outfitterPins: MapPin[] = useMemo(
    () => [
      ...accessFamily.serviceMarkers
        .filter((marker) => marker.owner === 'rentals')
        .map((marker) => mapServicePin(marker, 'outfitters')),
      ...composedServicePins('rentals', 'outfitters'),
    ],
    [accessFamily, composedServicePins],
  );

  const lodgingPins: MapPin[] = useMemo(
    () => [
      ...accessFamily.serviceMarkers
        .filter((marker) => marker.owner === 'lodging')
        .map((marker) => mapServicePin(marker, 'lodging')),
      ...composedServicePins('lodging', 'lodging'),
    ],
    [accessFamily, composedServicePins],
  );

  /** The seven, as one object. References only — nothing is rebuilt here. */
  const pins = useMemo(
    () => ({
      access: accessPins,
      boatRamps: boatRampPins,
      campgrounds: campgroundPins,
      gauges: gaugePins,
      hazards: hazardPins,
      springs: springPins,
      outfitters: outfitterPins,
      lodging: lodgingPins,
    }),
    [
      accessPins,
      boatRampPins,
      campgroundPins,
      gaugePins,
      hazardPins,
      springPins,
      outfitterPins,
      lodgingPins,
    ],
  );

  // Route endpoints keep the icon already chosen by the visible place layer.
  // Draw each place once in the endpoint source so it stays visible even when
  // zoomed out or its ordinary layer is hidden. The badge changes, not the art.
  const endpointPins = useMemo(() => {
    if (!planEndpoints) return [];
    const visiblePins = Object.values(pins).flat();
    const points = [
      { point: planEndpoints.putIn, role: 'Put-in' },
      ...(planEndpoints.takeOut ? [{ point: planEndpoints.takeOut, role: 'Take-out' }] : []),
    ];
    return points.map(({ point, role }) => {
      const types = accessPointTypes(point);
      const fallbackLayer = types.includes('campground') ? 'campgrounds'
        : types.includes('boat_ramp') ? 'boatRamps' : 'access';
      const pin = visiblePins.find(candidate => candidate.id === `access:${point.id}`)
        ?? mapAccessPointPin(point, riverSlug, fallbackLayer);
      const icon = PIN_ICONS[LAYER_SHAPE[pin.layer as PinLayerKey] ?? 'pin'] ?? PIN_ICONS.pin!;
      return { pin, role, icon };
    });
  }, [pins, planEndpoints, riverSlug]);
  const endpointIds = useMemo(() => new Set(endpointPins.map(({ pin }) => pin.id)), [endpointPins]);

  /**
   * ── OVERLAPPING PLACES BECOME NUMBERED STACKS ──────────────────────────
   *
   * The web planner's rule, in map/pinStacks.ts: places within 56pt of each
   * other at the current zoom draw as one numbered mark. Only marks that are
   * drawn individually at this zoom take part; below a clustered layer's
   * ceiling its native bubbles already do this job. Three things never stack:
   * hazards (a hazard must never disappear into a count), route endpoints
   * (they have their own source and badge) and the selected place (the open
   * sheet is about it, so it stays visible beside whatever else is there).
   *
   * Computed from the camera's last STOP, never per frame, and padded like
   * the gauge request box so a mark just off screen still groups with its
   * neighbour on screen.
   */
  const stacks = useMemo<PinStack[]>(() => {
    if (!visibleViewport || visibleViewport.zoom < ZOOM.cluster) return [];
    const { bounds: [west, south, east, north], zoom } = visibleViewport;
    const padLng = (east - west) * 0.2;
    const padLat = (north - south) * 0.2;
    // Every clustered source breaks at ZOOM.cluster (see NATIVE_CLUSTER_MAX_ZOOM),
    // so above the guard at the top of this memo every layer's marks are
    // individual and all of them may stack.
    const candidates: StackCandidate[] = [];
    const add = (list: readonly MapPin[] | null | undefined) => {
      for (const pin of list ?? []) {
        if (!layers.includes(pin.layer) || pin.id === selectedPinId || endpointIds.has(pin.id)) continue;
        const { lng, lat } = pin.coordinates;
        if (lng < west - padLng || lng > east + padLng || lat < south - padLat || lat > north + padLat) continue;
        candidates.push({ id: pin.id, lng, lat });
      }
    };
    add(accessPins);
    add(campgroundPins);
    add(boatRampPins);
    add(springPins);
    add(outfitterPins);
    add(lodgingPins);
    add(gaugePins);
    add(referenceGauges);
    add(dams);
    return pinStacks(candidates, zoom);
  }, [
    visibleViewport, layers, selectedPinId, endpointIds, accessPins, campgroundPins,
    boatRampPins, springPins, outfitterPins, lodgingPins, gaugePins, referenceGauges, dams,
  ]);
  const stacksById = useMemo(() => new Map(stacks.map((stack) => [stack.id, stack])), [stacks]);
  // PRIMITIVE KEYS, so a camera stop that regroups nothing re-uploads nothing.
  // `stacks` is a new array on every stop; these strings only change when a
  // stack forms, splits or moves, and every layer shape below depends on them
  // rather than on the array.
  const stackedKey = stacks.flatMap((stack) => stack.ids).sort().join('|');
  const referenceIds = useMemo(() => new Set((referenceGauges ?? []).map((pin) => pin.id)), [referenceGauges]);
  const stackFeaturesKey = JSON.stringify(stacks.map((stack) => [
    stack.id, stack.ids.length, stack.lng, stack.lat,
    stack.ids.every((member) => referenceIds.has(member)) ? 'usgs' : 'place',
  ]));
  /** Endpoints and stacked members, left out of their own layers' shapes. */
  const layerHiddenIds = useMemo(
    () => new Set([...endpointIds, ...(stackedKey ? stackedKey.split('|') : [])]),
    [endpointIds, stackedKey],
  );
  const stackedOnlyIds = useMemo(
    () => new Set(stackedKey ? stackedKey.split('|') : []),
    [stackedKey],
  );
  const stackShape = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: (JSON.parse(stackFeaturesKey) as [string, number, number, number, string][]).map(
      ([id, count, lng, lat, face]) => ({
        type: 'Feature' as const,
        id,
        properties: { id, count, face },
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
      }),
    ),
  }), [stackFeaturesKey]);

  /**
   * Each pin layer's FeatureCollection, built once per change of its inputs.
   *
   * Same argument as networkShape and detailShape above, and it was the one
   * source group not getting it: featureCollection() was called inline inside
   * pinLayer, so every render of this screen — a scrub, a sheet opening, a
   * selection — handed the native ShapeSource a structurally identical object
   * with a new identity, and the bridge re-uploaded six sets of pins.
   *
   * Keyed by layer so the lookup below stays a plain property read. `dams`
   * arrives already shaped as MapPin[] rather than through the `pins` memo,
   * which is why it is listed separately in the dependencies.
   */
  // ONE MEMO PER COLLECTION, for the reason the pin memos above were split: a
  // single memo over all six meant any one layer's data landing rebuilt the
  // other five, and a rebuilt collection is a re-upload of that layer's pins
  // whether or not a feature in it changed.
  const accessShape = useMemo(
    () => featureCollection(accessPins, layerColorFor('access'), layerHiddenIds),
    [accessPins, layerHiddenIds],
  );
  const outfitterShape = useMemo(
    () => featureCollection(outfitterPins, layerColorFor('outfitters'), layerHiddenIds),
    [outfitterPins, layerHiddenIds],
  );
  const lodgingShape = useMemo(
    () => featureCollection(lodgingPins, layerColorFor('lodging'), layerHiddenIds),
    [lodgingPins, layerHiddenIds],
  );
  const boatRampShape = useMemo(
    () => featureCollection(boatRampPins, layerColorFor('boatRamps'), layerHiddenIds),
    [boatRampPins, layerHiddenIds],
  );
  const campgroundShape = useMemo(
    () => featureCollection(campgroundPins, layerColorFor('campgrounds'), layerHiddenIds),
    [campgroundPins, layerHiddenIds],
  );
  const gaugeShape = useMemo(
    () => featureCollection(gaugePins, layerColorFor('gauges'), stackedOnlyIds),
    [gaugePins, stackedOnlyIds],
  );
  const hazardShape = useMemo(
    () => featureCollection(hazardPins, layerColorFor('hazards')),
    [hazardPins],
  );

  const springShape = useMemo(
    () => featureCollection(springPins, layerColorFor('springs'), stackedOnlyIds),
    [springPins, stackedOnlyIds],
  );
  const damShape = useMemo(
    () => featureCollection(dams ?? [], layerColorFor('dams'), stackedOnlyIds),
    [dams, stackedOnlyIds],
  );
  // The national tier's collection. This was built inline inside
  // contextGaugeLayer — the one source in this file that was — so every render
  // of this component handed the native ShapeSource a structurally identical
  // object with a new identity, and the bridge re-uploaded up to a thousand
  // reference gauges per sheet settle. Same argument, and same fix, as every
  // memo above it.
  const referenceShape = useMemo(
    () => featureCollection(referenceGauges ?? [], layerColorFor('allGauges'), stackedOnlyIds),
    [referenceGauges, stackedOnlyIds],
  );

  /**
   * ── THE TWO FAMILY INDEXES ────────────────────────────────────────────────
   *
   * One collection per FAMILY, holding every pin its layers draw, and drawn
   * only below ZOOM.cluster — see familyIndexLayer.
   *
   * ── The state this fixes ────────────────────────────────────────────────
   *
   * Access points clustered and nothing else did, so the two layers holding
   * fourteen thousand things collapsed into bubbles while the ~285 places did
   * not: at the opening statewide view the Ozarks were a wall of tents, canoes
   * and cabins with the rivers invisible underneath.
   *
   * Worse, switching Camping ON made it *sparser where it counted*: a put-in
   * tagged `campground` leaves the access source to wear a tent (see
   * campgroundPins), so the access cluster's count fell by 123 at the same
   * moment 123 unclustered tents appeared. The layer that consolidates lost
   * exactly the pins the layer that does not consolidate gained.
   *
   * ── Why an INDEX rather than merging the sources ────────────────────────
   *
   * The obvious fix is one clustered source per family holding every mark. It
   * costs more than it looks: a merged source needs `iconImage` per feature,
   * and the access mark is bottom-anchored (its tip IS the location) while
   * every other mark is centred — so the icon and label layers would have to be
   * split by anchor anyway, and each layer's own tuning (the private-access
   * dimming, the badge behind themed marks) would have to be re-expressed as
   * filters over a mixed source.
   *
   * Below ZOOM.cluster none of that is drawn. A bubble is a count and a
   * singleton is a coloured dot, and neither needs a mark — so the index holds
   * only what a bubble needs, the real layers keep their own rendering
   * unchanged, and the two never draw at the same zoom.
   *
   * The price is one duplicate set of features across the bridge: ~400 points
   * for the access family, ~110 for services. Memoised on the same inputs as
   * every other collection here, so it is built when its pins change and not
   * per render — and it buys leaving five tuned layers exactly as they are.
   *
   * ── The families, and why these two ─────────────────────────────────────
   *
   * `places` is the access family — put-ins, camping, ramps — which is already
   * ONE population under three questions: the resolver hands out one marker per
   * place with an `owner` deciding its mark, so these three can never
   * double-count a place between them. `services` is rentals and cabins, the
   * same arrangement over the directory. Gauges keep their own two sources: a
   * count of gauges answers a question about water that a count mixing in
   * cabins could not.
   */
  // Only the members whose layer is ON: the index is mounted for the whole
  // family, and a count must not include tents while Camping is off. Springs
  // ride in the places family — they used to take the ZOOM.cluster floor with
  // no index under it, so below z8 the one layer drew nothing at all.
  const placesIndexShape = useMemo(
    () =>
      featureCollection(
        [...accessPins, ...campgroundPins, ...boatRampPins, ...springPins].filter((pin) => layers.includes(pin.layer)),
        (pin) => layerColorFor(pin.layer), endpointIds,
      ),
    [accessPins, campgroundPins, boatRampPins, springPins, layers, endpointIds],
  );
  const servicesIndexShape = useMemo(
    () =>
      featureCollection(
        [...outfitterPins, ...lodgingPins].filter((pin) => layers.includes(pin.layer)),
        (pin) => layerColorFor(pin.layer), endpointIds,
      ),
    [outfitterPins, lodgingPins, layers, endpointIds],
  );

  const pinShapes = useMemo(
    () =>
      ({
        access: accessShape,
        boatRamps: boatRampShape,
        outfitters: outfitterShape,
        lodging: lodgingShape,
        campgrounds: campgroundShape,
        gauges: gaugeShape,
        hazards: hazardShape,
        springs: springShape,
        dams: damShape,
        // Never drawn through pinLayer — the national tier has its own
        // clustered source. Present so the record is total.
        allGauges: EMPTY_COLLECTION,
      }) as Record<PinLayerKey, ReturnType<typeof featureCollection>>,
    [
      accessShape,
      boatRampShape,
      outfitterShape,
      lodgingShape,
      campgroundShape,
      gaugeShape,
      hazardShape,
      springShape,
      damShape,
    ],
  );


  const byId = useMemo(() => {
    const map = new Map<string, MapPin>();
    for (const list of Object.values(pins)) for (const pin of list) map.set(pin.id, pin);
    // THE NATIONAL TIER BELONGS IN HERE TOO. Its pins are built by the screen
    // rather than by the block above, and they were missing from this index —
    // so onContextPress looked up an id that could never be found, and every
    // tap on a reference gauge silently did nothing. The layer drew fine, which
    // is what made it read as "these just are not clickable".
    for (const pin of referenceGauges ?? []) map.set(pin.id, pin);
    // Dams too, for the identical reason — they are built by the screen and
    // would otherwise draw fine and be untappable.
    for (const pin of dams ?? []) map.set(pin.id, pin);
    for (const { pin } of endpointPins) map.set(pin.id, pin);
    return map;
  }, [pins, referenceGauges, dams, endpointPins]);

  const endpointFeatures = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: endpointPins.map(({ pin, role, icon }) => ({
      type: 'Feature' as const,
      id: pin.id,
      properties: {
        id: pin.id,
        label: `${role} · ${pin.name}`,
        image: icon.image,
        anchor: icon.anchor,
        color: role === 'Put-in' ? primary[700] : colors.accent,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [pin.coordinates.lng, pin.coordinates.lat],
      },
    })),
  }), [endpointPins, colors.accent]);

  /**
   * ── THE SELECTED PLACE, DRAWN BY ITSELF ON TOP ────────────────────────────
   *
   * The open sheet is about this place, so the map must show it — and for a
   * while it could not promise to. A selected pin was a `case` inside its own
   * layer, which left it wherever that layer sat: under a numbered stack's
   * opaque face, folded into a count below the cluster rung (a pick from
   * "Places in this area" opened a sheet for a place the map drew only as a
   * number), unnamed below ZOOM.names or beaten in label collision, and gone
   * entirely when its layer was switched off with the sheet still open.
   *
   * So it has a source of its own, above every place layer: always drawn,
   * always named, the same mark at SELECTED_SCALE. Its own layer leaves it out
   * through a FILTER (see `unselected`) rather than by rebuilding collections,
   * so a tap re-uploads one feature, not a thousand. Route endpoints are the
   * exception that already had this — their source draws their selection.
   */
  const selectedShape = useMemo(() => {
    // byId holds only what the switched-on layers draw: turning off the last
    // layer that drew the selection took it out of byId, and the marker went
    // with it while its sheet stayed open. The caller's pin is the fallback;
    // a pin this map still holds is the fresher copy.
    const held = selectedPinId ? byId.get(selectedPinId) : undefined;
    const pin = selectedPinId && !endpointIds.has(selectedPinId)
      ? held ?? (selectedPin?.id === selectedPinId ? selectedPin : undefined)
      : undefined;
    if (!pin) return EMPTY_COLLECTION;
    const icon = PIN_ICONS[LAYER_SHAPE[pin.layer as PinLayerKey] ?? 'dot'];
    return {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        id: pin.id,
        properties: {
          id: pin.id,
          label: pin.label ?? pin.name,
          color: pin.color ?? layerColorFor(pin.layer),
          image: icon?.image ?? '',
          anchor: icon?.anchor ?? 'center',
          // The label clears the scaled-up mark, or a dot when there is none.
          labelOffset: [0, icon ? icon.labelOffset * SELECTED_SCALE : 1.2],
        },
        geometry: { type: 'Point' as const, coordinates: [pin.coordinates.lng, pin.coordinates.lat] },
      }],
    };
  }, [selectedPinId, selectedPin, endpointIds, byId]);

  // ── Why the two river sources are never unmounted ───────────────────────────
  //
  // "Layer 'network-fill' is not in style", thrown by updateLayer.
  //
  // A ShapeSource that stops rendering is REMOVED, and RNMBXSource.removeFromMap
  // removes every layer belonging to it on the way out. The React layer
  // component survives that — it still holds a live styleLayer — so the next
  // prop change calls updateLayer against a style the layer is no longer in.
  // That is the error, and it has exactly one cause here: a source going away
  // and coming back.
  //
  // So neither of these sources is conditional any more. They mount once and
  // stay, and "nothing to draw" is expressed as an EMPTY FeatureCollection —
  // which is a source update rather than a teardown, and cannot orphan a layer.
  const networkShape = useMemo(
    () => network ?? EMPTY_COLLECTION,
    [network],
  );

  /**
   * The public-land parcels, or nothing.
   *
   * Empty rather than unmounted when the layer is off, for the reason stated
   * directly above: a ShapeSource that stops rendering takes its layers out of
   * the style, and the surviving React layer components then update against a
   * style they are no longer in. The radar can unmount because a RasterSource
   * owns no ShapeSource layers and because leaving it mounted costs tile
   * fetches; an empty FeatureCollection costs nothing.
   */
  const publicLandShape = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: layers.includes('publicLand') ? (publicLands ?? []) : [],
    }),
    [layers, publicLands],
  );

  /**
   * The selected river's mile posts as features, or an empty collection.
   *
   * `major` marks the five-mile posts, which arrive with the other labels at
   * ZOOM.names; the rest wait for z12, where a reader is close enough to be
   * pacing a stretch rather than choosing a river.
   */
  const milePostShape = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: (milePosts ?? []).map((post) => ({
        type: 'Feature' as const,
        id: `mile:${post.mile}`,
        properties: { label: String(post.mile), major: post.mile % 5 === 0 },
        geometry: { type: 'Point' as const, coordinates: [post.lng, post.lat] },
      })),
    }),
    [milePosts],
  );

  /**
   * The selected river's own full-resolution line.
   *
   * Drawn only when the network does NOT already carry it, because the network
   * paints it per gauge and this would flatten it back to one colour. Usually
   * that means empty — which is the point of the note above.
   */
  const detailShape = useMemo(() => {
    const covered =
      river && network?.features.some((f) => f.properties.slug === river.slug);
    return {
      type: 'FeatureCollection' as const,
      features: !lineFeature || covered ? [] : [lineFeature],
    };
  }, [lineFeature, network, river]);

  // Memoised so the native layer only hears about a width change when one
  // actually happened. These are expressions rather than numbers — a selected
  // river is drawn heavier — and rebuilding the array every render made every
  // unrelated re-render of the map screen an updateLayer call, which is both
  // wasted work and more chances to land in the window described above.
  const networkWidths = useMemo(() => {
    const bySlug = (base: number, selected: number): number | unknown[] =>
      river ? ['case', ['==', ['get', 'slug'], river.slug], selected, base] : base;
    return { casing: bySlug(4.5, 7), fill: bySlug(2.5, 4) };
  }, [river]);

  /**
   * Startup framing and navigation are deliberately different channels.
   *
   * `defaultSettings` answers only the first paint. Everything after that is an
   * imperative command carrying a monotonic id, applied once below. A river,
   * point, or plan therefore cannot remain attached to the Camera as a prop and
   * wake back up when a sheet changes padding or an unrelated request lands.
   */
  const [defaultCameraSettings] = useState(() => {
    // ONE fallback, not two. There used to be a `networkBounds` prop tried
    // before this, and it never fired: the screen resolves location → network
    // bounds → null before handing over `initialCamera`, so a null one meant
    // networkBounds was null too. Two places owning one decision, the second
    // unreachable. The prop is gone; the screen alone decides where to open.
    const initial: InitialMapCamera = initialCamera ?? {
      type: 'center',
      lng: COLD_START_CENTER[0],
      lat: COLD_START_CENTER[1],
      zoom: COLD_START_ZOOM,
    };
    if (initial.type === 'center') {
      return {
        centerCoordinate: [initial.lng, initial.lat] as [number, number],
        zoomLevel: initial.zoom,
        padding: cameraPadding,
      };
    }
    const bounds = initial.bounds;
    return { bounds: { ne: [bounds[2], bounds[3]], sw: [bounds[0], bounds[1]] }, padding: cameraPadding };
  });

  const cameraRef = useRef<MapCameraRef | null>(null);
  const mapRef = useRef<MapQueryRef | null>(null);
  const clusterSources = useRef(new Map<string, ClusterSourceRef>());
  const registerClusterSource = useCallback((id: string, source: ClusterSourceRef | null) => {
    if (source) clusterSources.current.set(id, source);
    else clusterSources.current.delete(id);
  }, []);
  const clusterSourceRefs: Record<string, (source: ClusterSourceRef | null) => void> = {
    'pins-gauges': useCallback(source => registerClusterSource('pins-gauges', source), [registerClusterSource]),
    'pins-dams': useCallback(source => registerClusterSource('pins-dams', source), [registerClusterSource]),
    'pins-allGauges': useCallback(source => registerClusterSource('pins-allGauges', source), [registerClusterSource]),
    'pins-places-index': useCallback(source => registerClusterSource('pins-places-index', source), [registerClusterSource]),
    'pins-services-index': useCallback(source => registerClusterSource('pins-services-index', source), [registerClusterSource]),
  };
  // Each rendered POI layer registers its own ID. This render-local collection
  // belongs to the onMapPress closure below, so conditional layers and the dot
  // fallback stay in sync without querying absent layers or basemap features.
  const pinHitLayers: string[] = [];
  const pinHitLayerId = (id: string) => { pinHitLayers.push(id); return id; };
  const mapSize = useRef({ width: 0, height: 0 });
  const interactionEpoch = useRef(0);
  const tapSequence = useRef(0);
  // A stack's "N places here" choice. Owned here, beside the stacks it lists.
  const [stackChoice, setStackChoice] = useState<MapPin[] | null>(null);
  // A tapped public-land parcel's callout. See PublicLandCallout.
  const [publicLand, setPublicLand] = useState<PublicLandProperties | null>(null);
  // Invalidate async native queries when the map goes away.
  useEffect(() => () => { interactionEpoch.current++; tapSequence.current++; }, []);
  const reducedMotion = useReducedMotion(true);
  const appliedCommandId = useRef<number | null>(null);
  /** When the last app-driven camera move lands, in ms since epoch. */
  const flightEndsAt = useRef(0);
  const liveCamera = useRef<{ center: [number, number]; zoom: number; gestureActive: boolean } | null>(
    null,
  );

  // Mirrored into a ref so onCameraChanged can read the live command without
  // taking it as a dependency. See that callback for why identity matters here.
  //
  // In an effect rather than straight down the render body: a ref written during
  // render is a render with a side effect, which React may discard and re-run.
  // Committed is soon enough — the only reader is a native callback, and a
  // gesture cannot reach it before the commit that issued the command.
  const pendingCommand = useRef<MapCameraCommand | null>(null);
  useEffect(() => {
    pendingCommand.current = cameraCommand ?? null;
  }, [cameraCommand]);
  const gestureLatched = useRef(false);
  // A layer change invalidates a tap whose native query is still in flight.
  useEffect(() => {
    interactionEpoch.current++;
    tapSequence.current++;
  }, [layers]);

  /**
   * The camera moved. Ref-only, and STABLE.
   *
   * Fires on every animation frame, so nothing in here may render React. It is
   * also the only source of live zoom — cluster expansion adds its delta to
   * whatever is on screen right now, rather than to a value onMapIdle published
   * before the last animation finished.
   *
   * Stable because an inline arrow is a new prop value on every render of a map
   * that re-renders on every sheet movement, and this one crosses the native
   * bridge. `cameraCommand` is read through a ref for exactly that reason.
   */
  const onCameraChanged = useCallback(
    (state: MapIdleState) => {
      const center = state.properties?.center;
      const zoom = state.properties?.zoom;
      if (!center || typeof zoom !== 'number') return;
      const gestureActive = Boolean(state.gestures?.isGestureActive);
      if (gestureStarted(gestureLatched.current, gestureActive)) {
        interactionEpoch.current++;
        tapSequence.current++;
        onUserGesture?.();
      }
      gestureLatched.current = gestureActive;
      if (gestureActive) {
        // A gesture stops any app-driven flight where it is.
        flightEndsAt.current = 0;
        const command = pendingCommand.current;
        // A gesture wins even over a command waiting for sheet measurement.
        // Marking it consumed prevents the delayed command from snapping the
        // map back after the reader has already taken control.
        if (command && appliedCommandId.current !== command.id) {
          appliedCommandId.current = command.id;
          onCameraCommandConsumed?.(command.id);
        }
      }
      liveCamera.current = {
        center: [center[0], center[1]],
        zoom,
        gestureActive,
      };
    },
    [onCameraCommandConsumed, onUserGesture],
  );

  useEffect(() => {
    if (!cameraCommand || appliedCommandId.current === cameraCommand.id || !cameraRef.current) {
      return;
    }
    if ('waitForSheet' in cameraCommand && cameraCommand.waitForSheet && !sheetReady) {
      return;
    }

    appliedCommandId.current = cameraCommand.id;
    onCameraCommandConsumed?.(cameraCommand.id);
    if (cameraCommand.type === 'showPoint') {
      const zoomLevel =
        cameraCommand.zoomDelta !== undefined
          ? // No live zoom means onCameraChanged has not fired yet, and there is
            // nothing to add a delta TO. Leaving this undefined preserves the
            // current zoom, so a cluster tap re-centres without expanding —
            // visibly incomplete. Assuming a zoom (this once assumed 10) instead
            // lands somewhere plausible and wrong, which is the harder bug.
            liveCamera.current
            ? Math.min(
                cameraCommand.maxZoom ?? Number.POSITIVE_INFINITY,
                liveCamera.current.zoom + cameraCommand.zoomDelta,
              )
            : undefined
          : cameraCommand.zoom;
      const epoch = interactionEpoch.current;
      const commandId = cameraCommand.id;
      // A reveal-only move asks "is the point already visible?" — a question
      // with no honest answer while an earlier app-driven flight is still
      // carrying the camera: getPointInView reports where the point is MID-
      // flight, and the flight then carries it under the sheet. So during a
      // flight the reveal always runs, replacing the old destination.
      const inFlight = Date.now() < flightEndsAt.current;
      const animation = cameraAnimation(cameraCommand, reducedMotion);
      const apply = async () => {
        if (cameraCommand.revealOnly && !inFlight && mapRef.current) {
          try {
            const point = await mapRef.current.getPointInView([cameraCommand.lng, cameraCommand.lat]);
            if (!pointNeedsReveal(point, mapSize.current, cameraPadding)) return;
          } catch { return; } // A missing style/measurement is not a reason to jump.
        }
        if (interactionEpoch.current !== epoch || appliedCommandId.current !== commandId) return;
        flightEndsAt.current = Date.now() + (animation.animationDuration ?? 0);
        cameraRef.current?.setCamera({
          centerCoordinate: [cameraCommand.lng, cameraCommand.lat],
        // Undefined is intentional for a POI: Mapbox then changes the centre
        // without changing the live native zoom, even if a river fit is still
        // moving and onMapIdle has not published its final value yet.
        zoomLevel,
        padding: cameraPadding,
        ...animation,
        });
      };
      void apply();
      return;
    }

    const bounds = cameraCommand.bounds;
    const animation = cameraAnimation(cameraCommand, reducedMotion);
    flightEndsAt.current = Date.now() + (animation.animationDuration ?? 0);
    cameraRef.current.setCamera({
      bounds: { ne: [bounds[2], bounds[3]], sw: [bounds[0], bounds[1]] },
      padding: cameraPadding,
      ...animation,
    });
  }, [cameraCommand, cameraPadding, sheetReady, onCameraCommandConsumed, reducedMotion]);

  // The caller is responsible for not rendering this when Mapbox is unavailable;
  // this guard is here so a mistake shows an empty map rather than a red screen.
  if (!Mapbox) return <View style={[styles.fill, { backgroundColor: colors.bg }]} />;

  const stroke = conditionColor(conditionCode);

  // ── THE TAP POINT TRAVELS WITH THE SLUG ──────────────────────────────────
  // Mapbox hands every press the map coordinate under the finger, and this
  // dropped it. Without it the caller had nothing to keep the reader near, so
  // selecting a river could only frame the whole river — which on the Current
  // is 134 miles and lands somewhere the reader was not looking. See the map
  // screen's onSelectNetworkRiver.
  const onNetworkPress = (event: {
    features?: { properties?: Record<string, unknown> }[];
    coordinates?: { latitude: number; longitude: number };
  }) => {
    const slug = event.features?.[0]?.properties?.slug;
    if (typeof slug !== 'string') return;
    const at = event.coordinates;
    onSelectRiverSlug?.(
      slug,
      // Optional because it comes off a native event: a shape that arrives
      // without it must still select the river, and the caller falls back to
      // framing rather than to doing nothing.
      at && Number.isFinite(at.longitude) && Number.isFinite(at.latitude)
        ? { lng: at.longitude, lat: at.latitude }
        : undefined,
    );
  };

  const layerOn = (key: LayerKey) => layers.includes(key);

  /**
   * A layer filter that also leaves out the selected place, which
   * selectedShape draws on top. Filters are layer properties: changing one
   * re-evaluates the layer without re-uploading its source.
   */
  const unselected = (filter?: unknown[]): unknown[] | undefined => {
    if (!selectedPinId) return filter;
    const notSelected = ['!=', ['get', 'id'], selectedPinId];
    return filter ? ['all', filter, notSelected] : notSelected;
  };

  /**
   * A tap that landed on places: the mark nearest the finger wins.
   *
   * The query box is 44pt, so it can reach two marks that are not stacked.
   * The one under the finger is the one meant, whatever order the native
   * layers return them in. A numbered stack follows the web planner's rule:
   * ease in to where it splits while zoomed out, otherwise list its members.
   */
  const selectPinHits = (features: RenderedFeature[], tap: number[] | undefined) => {
    const zoom = liveCamera.current?.zoom ?? visibleViewport?.zoom ?? 0;
    const hits: HitCandidate[] = [];
    for (const feature of features) {
      const id = feature.properties?.id;
      if (typeof id !== 'string') continue;
      const stack = stacksById.get(id);
      const pin = stack ? null : byId.get(id);
      if (stack) hits.push({ id, lng: stack.lng, lat: stack.lat });
      else if (pin) {
        // A bottom-anchored mark is aimed at by its bulb, not its tip — but
        // only once it draws as the mark; below ZOOM.places it is a dot.
        const icon = PIN_ICONS[LAYER_SHAPE[pin.layer as PinLayerKey] ?? 'dot'];
        const lift = icon?.anchor === 'bottom' && zoom >= ZOOM.places ? ACCESS_BADGE_LIFT : 0;
        hits.push({ id, lng: pin.coordinates.lng, lat: pin.coordinates.lat, lift });
      }
    }
    const id = nearestHitId(hits, tap && tap.length >= 2 ? { lng: tap[0], lat: tap[1] } : null, zoom);
    if (!id) return false;
    const stack = stacksById.get(id);
    if (stack) {
      const action = stackTap(stack, liveCamera.current?.zoom ?? visibleViewport?.zoom ?? 0);
      if (action.type === 'zoom') onZoomToCluster?.({ lng: stack.lng, lat: stack.lat, zoom: action.zoom });
      else setStackChoice(stack.ids.flatMap((member) => byId.get(member) ?? []));
      return true;
    }
    onSelectPin?.(byId.get(id)!);
    return true;
  };

  const onMapPress = async (event: { properties?: Record<string, unknown>; geometry?: { coordinates?: number[] } }) => {
    const map = mapRef.current;
    const x = event.properties?.screenPointX, y = event.properties?.screenPointY;
    if (!map || typeof x !== 'number' || typeof y !== 'number') return;
    const sequence = ++tapSequence.current;
    const epoch = ++interactionEpoch.current;
    const current = () => sequence === tapSequence.current && epoch === interactionEpoch.current;
    const box = [y - 22, x - 22, y + 22, x + 22];
    try {
      const hits = await map.queryRenderedFeaturesInRect(box, [], pinHitLayers);
      if (!current()) return;
      if (selectPinHits(hits?.features ?? [], event.geometry?.coordinates)) return;
      // Queried native features omit source identity. Query cluster layers with
      // their source refs only when no individual POI matched the tap — EVERY
      // clustered source, then the count nearest the finger. Taking the first
      // source's hit let an overlapping reference or places count capture a
      // tap aimed at the gauge count drawn over it.
      const counts: { source: ClusterSourceRef; feature: RenderedFeature; lng: number; lat: number }[] = [];
      for (const [sourceId, source] of clusterSources.current) {
        const result = await map.queryRenderedFeaturesInRect(box, [], [`${sourceId}-cluster`]);
        if (!current()) return;
        for (const feature of result?.features ?? []) {
          const coords = feature.geometry?.coordinates;
          if (typeof feature.properties?.cluster_id === 'number' && coords) {
            counts.push({ source, feature, lng: coords[0], lat: coords[1] });
          }
        }
      }
      const tapAt = event.geometry?.coordinates;
      const nearest = nearestHitId(
        counts.map((count, index) => ({ id: String(index), lng: count.lng, lat: count.lat })),
        tapAt && tapAt.length >= 2 ? { lng: tapAt[0], lat: tapAt[1] } : null,
      );
      if (nearest !== null) {
        const { source, feature, lng, lat } = counts[Number(nearest)];
        let zoom: number | undefined;
        try {
          const expansion = await source.getClusterExpansionZoom(feature);
          if (Number.isFinite(expansion)) zoom = expansion;
        } catch (error) {
          warn('map', 'cluster expansion unavailable; using camera zoom fallback', error);
        }
        if (!current()) return;
        onZoomToCluster?.({ lng, lat, ...(zoom === undefined ? {} : { zoom }) });
        return;
      }
      const rivers = await map.queryRenderedFeaturesInRect(box, [], ['network-fill']);
      if (!current()) return;
      if (rivers?.features.length) {
        const coords = event.geometry?.coordinates;
        onNetworkPress({ features: rivers.features, coordinates: coords ? { longitude: coords[0], latitude: coords[1] } : undefined });
        return;
      }
      // Public land, under everything else: a tap on a parcel says what the
      // ground is and leaves the open sheet alone. It used to fall through to
      // the background and close the sheet, with no way to learn the parcel.
      if (layers.includes('publicLand')) {
        const parcels = await map.queryRenderedFeaturesInRect([y, x, y, x], [], ['public-lands-fill']);
        if (!current()) return;
        const land = parcels?.features[0]?.properties as PublicLandProperties | undefined;
        if (land && typeof land.name === 'string') {
          setPublicLand(land);
          return;
        }
      }
      onBackgroundPress?.();
    } catch (error) {
      // Failed hit-testing is not an empty-map tap; preserve the selection.
      warn('map', 'map selection unavailable', error);
    }
  };

  /**
   * A compact Eddy mark plus labels for one layer. The fallback is a circle.
   *
   * A FUNCTION THAT RETURNS JSX, not a component. Declaring a component inside
   * a render gives it a new identity on every pass, so React unmounts and
   * remounts it — which for a ShapeSource means tearing down and rebuilding the
   * native source each time the parent renders, and the pins visibly flicker.
   */
  const pinLayer = (
    /**
     * Which layer to draw. Also selects its data — see pinShapes.
     *
     * The pins and the colour used to be passed in alongside it, which meant a
     * call site could name one layer and hand it another's contents. They come
     * from the key now, so it cannot.
     *
     * PinLayerKey, not LayerKey: this function draws a ShapeSource of point
     * features, and a raster layer has none. The narrower type is what stops a
     * future `pinLayer('weatherRadar')` from compiling into a source with an
     * undefined shape.
     */
    id: PinLayerKey,
    shape: PinShape = 'dot',
    /**
     * The zoom a layer's labels switch on at.
     *
     * Every caller passes ZOOM.names, and map-zoom-ladder.test.ts holds them
     * to it. Dams once passed 0 and gauges GAUGE_DETAIL_ZOOM; a statewide view
     * with one layer named and nothing else read as that layer shouting over
     * the map. The selected place is the exception that is not a layer: the
     * selection layer names it at every zoom.
     */
    labelMinZoom: number = ZOOM.names,
    /**
     * The zoom the PINS THEMSELVES switch on at, as against their labels.
     *
     * Expressed on the layers rather than by withholding the data, for the same
     * reason the note below gives: the source stays mounted and only stops
     * drawing. Undefined for every layer whose members are bounded by the river
     * they belong to — it is only the statewide sets that can crowd a
     * statewide view.
     */
    minZoom?: number,
    /**
     * Render an overview dot below this zoom, then the requested Eddy mark.
     * Gauges use it so the statewide view is informative without becoming a
     * wall of full-size staff marks and labels.
     */
    compactUntilZoom?: number,
    /**
     * Collapse this layer into count badges below `maxZoom`.
     *
     * Rated gauges and dams pass it. The badge is the neutral place face, never
     * a verdict — see PLACE_COUNT_BADGE.
     */
    clustering?: { radius: number },
  ) => {
    // No early return on an empty list. Access points and gauges arrive
    // asynchronously, and a source that unmounts takes its layers out of the
    // style with it — see the note above networkShape. An empty collection is
    // a source update; `null` is a teardown.
    const icon = PIN_ICONS[shape];
    /**
     * Every non-cluster layer has to say so once the source clusters.
     *
     * A clustered source emits BOTH kinds of feature, and a layer with no
     * filter draws a cluster as though it were a pin — which for the gauge
     * layer means a bubble of forty stations rendered as one staff mark in one
     * station's colour, sitting exactly where no gauge is.
     *
     * It also leaves out the selected place, which the selection layer draws
     * on top of everything — see selectedShape.
     */
    const solo = unselected(clustering ? ['!', ['has', 'point_count']] : undefined);
    return (
      <Mapbox.ShapeSource
        id={`pins-${id}`}
        // Off is an EMPTY source, never an unmounted one — see MOUNTED, NOT
        // GATED in the render.
        shape={layerOn(id) ? pinShapes[id] : EMPTY_COLLECTION}
        // The map-level handler needs the owning source to expand a cluster.
        ref={clustering ? clusterSourceRefs[`pins-${id}`] : undefined}
        cluster={clustering !== undefined}
        clusterRadius={clustering?.radius}
        clusterMaxZoomLevel={clustering ? NATIVE_CLUSTER_MAX_ZOOM : undefined}
      >
        {clustering ? (
          <Mapbox.SymbolLayer
            id={`pins-${id}-cluster`}
            filter={['has', 'point_count']}
            // The layer's own floor applies to its badges too, or a tier that
            // is meant to be silent at continental zoom announces itself there
            // as one very large count.
            minZoomLevel={minZoom}
            style={PLACE_COUNT_BADGE}
          />
        ) : null}
        {icon && compactUntilZoom !== undefined ? (
          <Mapbox.CircleLayer
            id={pinHitLayerId(`pins-${id}-overview`)}
            filter={solo}
            minZoomLevel={minZoom}
            maxZoomLevel={compactUntilZoom}
            style={{
              circleRadius: 5,
              circleColor: ['get', 'color'],
              // A landing that needs permission is dimmed, on every layer that
              // can draw one — it was only the access layer's dots that did.
              circleOpacity: ['case', ['get', 'privateAccess'], 0.65, 1],
              circleStrokeWidth: 1.5,
              circleStrokeColor: '#FFFFFF',
            }}
          />
        ) : null}
        {icon?.themed ? (
          <Mapbox.CircleLayer
            id={pinHitLayerId(`pins-${id}-badge`)}
            filter={solo}
            minZoomLevel={compactUntilZoom ?? minZoom}
            style={{
              circleRadius: 13,
              circleColor: ['get', 'color'],
              circleStrokeWidth: 2,
              circleStrokeColor: '#FFFFFF',
            }}
          />
        ) : null}
        {icon ? (
          <Mapbox.SymbolLayer
            id={pinHitLayerId(`pins-${id}-icon`)}
            filter={solo}
            minZoomLevel={compactUntilZoom ?? minZoom}
            style={{
              iconImage: icon.image,
              iconAnchor: icon.anchor,
              // NOT OPTIONAL. A SymbolLayer hides colliding icons by default,
              // which on a cluster of access points would silently drop pins —
              // a CircleLayer never did that, and a hazard you cannot see is
              // the one failure this whole layer exists to prevent.
              iconAllowOverlap: true,
              // And an icon that is always drawn must not also BLOCK labels.
              // Placement runs from the top layer down, so an icon that took
              // part in collision dropped every name beneath it — the put-in
              // names most of all, being the lowest place layer.
              iconIgnorePlacement: true,
            }}
          />
        ) : (
          <Mapbox.CircleLayer
            id={pinHitLayerId(`pins-${id}-circle`)}
            filter={solo}
            minZoomLevel={minZoom}
            style={{
              circleRadius: 6,
              circleColor: ['get', 'color'],
              circleStrokeWidth: 2,
              circleStrokeColor: '#FFFFFF',
            }}
          />
        )}
        {/* NO LOCK OVERLAY HERE. A white padlock stamped on the pin was tried
            and removed: every access point on the map is the same KIND of
            place, and a second glyph on some of them read as a second category
            rather than as a note about permission. Eddy's mark is the mark for
            an access point, public or not.
            `privateAccess` stays on the feature — the overview circles dim on
            it, the callout says "permission may be required", and tapping one
            into a float plan still raises a confirmation. The fact is carried
            in words and in behaviour, which is where it survives being glanced
            at. */}
        <Mapbox.SymbolLayer
          id={pinHitLayerId(`pins-${id}-label`)}
          filter={solo}
          // The PIN floor, not the mark floor. A label is allowed to arrive
          // after its pin, never before it — and the pin arrives at `minZoom`:
          // wherever `compactUntilZoom` is set, the overview dot covers
          // [minZoom, compactUntilZoom), so there is geometry under the text
          // from the layer's first zoom. Clamping to `compactUntilZoom` (as
          // this once did) silently re-floored labels the argument said were
          // on, and nothing failed.
          //
          // The one shape this reasoning does not cover is a future caller
          // passing `compactUntilZoom` with the bare `dot` shape, which has no
          // overview layer; no call site does that today.
          minZoomLevel={Math.max(labelMinZoom, minZoom ?? 0)}
          style={{
            // `label`, not `name`: gauges write a short place name into it and
            // everything else falls back to the name it is called.
            textField: ['get', 'label'],
            textSize: 11,
            // Clears whatever is above it: a 6pt dot, or the taller icon.
            textOffset: [0, icon ? icon.labelOffset : 1.2],
            textAnchor: 'top',
            textColor: LABEL_INK,
            textHaloColor: LABEL_HALO,
            textHaloWidth: 1.5,
          }}
        />
      </Mapbox.ShapeSource>
    );
  };

  /**
   * The national tier: thousands of dots, so this one clusters.
   *
   * A SIBLING of pinLayer, not a flag on it: its source is fed by the viewport
   * and the national index rather than a pin list, and it clusters at every
   * zoom up to ZOOM.cluster rather than only when a caller asks.
   *
   * Everything here is deliberately quieter than a curated pin: smaller radius,
   * a 1pt halo instead of 2, labels held back two more zoom levels, and the
   * parchment count badge rather than Eddy's white one. The tier is reference,
   * and it should look like reference.
   */
  const contextGaugeLayer = () => {
    // No early return on an empty list, for the reason above networkShape — and
    // this layer would have hit it harder than any other. Its data empties on
    // every pan below the zoom floor, on every filter that matches nothing, and
    // between a viewport request going out and landing. A source that unmounts
    // takes its four layers out of the style with it, and the next prop change
    // then calls updateLayer against a style they are no longer in.
    //
    // Switching the tier off is an empty source too, not an unmount — see
    // MOUNTED, NOT GATED in the render for why a remount reorders the map.
    return (
      <Mapbox.ShapeSource
        id="pins-allGauges"
        shape={layerOn('allGauges') ? referenceShape : EMPTY_COLLECTION}
        ref={clusterSourceRefs['pins-allGauges']}
        cluster
        clusterRadius={50}
        // Breaks at ZOOM.cluster, like every other clustered layer. It was 11 —
        // three rungs later than the access points beside it — so panning in
        // turned one layer into pins while the other was still bubbles.
        clusterMaxZoomLevel={NATIVE_CLUSTER_MAX_ZOOM}
      >
        {/* The parchment face: reference data, quieter than Eddy's own
            counts, and the same face the web gives these clusters. Neutral
            ALWAYS — a cluster mixes gauges running high with gauges running
            low, so it has no band and must not borrow one.

            Style keys are prefixed (textAllowOverlap, never allowOverlap): an
            unprefixed name is not a Mapbox property, and @rnmapbox throws on it
            at RENDER time, which once took the whole map down. tsc does not
            catch it — the style prop is typed loosely. */}
        <Mapbox.SymbolLayer
          id="pins-allGauges-cluster"
          filter={['has', 'point_count']}
          // The ladder's floor, like every other statewide layer. The screen
          // feeds this source from the national index below the fetch floor,
          // and with no floor here a continental camera drew it anyway.
          minZoomLevel={ZOOM.min}
          style={USGS_COUNT_BADGE}
        />
        <Mapbox.CircleLayer
          id={pinHitLayerId('pins-allGauges-dot')}
          filter={unselected(['!', ['has', 'point_count']])}
          minZoomLevel={ZOOM.min}
          style={{
            circleColor: ['get', 'color'],
            circleStrokeWidth: 1,
            circleStrokeColor: '#FFFFFF',
            // Radius carries discharge, on sqrt already applied by the caller,
            // interpolated so a creek is still tappable and the Mississippi is
            // not a blob. Gauges with no discharge land at the floor.
            circleRadius: [
              'interpolate',
              ['linear'],
              ['get', 'magnitude'],
              0, 3.5,
              10, 5,
              55, 7,
              300, 9,
            ],
          }}
        />
        <Mapbox.SymbolLayer
          id={pinHitLayerId('pins-allGauges-label')}
          filter={unselected(['!', ['has', 'point_count']])}
          // ZOOM.names, with every other label on the map. This tier used to
          // name its dots the moment they stopped being bubbles, which put
          // fourteen thousand place names on screen two rungs before anything
          // else was labelled.
          minZoomLevel={ZOOM.names}
          style={{
            textField: ['get', 'label'],
            textSize: 10,
            textOffset: [0, 1.2],
            textAnchor: 'top',
            textColor: LABEL_INK,
            textHaloColor: LABEL_HALO,
            textHaloWidth: 1.5,
          }}
        />
      </Mapbox.ShapeSource>
    );
  };

  /**
   * One family's bubbles at statewide zoom, and nothing above it.
   *
   * Every layer in the family is in here, and NONE of them draws its own marks
   * below ZOOM.cluster — see the call sites, which all pass that as their floor.
   * So the handover is exact: this source is capped at ZOOM.cluster and the real
   * layers start there, the same way access's own overview dot has always
   * handed over to its icon at ZOOM.places.
   *
   * There are no marks here on purpose. A bubble is a count and a singleton is
   * a coloured dot; both are legible at a zoom where a 22pt tent is not, and
   * neither needs to know which of the family's layers it came from. The dot
   * still wears its own layer's colour, so a lone campground is green and a lone
   * put-in is teal — the sheet's rows stay a legend for what is on the map. A
   * count wears the place badge for both families: a mixed count has no one
   * layer's colour to claim.
   */
  const familyIndexLayer = (
    id: 'places' | 'services',
    shape: ReturnType<typeof featureCollection>,
  ) => (
    <Mapbox.ShapeSource
      id={`pins-${id}-index`}
      shape={shape}
      ref={clusterSourceRefs[`pins-${id}-index`]}
      cluster
      // 46: between access's old 42 and the national tier's 50. A family holds
      // more members in the same ground than any single layer did, and a radius
      // that groups them too tightly leaves a scatter of near-touching bubbles
      // where one count belongs.
      clusterRadius={46}
      clusterMaxZoomLevel={NATIVE_CLUSTER_MAX_ZOOM}
    >
      <Mapbox.SymbolLayer
        id={`pins-${id}-index-cluster`}
        filter={['has', 'point_count']}
        // ZOOM.min is the ladder's floor: nothing statewide draws below it, and
        // a family that ignored it would announce a continental view as one very
        // large count. Same reasoning pinLayer's own cluster badge carries.
        minZoomLevel={ZOOM.min}
        maxZoomLevel={ZOOM.cluster}
        style={PLACE_COUNT_BADGE}
      />
      <Mapbox.CircleLayer
        id={pinHitLayerId(`pins-${id}-index-dot`)}
        filter={unselected(['!', ['has', 'point_count']])}
        minZoomLevel={ZOOM.min}
        maxZoomLevel={ZOOM.cluster}
        style={{
          // The same overview dot every layer draws: 5pt, a 1.5pt ring, and a
          // landing that needs permission dimmed rather than hidden.
          circleRadius: 5,
          circleColor: ['get', 'color'],
          circleOpacity: ['case', ['get', 'privateAccess'], 0.65, 1],
          circleStrokeColor: '#FFFFFF',
          circleStrokeWidth: 1.5,
        }}
      />
    </Mapbox.ShapeSource>
  );

  /**
   * Access points change representation with zoom.
   *
   * At a whole-river view a 22pt pin for every landing hides the river and
   * creates overlapping 44pt hitboxes whose “first” result is arbitrary. Small
   * dots and local clusters answer “where are the access areas?” there. At z10
   * the map is close enough to choose a bank, so every point becomes the
   * bottom-anchored pin; names follow at z11.
   *
   * This is intentionally access-only. Hazards must never disappear into a
   * count, and the statewide gauge tier has its own magnitude-aware treatment.
   */
  const accessLayer = () => (
    <Mapbox.ShapeSource
      id="pins-access"
      // ── THIS SOURCE NO LONGER CLUSTERS, and that is not a loss ───────────
      //
      // It was the only place layer that did, which is what made the map worse
      // the more of the family you switched on: a put-in tagged `campground`
      // left this source to wear a tent, so the bubble it was in got smaller by
      // one and the map got an unclustered mark. The whole family clusters
      // together now, one rung lower down the render, and this source picks the
      // places up at ZOOM.cluster with nothing hidden in between.
      shape={layerOn('access') ? pinShapes.access : EMPTY_COLLECTION}
    >
      <Mapbox.CircleLayer
        id={pinHitLayerId('pins-access-overview')}
        filter={unselected()}
        // The family index draws everything below here. Without the floor the
        // two would both paint at statewide zoom — bubbles with a full scatter
        // of dots under them, which is the crowding this was meant to end.
        minZoomLevel={ZOOM.cluster}
        maxZoomLevel={ZOOM.places}
        style={{
          circleRadius: 5,
          circleColor: ['get', 'color'],
          circleOpacity: ['case', ['get', 'privateAccess'], 0.65, 1],
          circleStrokeColor: '#FFFFFF',
          circleStrokeWidth: 1.5,
        }}
      />
      {/* The badge every other Eddy mark wears, which access alone went
          without — while the same put-in drawn as a route endpoint had one.
          The mark is bottom-anchored, so the badge rides up behind its bulb
          exactly as the endpoint's does. */}
      <Mapbox.CircleLayer
        id={pinHitLayerId('pins-access-badge')}
        filter={unselected()}
        minZoomLevel={ZOOM.places}
        style={{
          circleRadius: 13,
          circleColor: ['get', 'color'],
          circleStrokeColor: '#FFFFFF',
          circleStrokeWidth: 2,
          circleTranslate: [0, -ACCESS_BADGE_LIFT],
          circleTranslateAnchor: 'viewport',
        }}
      />
      <Mapbox.SymbolLayer
        id={pinHitLayerId('pins-access-icon')}
        filter={unselected()}
        minZoomLevel={ZOOM.places}
        style={{
          iconImage: PIN_ICONS.pin?.image ?? 'eddy-access-map',
          iconAnchor: 'bottom',
          iconAllowOverlap: true,
          // Always drawn, so it must not block labels — see pinLayer's icon.
          iconIgnorePlacement: true,
        }}
      />
      {/* No padlock overlay — see the note in the generic pin builder above.
          The private cue at this zoom is the callout and the confirmation
          dialog; at overview zoom it is the dimmed circle below. */}
      <Mapbox.SymbolLayer
        id={pinHitLayerId('pins-access-label')}
        filter={unselected()}
        minZoomLevel={ZOOM.names}
        style={{
          textField: ['get', 'label'],
          textSize: 11,
          textOffset: [0, PIN_ICONS.pin?.labelOffset ?? 0.9],
          textAnchor: 'top',
          textColor: LABEL_INK,
          textHaloColor: LABEL_HALO,
          textHaloWidth: 1.5,
        }}
      />
    </Mapbox.ShapeSource>
  );

  return (
    <View style={styles.fill}>
    <Mapbox.MapView
      ref={mapRef}
      onLayout={(event: { nativeEvent: { layout: { width: number; height: number } } }) => { mapSize.current = event.nativeEvent.layout; }}
      onPress={onMapPress}
      style={[styles.fill, { backgroundColor: colors.bg }]}
      styleURL={STYLE_URL}
      scaleBarEnabled={false}
      // MAPBOX CHROME. The logo is NOT optional — Mapbox's terms require it on
      // every map they render, on every plan tier, and it may not be restyled.
      // It may only be MOVED. Both props are therefore stated explicitly rather
      // than left to a default, so the next reader sees that `logoEnabled` is a
      // legal obligation and not a preference. (The website sidesteps the whole
      // question by running MapLibre on self-hosted styles; the app cannot
      // follow without rebuilding offline packs on a different offline API.)
      //
      // Both sit at the map's BOTTOM EDGE, with everything else on the screen
      // lifted above them instead — see MAP_CHROME_BOTTOM in the map screen.
      //
      // ── EXCEPT when a sheet is open, and then they ride it ──────────────
      // Lifting them over the locate button was not enough, because the thing
      // that actually covers them is the sheet: full-width, bottom-anchored,
      // opaque, and 115pt tall at its SHORTEST. Selecting any pin hid both
      // outright, at every detent, for as long as the sheet was up — which is
      // most of the time anybody spends on this screen.
      //
      // The sheet's settled coverage comes in as ornamentBottomInset, with the
      // safe area already deducted on iOS: Mapbox adds that inset itself. Adding
      // it again puts the branding above Locate instead of in the corner below.
      // Both ornaments keep the same offsets above the sheet as at rest.
      // Settled, not per-frame: these are native props, and the tallest detent
      // is capped so the lifted position always fits (ORNAMENT_BAND).
      //
      // THE OFFSETS ARE MEASURED, NOT TASTE. The wordmark is a fixed 85x21
      // bitmap, so at left:8 its right edge lands at x=93. The (i) is a 44x44
      // .infoLight button with a ~22pt glyph centred in it, so its left:N puts
      // the visible glyph at N+11 — left:90 is what makes the gap between the
      // two read as 8pt, matching the gap the callout's own rows use. Anything
      // larger reads as two unrelated controls rather than one attribution.
      //
      // An 8pt bottom margin keeps the logo close to the safe edge. The info
      // button's 7pt margin preserves their alignment; its 44pt tap frame ends
      // 51pt above the edge, below Locate's 62pt ornament clearance.
      logoEnabled
      logoPosition={{ bottom: 8 + ornamentBottomInset, left: 8 + ornamentLeftInset }}
      attributionEnabled
      attributionPosition={{ bottom: 7 + ornamentBottomInset, left: 90 + ornamentLeftInset }}
      // The camera settled. This is the ONLY viewport-driven fetch in the app
      // — everything else loads a bounded set up front — and it is on idle
      // rather than onCameraChanged because idle fires once when motion stops
      // and already carries bounds and zoom. onCameraChanged fires per frame,
      // which on a fling is a request per frame unless it is throttled first.
      onMapIdle={
        onViewportChange
          ? (state: MapIdleState) => {
              const sw = state?.properties?.bounds?.sw;
              const ne = state?.properties?.bounds?.ne;
              const zoom = state?.properties?.zoom;
              if (!sw || !ne || typeof zoom !== 'number') return;
              const center = state?.properties?.center;
              onViewportChange({
                bounds: [sw[0], sw[1], ne[0], ne[1]],
                zoom,
                center:
                  center &&
                  Number.isFinite(center[0]) &&
                  Number.isFinite(center[1])
                    ? [center[0], center[1]]
                    : undefined,
              });
            }
          : undefined
      }
      onCameraChanged={onCameraChanged}
    >
      {/* defaultSettings is not optional in the bounds case. `bounds` alone is
          applied as an UPDATE, and on first mount there is nothing to update
          from — the map opens on the default world view and stays there, which
          looks like a spinning globe rather than a river. */}
      <Mapbox.Camera
        ref={cameraRef}
        defaultSettings={defaultCameraSettings}
      />

      {/* The bundled pin shapes. Registered once for the whole map — an
          iconImage name resolves against every Images component on the view,
          so this does not belong inside pinLayer, where it would re-register
          the same assets for each layer that uses one. */}
      <Mapbox.Images images={PIN_IMAGES} onImageMissing={onPinImageMissing} />

      {/* Rendered only once permission exists. @rnmapbox/maps triggers the
          system prompt itself the moment this mounts, which would spend the
          one-shot iOS dialog on merely opening the Map tab. */}
      {showUserLocation ? <Mapbox.UserLocation visible /> : null}

      {/* ── Public land ───────────────────────────────────────────────────
          FIRST of everything, under the radar and under every river line and
          pin. This is the GROUND the river runs through: it is context for the
          data on top of it and must never compete with it. Rain sits above it
          for the obvious reason.

          OWNERSHIP, NOT PERMISSION. The fill says a public agency owns this;
          it does not say anyone may land, camp or portage. The layer sheet
          carries that sentence under the switch and the callout repeats it —
          it is not left to the colour to imply.

          THE ENCODING IS WEIGHT, NOT HUE. One earth-tone family, with how
          present a parcel looks standing for how much the agency will commit
          to: open is solid and most filled, unknown is faintest and dashed.
          None of the four colours appears in CONDITION_SYSTEM or the flow ramp,
          and that is a hard rule — red, amber and green on this map already
          mean "do not float", "use caution" and "go", about the water, from a
          reading Eddy stands behind. A federal ownership class may not borrow
          that weight, least of all when 296 of the 1,753 parcels loaded say the
          agency does not know.

          The source is mounted unconditionally and empties when the layer is
          off — see publicLandShape for why that is not the same choice the
          radar makes. */}
      <Mapbox.ShapeSource id="public-lands" shape={publicLandShape}>
        <Mapbox.FillLayer
          id="public-lands-fill"
          // Alpha is baked into the colour rather than set as fillOpacity: one
          // data-driven property instead of two that have to agree.
          style={{ fillColor: accessMatch((c) => PUBLIC_LAND_ACCESS_STYLE[c].fill) as never }}
        />
        {/* TWO line layers rather than one, because lineDasharray is not a
            data-driven property in either renderer. Colour and width are
            expressions; the solid/dashed split has to be a filter. */}
        <Mapbox.LineLayer
          id="public-lands-line-open"
          filter={['==', ['get', 'access'], 'OA'] as never}
          style={{
            lineColor: PUBLIC_LAND_ACCESS_STYLE.OA.line,
            lineWidth: 1.4,
            lineOpacity: 0.9,
          }}
        />
        <Mapbox.LineLayer
          id="public-lands-line-restricted"
          filter={['!=', ['get', 'access'], 'OA'] as never}
          style={{
            lineColor: accessMatch((c) => PUBLIC_LAND_ACCESS_STYLE[c].line) as never,
            lineWidth: 1.1,
            lineOpacity: 0.85,
            // Short dashes read as "provisional" at every zoom this layer draws
            // at; longer ones start to look solid on a small parcel, which is
            // the one thing this line must not say.
            lineDasharray: [2, 1.5],
          }}
        />
      </Mapbox.ShapeSource>

      {/* ── Weather radar ─────────────────────────────────────────────────
          FIRST among the data layers, so every river line and every pin draws
          on top of it. Radar is the one layer here that is not about the
          water: it answers "is it raining on me" and must never sit over the
          thing the screen is actually for. Children stack in render order, so
          position is the whole mechanism.

          The first RasterSource in this app. Everything else is a ShapeSource
          of our own GeoJSON; this streams PNGs from Iowa State (see
          RADAR_TILE_URL for why not NOAA directly, which cannot be consumed by
          Mapbox's iOS SDK at all).

          Unmounted rather than hidden when the layer is off. A raster source
          left mounted at zero opacity still fetches every tile in the viewport
          on every pan — a real cost on cellular, for something invisible. */}
      {layerOn('weatherRadar') ? (
        <Mapbox.RasterSource
          id="weather-radar"
          tileUrlTemplates={[RADAR_TILE_URL]}
          tileSize={256}
          // The composite is national; there is nothing outside CONUS to draw
          // and no point asking for it.
          minZoomLevel={MIN_RADAR_ZOOM}
          maxZoomLevel={MAX_RADAR_ZOOM}
        >
          <Mapbox.RasterLayer
            id="weather-radar-layer"
            style={{ rasterOpacity: RADAR_OPACITY }}
          />
        </Mapbox.RasterSource>
      ) : null}

      {/* ── The statewide network ─────────────────────────────────────────
          Every curated river, coloured by its live condition, drawn UNDER the
          selected river and its pins. This is what makes the map able to
          answer "where can I float today?" without knowing the answer first.

          Out-of-filter rivers are dimmed to 0.16, not hidden. Hiding them
          removes their tap target too, and a map that empties when you tap a
          filter reads as broken rather than filtered — the same call the
          website's Observatory made. The selected river is drawn separately
          below and is never dimmed. */}
      <Mapbox.ShapeSource id="network" shape={networkShape}>
        {/* Casing first: a dark outline under the colour keeps a thin river
            legible over both the green forest and the pale gravel of the
            outdoors style, which the condition colour alone does not. */}
        <Mapbox.LineLayer
          id="network-casing"
          style={{
            lineColor: 'rgba(0,0,0,0.28)',
            lineWidth: networkWidths.casing,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
        <Mapbox.LineLayer
          id="network-fill"
          style={{
            // Per RUN, not per river: buildNetwork cuts each line where the
            // colour changes, so this reads a gradient off the geometry.
            lineColor: ['get', 'color'],
            lineWidth: networkWidths.fill,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      </Mapbox.ShapeSource>

      {/* FALLBACK ONLY, and usually empty. The network draws every curated
          river including the selected one; this covers the case where it has
          not loaded, or a river reached by deep link that the statewide dataset
          does not carry. Flat, because without the network there are no
          per-gauge stops to fade between either. See detailShape for why it
          empties rather than unmounting. */}
      <Mapbox.ShapeSource id="river-line" shape={detailShape}>
        <Mapbox.LineLayer
          id="river-line-casing"
          style={{ lineColor: 'rgba(0,0,0,0.35)', lineWidth: 7, lineCap: 'round', lineJoin: 'round' }}
        />
        <Mapbox.LineLayer
          id="river-line-fill"
          style={{
            lineColor: stroke,
            lineWidth: 4,
            lineCap: 'round',
            lineJoin: 'round',
            // Dimmed under a plan so the floated stretch is the bright part.
            // Still visible: the rest of the river is context for where the
            // float sits, not clutter to hide.
            lineOpacity: routeFeature ? 0.35 : 1,
          }}
        />
      </Mapbox.ShapeSource>

      {/* Persistent route layers stay below POI art even when a plan arrives late. */}
      <Mapbox.ShapeSource id="plan-route" shape={routeFeature ?? EMPTY_COLLECTION}>
        <Mapbox.LineLayer
          id="plan-route-casing"
          aboveLayerID="river-line-fill"
          style={{ lineColor: 'rgba(0,0,0,0.4)', lineWidth: 10, lineCap: 'round', lineJoin: 'round' }}
        />
        <Mapbox.LineLayer
          id="plan-route-fill"
          aboveLayerID="plan-route-casing"
          style={{ lineColor: colors.accent, lineWidth: 6, lineCap: 'round', lineJoin: 'round' }}
        />
      </Mapbox.ShapeSource>

      {/* ── Mile posts ─────────────────────────────────────────────────────
          Over the river lines, under every pin: a mile number is context for
          the places on the water, never competition for them. No onPress —
          a post is a coordinate with a label, not a place with a sheet. The
          labels collide-suppress against the pin labels (no textAllowOverlap)
          so a put-in's name always beats the number beside it. Mounted
          unconditionally and empty when no river is selected — the teardown
          rule every source here follows.

          THE NUMBER IS THE MARKER. There used to be a tick CircleLayer under
          each label, and circles do not collision-check: next to a labelled
          put-in the number lost and the tick stayed — an anonymous dark dot
          that looked tappable and, tapped, fell through to the river line and
          opened the river sheet. One SymbolLayer per tier means the mile
          either appears whole, centred on its point, or not at all. */}
      <Mapbox.ShapeSource id="mile-posts" shape={milePostShape}>
        <Mapbox.SymbolLayer
          id="mile-posts-major-label"
          filter={['get', 'major']}
          minZoomLevel={ZOOM.names}
          style={{
            textField: ['get', 'label'],
            textSize: 10,
            textAnchor: 'center',
            textColor: LABEL_INK,
            textHaloColor: LABEL_HALO,
            textHaloWidth: 1.5,
          }}
        />
        {/* Every-mile posts wait for z12: a reader there is pacing a stretch
            rather than choosing a river, and 130 numbers at river zoom would
            be noise beside the ten that already say where you are. */}
        <Mapbox.SymbolLayer
          id="mile-posts-minor-label"
          filter={['!', ['get', 'major']]}
          minZoomLevel={12}
          style={{
            textField: ['get', 'label'],
            textSize: 10,
            textAnchor: 'center',
            textColor: LABEL_INK,
            textHaloColor: LABEL_HALO,
            textHaloWidth: 1.5,
          }}
        />
      </Mapbox.ShapeSource>

      {/* ── MOUNTED, NOT GATED ───────────────────────────────────────────────
          Every pin source from here down is mounted for the life of the map,
          and a layer that is off hands its source an EMPTY collection.

          They used to mount behind `layerOn(...)`, and that silently broke the
          draw order this block is written in. @rnmapbox adds a layer with no
          position to the TOP of the style when it mounts, so the JSX order
          only held for layers present on the first render: switch "All gauges"
          on mid-session and its parchment counts drew over rated gauges and
          hazards; toggle Camping off and on and the tents rose above the
          hazard triangles. An empty source costs nothing and keeps its slot.

          The national tier goes FIRST of the pin layers, so everything Eddy has
          curated paints over it. A reference dot must never sit on top of a
          rated gauge, an access point or a hazard — it is the layer with the
          least to say and the most members. */}
      {contextGaugeLayer()}

      {/* ── The two family indexes, under everything they consolidate ───────
          Below ZOOM.cluster these are the ONLY thing the place layers draw, so
          they go first: a rated gauge's verdict and a hazard must paint over a
          count of cabins, never under it. Each holds only the members whose
          layer is on, so a family with nothing on draws nothing. */}
      {familyIndexLayer('places', placesIndexShape)}
      {familyIndexLayer('services', servicesIndexShape)}

      {accessLayer()}
      {/* ── THE FAMILY INDEX OWNS THE BAND BELOW ZOOM.cluster ────────────────
          These four start AT ZOOM.cluster and are compact dots until
          ZOOM.places. Below the cluster rung they draw nothing at all, because
          familyIndexLayer is already drawing one bubble per FAMILY there —
          which is the point of it: a bubble per layer would count overlapping
          halves of one population, and a put-in tagged `campground` leaving the
          access source to wear a tent would drop the access count by 123 at the
          exact moment 123 tents appeared.

          An earlier pass here gave them ZOOM.min instead, on the narrower
          reading that a floor was all they were missing. That is wrong against
          this design and map-zoom-ladder.test.ts fails on it: ZOOM.min leaves a
          band where the index's bubbles and the full scatter of dots paint
          together, which is the crowding the index replaced. The floor and the
          index's ceiling have to be the same rung, and neither half fails
          loudly on its own — hence the test. */}
      {pinLayer('outfitters', 'outfitter', ZOOM.names, ZOOM.cluster, ZOOM.places)}
      {pinLayer('lodging', 'lodging', ZOOM.names, ZOOM.cluster, ZOOM.places)}
      {pinLayer('campgrounds', 'campground', ZOOM.names, ZOOM.cluster, ZOOM.places)}

      {/* ── Springs ride the standard rungs, and count with the places ───────
          Below ZOOM.cluster they are members of the places family index (see
          placesIndexShape); from it, this layer.
          The same three arguments as the place layers above, deliberately: a
          spring is a destination like a campground is, there are a few dozen of
          them statewide, and nothing about one is urgent. It is emphatically
          NOT the hazards case — a hazard may not disappear into a count because
          missing it hurts you; missing a spring in a bubble costs a zoom.

          Drawn AFTER the place layers so a spring paints over a put-in where
          the two land together, which they do at Alley, Big and Bennett: the
          access dedupe (spring-dedupe.ts) keeps a spring OUT of this layer when
          it is already an access point, so anything drawing here is a feature
          the access layer is not showing, and it should not be buried by one. */}
      {pinLayer('springs', 'spring', ZOOM.names, ZOOM.cluster, ZOOM.places)}
      {/* Drawn exactly as the campgrounds layer is, because it is exactly the
          same handover: a put-in leaves the access source and wears its own mark
          for as long as this tier is on — so it has to rejoin the ladder at the
          same rung the tents do, or the handover swaps one representation for a
          differently-sized one mid-zoom. */}
      {pinLayer('boatRamps', 'boatRamp', ZOOM.names, ZOOM.cluster, ZOOM.places)}
      {/* ── Rated gauges: the same rungs as every place, with no exception ───
          Count badges to ZOOM.cluster, compact condition dots to
          GAUGE_DETAIL_ZOOM (ZOOM.places), the staff mark, names at ZOOM.names,
          and the ZOOM.min floor.

          The count is only a count. For a while a rated cluster was painted
          with the worst condition inside it; that made a count's colour mean a
          verdict on one badge and a category on the next, and it still could
          not say WHICH gauge was in flood. The verdict stays where it can be
          acted on — the coloured river lines at every zoom, and these pins once
          the cluster breaks.

          This layer used to sit out two rungs, as dams did. It kept no floor
          ("the curated set is already in memory, so a floor protects no
          fetch") and was named a full rung early, at GAUGE_DETAIL_ZOOM. Both
          made the gauge layer louder than the map around it. Below ZOOM.min the
          coloured river lines already answer "where is the water"; a station's
          name arrives when every other name does. */}
      {pinLayer('gauges', 'drop', ZOOM.names, ZOOM.min, GAUGE_DETAIL_ZOOM, { radius: 40 })}
      {/* ── ON THE LADDER, like every other statewide layer, with NO exception ─
          Count badges to ZOOM.cluster, overview dots to ZOOM.places, the mark,
          then the name at ZOOM.names — the same rungs as every place layer, and
          the same ZOOM.min floor.

          Dams used to sit out two of those. Their labels were on at every zoom
          ("two dozen landmarks — an unnamed dot cannot be told from the lake it
          sits on"), and they kept no floor, because the pins ship in the binary
          and a floor here protects no fetch. On a device both read as the dam
          layer being louder than the map around it: a statewide view with one
          kind of place named and nothing else, and dam badges where every other
          layer had already gone quiet. A dam is a place like a campground is;
          its name arrives when names do, and the sheet names it on a tap.

          Drawn before hazards so the low-water-dam layer still paints on top:
          where both land in one place, the one that can kill you is on top. */}
      {pinLayer('dams', 'dam', ZOOM.names, ZOOM.min, ZOOM.places, { radius: 40 })}

      {/* ── Numbered stacks, the web planner's mark ───────────────────────
          The place count badge at the web's own 34pt: a white rounded
          square, a Deep River Teal ring and a hard offset shadow, as on
          eddy.guide's planner. The number is how many places are under it.
          Above every place layer, because it stands in for their members,
          and below the selection and hazards, which never join a stack.
          The tap target is the 44pt query box around the finger. */}
      <Mapbox.ShapeSource id="pins-stacks" shape={stackShape}>
        {/* One symbol, image and number together — see PLACE_COUNT_BADGE for
            why a separate count layer drew underneath the face. */}
        <Mapbox.SymbolLayer
          id={pinHitLayerId('pins-stacks-face')}
          style={{
            // A stack of nothing but USGS reference gauges wears their
            // parchment face, as their own counts do; any Eddy member makes it
            // an Eddy count.
            iconImage: ['match', ['get', 'face'], 'usgs', 'eddy-count-stack-usgs-map', 'eddy-count-stack-map'],
            textField: ['to-string', ['get', 'count']],
            textSize: 14,
            // Both faces are light in both schemes, like every pin badge here,
            // so the number is dark ink rather than colors.text.
            textColor: ['match', ['get', 'face'], 'usgs', USGS_COUNT_INK, COUNT_INK],
            // Always drawn, but it TAKES PART in placement: a stack covers the
            // places under it, so the labels beside it should give way rather
            // than print across its face, which ignore-placement made them do.
            iconAllowOverlap: true,
            textAllowOverlap: true,
          }}
        />
      </Mapbox.ShapeSource>

      <Mapbox.ShapeSource id="plan-endpoints" shape={endpointFeatures}>
        {(['center', 'bottom'] as const).map(anchor => (
          <Mapbox.CircleLayer
            key={anchor}
            id={pinHitLayerId(`plan-endpoints-${anchor}-badge`)}
            filter={['==', ['get', 'anchor'], anchor]}
            style={{
              circleRadius: selectedPinId
                ? ['case', ['==', ['get', 'id'], selectedPinId], 15, 13] : 13,
              circleColor: ['get', 'color'],
              circleStrokeColor: '#FFFFFF',
              // The selected ring every other layer's selection wears.
              circleStrokeWidth: selectedPinId
                ? ['case', ['==', ['get', 'id'], selectedPinId], 3.5, 2] : 2,
              // A generic access pin is bottom-anchored. Keep its coloured
              // backing behind the icon rather than centred on its tip.
              circleTranslate: anchor === 'bottom' ? [0, -ACCESS_BADGE_LIFT] : [0, 0],
              circleTranslateAnchor: 'viewport',
            }}
          />
        ))}
        <Mapbox.SymbolLayer
          id={pinHitLayerId('plan-endpoints-icon')}
          style={{
            iconImage: ['get', 'image'],
            iconSize: selectedPinId
              ? ['case', ['==', ['get', 'id'], selectedPinId], SELECTED_SCALE, 1] : 1,
            iconAnchor: ['get', 'anchor'],
            iconAllowOverlap: true,
          }}
        />
        <Mapbox.SymbolLayer
          id={pinHitLayerId('plan-endpoints-label')}
          style={{
            textField: ['get', 'label'],
            textSize: 12,
            textOffset: [0, 1.4],
            textAnchor: 'top',
            textColor: LABEL_INK,
            textHaloColor: LABEL_HALO,
            textHaloWidth: 1.8,
          }}
        />
      </Mapbox.ShapeSource>

      {/* ── The selected place, over every place layer ─────────────────────
          See selectedShape. Above the stacks and the route endpoints, because
          the open sheet is about it; below hazards, because nothing outranks a
          hazard — a selected put-in must not hide the low-water dam beside it.
          Its name is always drawn and wins collision over its neighbours'. */}
      <Mapbox.ShapeSource id="pins-selected" shape={selectedShape}>
        {(['center', 'bottom'] as const).map(anchor => (
          <Mapbox.CircleLayer
            key={anchor}
            id={pinHitLayerId(`pins-selected-${anchor}-badge`)}
            filter={['all', ['==', ['get', 'anchor'], anchor], ['!=', ['get', 'image'], '']]}
            style={{
              circleRadius: 15,
              circleColor: ['get', 'color'],
              circleStrokeColor: '#FFFFFF',
              circleStrokeWidth: 3.5,
              circleTranslate: anchor === 'bottom' ? [0, -ACCESS_BADGE_LIFT * SELECTED_SCALE] : [0, 0],
              circleTranslateAnchor: 'viewport',
            }}
          />
        ))}
        <Mapbox.CircleLayer
          id={pinHitLayerId('pins-selected-dot')}
          filter={['==', ['get', 'image'], '']}
          style={{
            circleRadius: 7,
            circleColor: ['get', 'color'],
            circleStrokeColor: '#FFFFFF',
            circleStrokeWidth: 3,
          }}
        />
        <Mapbox.SymbolLayer
          id={pinHitLayerId('pins-selected-icon')}
          filter={['!=', ['get', 'image'], '']}
          style={{
            iconImage: ['get', 'image'],
            iconSize: SELECTED_SCALE,
            iconAnchor: ['get', 'anchor'],
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
          }}
        />
        <Mapbox.SymbolLayer
          id={pinHitLayerId('pins-selected-label')}
          style={{
            textField: ['get', 'label'],
            textSize: 12,
            textOffset: ['get', 'labelOffset'],
            textAnchor: 'top',
            textColor: LABEL_INK,
            textHaloColor: LABEL_HALO,
            textHaloWidth: 1.8,
            // Always drawn, and it still takes part in placement: being on top,
            // it is placed first, so a neighbour's name gives way to it rather
            // than printing over it.
            textAllowOverlap: true,
          }}
        />
      </Mapbox.ShapeSource>

      {/* ── Hazards get a dot rung, and do NOT get a bubble ────────────────
          Nineteen marks are not what crowded this map, but they were the
          loudest thing on it: full warning triangles at continental zoom, drawn
          over the two layers that answer which river to drive to. A severity
          dot below ZOOM.cluster says "there is something here" in the same
          colour without shouting it, and the triangle arrives one rung earlier
          than the place marks do — at ZOOM.cluster rather than ZOOM.places —
          because a hazard should resolve as soon as the bubbles break.

          NO CLUSTER, deliberately, and this is the one layer where that is a
          rule rather than a tuning: a hazard must never disappear into a count.
          The floor is the ladder's own — below it there is no river to read a
          hazard against, and every other statewide layer is silent there.

          LAST of the pin sources, over the route endpoints and the selection.
          It once drew before the endpoints, so a put-in badge covered the
          low-water-dam triangle at the same landing — the one inversion of
          "a hazard must never be hidden under a put-in" the draw-order note at
          the top of this file exists to prevent. */}
      {pinLayer('hazards', 'hazard', ZOOM.names, ZOOM.min, ZOOM.cluster)}
    </Mapbox.MapView>
    {placesListOpen ? (
      <MapPlacesSheet
        title="Places in this area"
        searchable
        pins={[...byId.values()].filter((pin) => {
          const bounds = visibleViewport?.bounds;
          if (!bounds || !layers.includes(pin.layer)) return false;
          const { lng, lat } = pin.coordinates;
          return lng >= bounds[0] && lng <= bounds[2] && lat >= bounds[1] && lat <= bounds[3];
        })}
        center={visibleViewport ? [
          (visibleViewport.bounds[0] + visibleViewport.bounds[2]) / 2,
          (visibleViewport.bounds[1] + visibleViewport.bounds[3]) / 2,
        ] : null}
        onClose={() => onClosePlacesList?.()}
        onSelect={(pin) => { onClosePlacesList?.(); onSelectPin?.(pin); }}
      />
    ) : null}
    {publicLand ? <PublicLandCallout land={publicLand} onClose={() => setPublicLand(null)} /> : null}
    {stackChoice ? (
      <MapPlacesSheet
        title={`${stackChoice.length} places here`}
        pins={stackChoice}
        onClose={() => setStackChoice(null)}
        onSelect={(pin) => { setStackChoice(null); onSelectPin?.(pin); }}
      />
    ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

