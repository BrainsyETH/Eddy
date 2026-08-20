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
// endpoints remain SDF because their solid action colour is their whole job.
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
import type {
  CampsiteAvailabilitySummary,
  Hazard,
  MapAccessPoint,
  MapGauge,
  PublicLandAccess,
  PublicLandFeature,
  RiverGeometry,
  RiverService,
} from '@eddy/types';
import {
  accessPointTypes,
  accessTypeLabel,
  hasCoordinates,
  PUBLIC_LAND_ACCESS_STYLE,
} from '@eddy/types';
import {
  hazardConditionCode,
  hazardTypeLabel,
  portageNote,
  severityLabel,
} from '@eddy/hazards';
import { CONDITION_ORDER } from '@eddy/conditions';
import { alarmRank, conditionColor, conditionLabel } from '@/theme/conditions';
import { neutral, primary, type Palette } from '@/theme/palette';
import { useTheme } from '@/theme/ThemeProvider';
import { readingAge } from '@/lib/readingCopy';
import {
  gaugeConditionCode,
  gaugePlaceLabel,
  gaugeReadingText,
  gaugeRiverSlug,
} from '@/lib/gaugeCondition';
import type { NetworkCollection } from '@/lib/statewideNetwork';
import { loadMapbox, STYLE_URL } from './runtime';
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
import type { MapBounds, MapCameraCommand } from '@/map/cameraBehavior';

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
  | 'dam';

/**
 * The bundled map icons, and how each one sits on its coordinate.
 *
 * ANCHORING IS THE POINT OF THE DISTINCTION. A droplet is a symbol for the
 * thing, so it centres on the gauge. A map marker is a POINTER — its tip is the
 * location and its bulb is a label floating above it — so it anchors at the
 * bottom. Centre a marker and every access point sits half a pin upstream of
 * where it actually is.
 *
 * `scale: 3` is what makes a 66px asset draw at 22pt rather than 66.
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
};

const PIN_IMAGES = {
  'eddy-gauge-map': { image: require('../../assets/map/eddy-gauge.png'), sdf: false, scale: 3 },
  'eddy-access-map': { image: require('../../assets/map/eddy-access.png'), sdf: false, scale: 3 },
  'eddy-hazard-map': { image: require('../../assets/map/eddy-hazard.png'), sdf: false, scale: 3 },
  'eddy-campground-map': { image: require('../../assets/map/eddy-campground.png'), sdf: false, scale: 3 },
  // `sdf: false` with the rest of the place marks. These are full-colour themed
  // art generated by build-map-icons.py's `themed` pass; SDF is route endpoints
  // and the retained legacy shapes only, and registering this one as SDF would
  // draw it as a solid silhouette in whatever colour the layer last set.
  'eddy-boat-ramp-map': { image: require('../../assets/map/eddy-boat-ramp.png'), sdf: false, scale: 3 },
  'eddy-outfitter-map': { image: require('../../assets/map/eddy-outfitter.png'), sdf: false, scale: 3 },
  'eddy-lodging-map': { image: require('../../assets/map/eddy-lodging.png'), sdf: false, scale: 3 },
  'eddy-dam-map': { image: require('../../assets/map/eddy-dam.png'), sdf: false, scale: 3 },
  'route-start': { image: require('../../assets/map/route-start.png'), sdf: true, scale: 3 },
  'route-finish': { image: require('../../assets/map/route-finish.png'), sdf: true, scale: 3 },
};

/**
 * Module scope, not an inline arrow. Mapbox.Images is a PureComponent, so a
 * fresh callback on every render makes it re-register every image against the
 * style on every render of this screen — which is pure work at best, and at
 * worst touches the style while layers are being updated.
 *
 * Should be unreachable: these are bundled, not sprite-sheet names. Said out
 * loud anyway, because the symptom is invisible pins.
 */
function onPinImageMissing(name: string) {
  warn('map', `missing pin image "${name}" — pins in that layer will not draw`);
}

/**
 * A layer's own colour, from the single catalog every surface reads.
 *
 * Module scope so the pin-shape memo below can call it without taking the whole
 * palette as a dependency through a closure — and because it is a pure lookup
 * with no reason to be rebuilt per render.
 */
function layerColorFor(key: LayerKey, colors: Palette): string {
  return MAP_LAYERS.find((l) => l.key === key)!.color(colors);
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
 * Cluster fill for the national gauge layer.
 *
 * Mid teal from the brand scale, and pointedly NOT a flow-band or condition
 * colour: a cluster of forty gauges has no single reading and therefore no
 * band. Painting it with one would average five verdicts into a sixth that
 * nobody computed.
 */
const CLUSTER_FILL = primary[600];

/**
 * A rated-gauge cluster's aggregate: the WORST verdict inside it.
 *
 * ── Why the rated tier clusters at all now ─────────────────────────────────
 *
 * It did not, and this file argued at length that it must not: "a rated pin
 * disappearing into a grey bubble would break the one promise that layer makes,
 * which is that its colour is a verdict you can act on." The promise is right.
 * The grey bubble was the problem with it.
 *
 * `clusterProperties` reduces over the members, so a cluster is not obliged to
 * be an average of five verdicts — it can be the most alarming one, which is
 * the only summary of mixed river conditions that is safe to show. Ten gauges
 * where one is in flood collapse into a RED bubble, not a teal count. Nothing
 * is hidden that mattered: the worst news survives the collapse, and one tap
 * expands it into the individual dots.
 *
 * `min`, because CONDITION_SYSTEM ranks most-alarming FIRST — dangerous is 0.
 * See alarmRank, which is the only place that ordering is read.
 */
const CLUSTER_WORST = {
  worst: [['min', ['accumulated'], ['get', 'worst']], ['get', 'severity']],
} as const;

/**
 * Paint a cluster in the colour of the worst condition it holds.
 *
 * Built from the ladder rather than written out, so a new condition code is
 * carried here by adding it to CONDITION_SYSTEM and nothing else. The fallback
 * is the neutral teal the national tier uses — correct for a bubble whose
 * members carry no verdict at all.
 *
 * A module constant rather than something built during render: condition colour
 * does not depend on the theme (the tints composite over both schemes — see
 * theme/conditions), and a fresh array on every pass is a style prop that never
 * compares equal, which is a native paint update per render for a value that
 * never changes.
 */
const CLUSTER_CONDITION_COLOR: unknown[] = [
  'match',
  ['get', 'worst'],
  ...CONDITION_ORDER.flatMap((code) => [alarmRank(code), conditionColor(code)]),
  CLUSTER_FILL,
];

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

interface MapCameraRef {
  setCamera: (stop: {
    centerCoordinate?: [number, number];
    bounds?: { ne: [number, number]; sw: [number, number] };
    zoomLevel?: number;
    padding?: { paddingTop: number; paddingBottom: number; paddingLeft: number; paddingRight: number };
    animationMode?: 'easeTo';
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
 * The one useful thing you can do with an outfitter from a riverbank.
 *
 * Phone first: at a take-out with a dead shuttle plan, a number you can tap
 * beats a website you have to load. Returns null rather than a dead button when
 * the row has neither — a "Call" that does nothing is worse than no button.
 */
function serviceLink(service: RiverService): { label: string; url: string } | null {
  if (service.phone) {
    return { label: `Call ${service.phone}`, url: `tel:${service.phone.replace(/[^\d+]/g, '')}` };
  }
  if (service.website) {
    const url = /^https?:\/\//i.test(service.website) ? service.website : `https://${service.website}`;
    return { label: 'Open website', url };
  }
  return null;
}

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
   * one layer that is on by default: the detail screen existed and was
   * reachable only by finding the same put-in again in the river screen's list.
   */
  detailRoute?: string | null;
  /** True when an access location requires permission rather than being public. */
  privateAccess?: boolean;
}

/**
 * One quiet type cue for an access label.
 *
 * A point may be six things at once, so six pin silhouettes would turn the map
 * into a legend test. This picks the most decision-useful non-generic role and
 * writes it into the close-zoom label instead: “Campground · Cedar Grove”. The
 * callout still lists every role after selection.
 */
function accessLabel(point: MapAccessPoint): string {
  const cueOrder = ['campground', 'boat_ramp', 'gravel_bar', 'bridge', 'park'];
  const types = accessPointTypes(point);
  const cue = cueOrder.find((type) => types.includes(type));
  return cue ? `${accessTypeLabel(cue)} · ${point.name}` : point.name;
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
 * The canonical presentation object for an access point.
 *
 * Exported because a search result needs to open the exact callout RiverMap
 * would create after the river-scoped access response arrives. Keeping this in
 * one builder prevents search and tap selection from drifting apart.
 */
export function mapAccessPointPin(
  point: MapAccessPoint,
  riverSlug: string | null,
  /**
   * WHICH ICON THE FINGER LANDED ON, when the caller knows.
   *
   * Defaults to the generic access layer, which is right for a search result or
   * a row in a list — neither came from an icon. It is NOT right for a
   * re-selection: the campgrounds and access layers draw the same access point
   * under different marks, and `layer` is the only record of which one was
   * tapped. Rebuilding a tapped tent as an `access` pin silently changes the
   * sheet's mark (placeSymbol), the tab it opens on (initialTabKey) and the fact
   * its glance reserves room for (decisionSlot) — all three read this field.
   */
  layer: LayerKey = 'access',
): MapPin {
  return {
    id: `access:${point.id}`,
    name: point.name,
    label: accessLabel(point),
    layer,
    subtitle: `Mile ${point.riverMile.toFixed(1)}`,
    coordinates: point.coordinates,
    privateAccess: !point.isPublic,
    imageUrl: point.imageUrls?.[0] ?? null,
    detailRoute:
      riverSlug && point.slug ? `/river/${riverSlug}/access/${point.slug}` : null,
  };
}

interface Props {
  /**
   * Extra bottom padding for the camera, in points.
   *
   * The map sheet passes its settled height, so a selected pin frames into the
   * part of the map still visible above it. Updated on SETTLE only — a
   * per-frame version would be a native prop write on every frame of a drag.
   */
  cameraPaddingBottom?: number;
  /**
   * How far to lift the Mapbox logo and attribution off the map's bottom edge.
   *
   * SEPARATE FROM cameraPaddingBottom, and it must stay separate. That one is
   * about framing and is clamped to 55% of the map, because past that Mapbox's
   * own framing gets unreliable and there is nothing left to keep in view. This
   * one is about VISIBILITY and may not be clamped at all: the ornaments are a
   * term of the licence, so whatever the sheet covers they have to clear. The
   * sheet's tallest detent is capped to guarantee they can — see ORNAMENT_BAND.
   */
  ornamentBottomInset?: number;
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
  onViewportChange?: (viewport: { bounds: [number, number, number, number]; zoom: number }) => void;
  /** A tapped cluster: the caller issues a one-shot closer camera command. */
  onZoomToCluster?: (point: { lng: number; lat: number }) => void;
  hazards: Hazard[];
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
  planEndpoints?: { putIn: MapAccessPoint; takeOut: MapAccessPoint } | null;
  /** The open callout's pin, used only to give its map mark a selected state. */
  selectedPinId?: string | null;
  onSelectPin?: (pin: MapPin) => void;
}

/**
 * GeoJSON for one layer.
 *
 * `color` is written onto every feature, not just the ones that override it, so
 * the paint expression can be a flat `['get','color']` rather than a `case` that
 * has to test for the property's presence.
 */
function featureCollection(pins: MapPin[], defaultColor: string) {
  return {
    type: 'FeatureCollection' as const,
    features: pins.map((pin) => ({
      type: 'Feature' as const,
      id: pin.id,
      properties: {
        id: pin.id,
        name: pin.name,
        label: pin.label ?? pin.name,
        color: pin.color ?? defaultColor,
        magnitude: pin.magnitude ?? 0,
        privateAccess: pin.privateAccess ?? false,
        // Written on every feature so a CLUSTER can reduce over it — see
        // CLUSTER_WORST and the gauge layer's paint. A pin with no condition
        // lands on `unknown`, which is the calmest rank and therefore never
        // wins a bubble it has nothing to say about.
        severity: alarmRank(pin.code ?? 'unknown'),
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [pin.coordinates.lng, pin.coordinates.lat],
      },
    })),
  };
}

export function RiverMap({
  cameraPaddingBottom,
  ornamentBottomInset = 0,
  river,
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
  onSelectPin,
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
        .map(({ service: s, layers: serviceLayers }) => ({
          // ── ONE ID NAMESPACE FOR A SERVICE, WHATEVER MARK IT WEARS ─────
          //
          // This was `camp-service:{id}` while rentals and lodging used
          // `service:{id}`, so one directory row had two identities and the two
          // branches could each draw it without noticing the other. Canonical
          // now, exactly as the access family keeps `access:{id}` through a
          // change of mark — so a selection survives toggling the layer
          // underneath it, which it previously did not across these three.
          id: `service:${s.id}`,
          name: s.name,
          layer: 'campgrounds' as const,
          // ── AND THE ROWS THIS TENT IS HIDING ─────────────────────────
          //
          // No type label leads here — the tent has already said "campground" —
          // so the cues lead instead, exactly as the access family's campground
          // pin reads `Camp · River access · Mile 12.3`. A campground that also
          // rents cabins now reads `Camp · Cabins · Salem, MO` rather than
          // drawing a tent and letting the cabins vanish, which is what
          // resolving ownership across the three tiers would otherwise have
          // cost. `Camp` is passed rather than excluded for that reason: it is
          // the only thing naming the mark.
          subtitle:
            [
              ...markCues(serviceLayers),
              [s.city, s.state].filter(Boolean).join(', '),
              s.managingAgency,
            ]
              .filter(Boolean)
              .join(' · '),
          coordinates: { lng: s.longitude as number, lat: s.latitude as number },
          // ── Availability is a FIELD now, not a paragraph ─────────────────
          // It used to be joined onto the front of `body`, which meant the one
          // fact that decides whether you care was rendered by the callout's
          // prose slot: muted grey, at body weight, clipped at four lines, and
          // glued to a description written last season. That was not a styling
          // bug, it was a data-path bug — the sentence was being smuggled
          // through a field whose renderer is for descriptions.
          //
          // This is still where a Missouri State Park's inventory surfaces at
          // all: campsite_facilities hangs off a nearby_services row, so a
          // state park has no nps_campgrounds record and reaches the map
          // through here or nowhere. Now it arrives as itself and the callout
          // draws it the same way the tabbed sheet does.
          availability: s.availability ?? null,
          body: s.description ?? null,
          link: serviceLink(s),
        })),
    ];
    return campgrounds;
  }, [accessFamily, riverSlug]);

  // A gauge wears its OWN condition, graded on the phone from the ladder that
    // came down with the reading. That is the difference between a layer of
  // labels and a layer that answers "where is the water good right now" —
  // and the colours are the canonical ones, so a green dot here means what a
  // green row means in River Reports.
  const gaugePins: MapPin[] = useMemo(() => gauges.filter(hasCoordinates).map((g) => {
      const code = gaugeConditionCode(g);
      const reading = gaugeReadingText(g);
      return {
        id: `gauge:${g.id}`,
        name: g.name,
        // "Van Buren, MO", not "Current River at Van Buren, MO". These labels
        // are drawn at every zoom now (see pinLayer), and at statewide zoom a
        // full station name is a paragraph laid across the river it names.
        label: gaugePlaceLabel(g.name),
        layer: 'gauges' as const,
        // The site id is dropped rather than printed when the station has none
        // — "USGS null" under a pin is worse than a subtitle that is only a
        // name. The age moved OUT of here and into the callout footer, so a
        // rated gauge and a reference gauge date their readings the same way
        // instead of one burying it in an identification line and the other not
        // stating it at all.
        subtitle: g.usgsSiteId ? `USGS ${g.usgsSiteId}` : null,
        coordinates: g.coordinates,
        color: conditionColor(code),
        code,
        codeLabel: conditionLabel(code),
        value: reading,
        // The qualifier note is the reason the pin is grey. Saying so beats a
        // colourless dot with no explanation.
        body: g.qualifierNote,
        riverSlug: gaugeRiverSlug(g),
        siteId: g.usgsSiteId,
        updatedAt: readingAge(g.readingAgeHours),
      };
    }), [gauges]);

  const hazardPins: MapPin[] = useMemo(() => hazards
      .filter((h) => hasCoordinates(h))
      .map((h) => {
        const code = hazardConditionCode(h.severity);
        const portage = portageNote(h);
        return {
          id: `hazard:${h.id}`,
          name: h.name,
          layer: 'hazards' as const,
          subtitle: [hazardTypeLabel(h.type), h.riverMile ? `Mile ${h.riverMile}` : null]
            .filter(Boolean)
            .join(' · '),
          coordinates: h.coordinates,
          // Severity, not one flat red. A `caution` shoal and a low-water dam
          // are both hazards and they are not the same news.
          color: conditionColor(code),
          code,
          codeLabel: severityLabel(h.severity),
          // ── THE PORTAGE IS NOT A DESCRIPTION ─────────────────────────────
          // It used to lead this joined string, on the argument that it is the
          // only part of a hazard that is an instruction rather than a
          // description. That argument was right and the mechanism was wrong:
          // being first in a string handed to the prose renderer buys nothing
          // but position, and the reader met "carry left of the chute" in the
          // same muted grey as the two paragraphs under it.
          //
          // Its own field now, drawn as its own block. Same correction the
          // availability line already got, in the same file — see MapPin.
          instruction: portage,
          body: [h.description, h.seasonalNotes].filter(Boolean).join('\n\n') || null,
        };
      }), [hazards]);

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
   */
  const servicePin = useCallback(
    (marker: ResolvedServiceMarker, layer: 'outfitters' | 'lodging'): MapPin => {
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
      // finer than the tier, so `serviceCues` is asked only for what the mark
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
      link: serviceLink(s),
      };
    },
    [],
  );

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
        .map((marker) => servicePin(marker, 'outfitters')),
      ...composedServicePins('rentals', 'outfitters'),
    ],
    [accessFamily, servicePin, composedServicePins],
  );

  const lodgingPins: MapPin[] = useMemo(
    () => [
      ...accessFamily.serviceMarkers
        .filter((marker) => marker.owner === 'lodging')
        .map((marker) => servicePin(marker, 'lodging')),
      ...composedServicePins('lodging', 'lodging'),
    ],
    [accessFamily, servicePin, composedServicePins],
  );

  /** The seven, as one object. References only — nothing is rebuilt here. */
  const pins = useMemo(
    () => ({
      access: accessPins,
      boatRamps: boatRampPins,
      campgrounds: campgroundPins,
      gauges: gaugePins,
      hazards: hazardPins,
      outfitters: outfitterPins,
      lodging: lodgingPins,
    }),
    [
      accessPins,
      boatRampPins,
      campgroundPins,
      gaugePins,
      hazardPins,
      outfitterPins,
      lodgingPins,
    ],
  );

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
    () => featureCollection(accessPins, layerColorFor('access', colors)),
    [accessPins, colors],
  );
  const outfitterShape = useMemo(
    () => featureCollection(outfitterPins, layerColorFor('outfitters', colors)),
    [outfitterPins, colors],
  );
  const lodgingShape = useMemo(
    () => featureCollection(lodgingPins, layerColorFor('lodging', colors)),
    [lodgingPins, colors],
  );
  const boatRampShape = useMemo(
    () => featureCollection(boatRampPins, layerColorFor('boatRamps', colors)),
    [boatRampPins, colors],
  );
  const campgroundShape = useMemo(
    () => featureCollection(campgroundPins, layerColorFor('campgrounds', colors)),
    [campgroundPins, colors],
  );
  const gaugeShape = useMemo(
    () => featureCollection(gaugePins, layerColorFor('gauges', colors)),
    [gaugePins, colors],
  );
  const hazardShape = useMemo(
    () => featureCollection(hazardPins, layerColorFor('hazards', colors)),
    [hazardPins, colors],
  );
  const damShape = useMemo(
    () => featureCollection(dams ?? [], layerColorFor('dams', colors)),
    [dams, colors],
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
    return map;
  }, [pins, referenceGauges, dams]);

  // The plan's own endpoints, drawn larger and labelled, because "which end is
  // the put-in" is the one question a route line cannot answer by itself.
  const endpointFeatures = useMemo(() => {
    if (!planEndpoints) return null;
    return {
      type: 'FeatureCollection' as const,
      features: [
        { point: planEndpoints.putIn, role: 'Put-in' },
        { point: planEndpoints.takeOut, role: 'Take-out' },
      ].map(({ point, role }) => ({
        type: 'Feature' as const,
        id: `${role}:${point.id}`,
        properties: { role, label: `${role} · ${point.name}` },
        geometry: {
          type: 'Point' as const,
          coordinates: [point.coordinates.lng, point.coordinates.lat],
        },
      })),
    };
  }, [planEndpoints]);

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
   * The camera's padding, as a STABLE REFERENCE.
   *
   * @rnmapbox/maps rebuilds the entire camera stop when this object's IDENTITY
   * changes rather than its contents — `nativeStop` is one useMemo over
   * [centerCoordinate, bounds, zoomLevel, padding, …], handed to native as a
   * `stop` prop — so an inline literal rebuilt, and re-applied, a stop on every
   * render of this map.
   */
  const cameraPadding = useMemo(
    () => ({
      paddingTop: 40,
      paddingBottom: 40 + (cameraPaddingBottom ?? 0),
      paddingLeft: 32,
      paddingRight: 32,
    }),
    [cameraPaddingBottom],
  );

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
      };
    }
    const bounds = initial.bounds;
    return { bounds: { ne: [bounds[2], bounds[3]], sw: [bounds[0], bounds[1]] } };
  });

  const cameraRef = useRef<MapCameraRef | null>(null);
  const appliedCommandId = useRef<number | null>(null);
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
      if (gestureActive) {
        if (!gestureLatched.current) {
          gestureLatched.current = true;
          onUserGesture?.();
        }
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
    if ('waitForSheet' in cameraCommand && cameraCommand.waitForSheet && !cameraPaddingBottom) {
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
      cameraRef.current.setCamera({
        centerCoordinate: [cameraCommand.lng, cameraCommand.lat],
        // Undefined is intentional for a POI: Mapbox then changes the centre
        // without changing the live native zoom, even if a river fit is still
        // moving and onMapIdle has not published its final value yet.
        zoomLevel,
        padding: cameraPadding,
        animationMode: 'easeTo',
        animationDuration: cameraCommand.duration,
      });
      return;
    }

    const bounds = cameraCommand.bounds;
    cameraRef.current.setCamera({
      bounds: { ne: [bounds[2], bounds[3]], sw: [bounds[0], bounds[1]] },
      padding: cameraPadding,
      animationMode: 'easeTo',
      animationDuration: cameraCommand.duration,
    });
  }, [cameraCommand, cameraPadding, cameraPaddingBottom, onCameraCommandConsumed]);

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

  const onPress = (event: { features?: { properties?: Record<string, unknown> }[] }) => {
    const id = event.features?.[0]?.properties?.id;
    const match = typeof id === 'string' ? byId.get(id) : undefined;
    if (match) onSelectPin?.(match);
  };

  /**
   * A tap on a clusterable layer is either a place or a bubble of places.
   *
   * A cluster feature has `point_count` and no id of ours, so it zooms in
   * instead of opening a callout. Recentring at zoom + 2 rather than asking the
   * source for getClusterExpansionZoom: that call needs a ShapeSource ref
   * threaded through this render, and two levels reliably splits a cluster at
   * clusterRadius 50 — the user cannot tell the difference, and the ref can
   * break silently.
   */
  const onClusterablePress = (event: {
    features?: { properties?: Record<string, unknown>; geometry?: { coordinates?: number[] } }[];
    coordinates?: { latitude: number; longitude: number };
  }) => {
    const feature = event.features?.[0];
    const props = feature?.properties;
    if (!props) return;

    if (props.point_count !== undefined) {
      const coords = feature?.geometry?.coordinates;
      const lng = typeof coords?.[0] === 'number' ? coords[0] : event.coordinates?.longitude;
      const lat = typeof coords?.[1] === 'number' ? coords[1] : event.coordinates?.latitude;
      if (lng !== undefined && lat !== undefined) {
        onZoomToCluster?.({ lng, lat });
      }
      return;
    }

    const id = props.id;
    const match = typeof id === 'string' ? byId.get(id) : undefined;
    if (match) onSelectPin?.(match);
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
     * 11 for the place layers, where thirty overlapping put-in names at river
     * zoom are noise. Gauges pass 0: a gauge is a NUMBER attached to a place,
     * and a coloured dot with no name is a verdict about somewhere you cannot
     * identify — which was the state of the map at every zoom below 11,
     * including the one it opens on. Collision detection still drops labels
     * that would overlap, so the statewide view thins itself rather than
     * turning into a wall of text.
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
     * Collapse this layer into count bubbles below `maxZoom`.
     *
     * Only the rated gauge tier passes it. The bubble wears the worst verdict
     * it contains rather than a neutral fill — see CLUSTER_WORST, which is what
     * makes clustering a layer of verdicts defensible at all.
     */
    clustering?: { radius: number; maxZoom: number },
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
     * Undefined when the source does not cluster, so every other caller's
     * layers are unchanged.
     */
    const solo = clustering ? (['!', ['has', 'point_count']] as unknown[]) : undefined;
    return (
      <Mapbox.ShapeSource
        id={`pins-${id}`}
        shape={pinShapes[id]}
        // A tap on a clustered source may be a place or a bubble of places;
        // onClusterablePress is the handler that can tell the difference.
        onPress={clustering ? onClusterablePress : onPress}
        cluster={clustering !== undefined}
        clusterRadius={clustering?.radius}
        clusterMaxZoomLevel={clustering?.maxZoom}
        clusterProperties={clustering ? CLUSTER_WORST : undefined}
      >
        {clustering ? (
          <Mapbox.CircleLayer
            id={`pins-${id}-cluster`}
            filter={['has', 'point_count']}
            // The layer's own floor applies to its bubbles too, or a tier that
            // is meant to be silent at continental zoom announces itself there
            // as one very large count.
            minZoomLevel={minZoom}
            style={{
              circleColor: CLUSTER_CONDITION_COLOR,
              circleOpacity: 0.92,
              circleStrokeWidth: 1.5,
              circleStrokeColor: '#FFFFFF',
              circleRadius: ['step', ['get', 'point_count'], 14, 10, 17, 30, 20],
            }}
          />
        ) : null}
        {clustering ? (
          <Mapbox.SymbolLayer
            id={`pins-${id}-cluster-count`}
            filter={['has', 'point_count']}
            minZoomLevel={minZoom}
            style={{
              textField: ['get', 'point_count_abbreviated'],
              textSize: 11,
              // Dark ink, not white: these bubbles wear condition colours, and
              // three of the six — good, flowing, high — are light enough that
              // white on them fails the contrast every other condition surface
              // in this app is held to. The canonical inks are darker still,
              // but they are per-code and a count must not need a `match` to
              // stay legible.
              textColor: LABEL_INK,
              textHaloColor: LABEL_HALO,
              textHaloWidth: 1,
              // A circle with no number in it is a dot that lies about being
              // one gauge. Never dropped by collision detection.
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        ) : null}
        {icon && compactUntilZoom !== undefined ? (
          <Mapbox.CircleLayer
            id={`pins-${id}-overview`}
            filter={solo}
            minZoomLevel={minZoom}
            maxZoomLevel={compactUntilZoom}
            style={{
              circleRadius: selectedPinId
                ? ['case', ['==', ['get', 'id'], selectedPinId], 7, 5]
                : 5,
              circleColor: ['get', 'color'],
              circleStrokeWidth: selectedPinId
                ? ['case', ['==', ['get', 'id'], selectedPinId], 3, 1.5]
                : 1.5,
              circleStrokeColor: '#FFFFFF',
            }}
          />
        ) : null}
        {icon?.themed ? (
          <Mapbox.CircleLayer
            id={`pins-${id}-badge`}
            filter={solo}
            minZoomLevel={compactUntilZoom ?? minZoom}
            style={{
              circleRadius: selectedPinId
                ? ['case', ['==', ['get', 'id'], selectedPinId], 15, 13]
                : 13,
              circleColor: ['get', 'color'],
              circleStrokeWidth: selectedPinId
                ? ['case', ['==', ['get', 'id'], selectedPinId], 3.5, 2]
                : 2,
              circleStrokeColor: '#FFFFFF',
            }}
          />
        ) : null}
        {icon ? (
          <Mapbox.SymbolLayer
            id={`pins-${id}-icon`}
            filter={solo}
            minZoomLevel={compactUntilZoom ?? minZoom}
            style={{
              iconImage: icon.image,
              iconSize: selectedPinId
                ? ['case', ['==', ['get', 'id'], selectedPinId], 1.18, 1]
                : 1,
              iconAnchor: icon.anchor,
              // NOT OPTIONAL. A SymbolLayer hides colliding icons by default,
              // which on a cluster of access points would silently drop pins —
              // a CircleLayer never did that, and a hazard you cannot see is
              // the one failure this whole layer exists to prevent.
              iconAllowOverlap: true,
            }}
          />
        ) : (
          <Mapbox.CircleLayer
            id={`pins-${id}-circle`}
            filter={solo}
            minZoomLevel={minZoom}
            style={{
              circleRadius: 6,
              circleColor: ['get', 'color'],
              circleStrokeWidth: selectedPinId
                ? ['case', ['==', ['get', 'id'], selectedPinId], 4, 2]
                : 2,
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
          id={`pins-${id}-label`}
          filter={solo}
          // The higher of the two floors. A label is allowed to arrive after
          // its pin, never before it.
          minZoomLevel={Math.max(labelMinZoom, compactUntilZoom ?? minZoom ?? 0)}
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
   * A SIBLING of pinLayer, not a flag on it. pinLayer is shared by six layers
   * and clustering it would change how curated gauges, access points and
   * hazards all render — and CURATED GAUGES MUST NEVER CLUSTER. A rated pin
   * disappearing into a grey bubble would break the one promise that layer
   * makes, which is that its colour is a verdict you can act on.
   *
   * Everything here is deliberately quieter than a curated pin: smaller radius,
   * a 1pt halo instead of 2, labels held back two more zoom levels. The tier is
   * reference, and it should look like reference.
   */
  const contextGaugeLayer = (data: MapPin[]) => {
    // No early return on an empty list, for the reason above networkShape — and
    // this layer would have hit it harder than any other. Its data empties on
    // every pan below the zoom floor, on every filter that matches nothing, and
    // between a viewport request going out and landing. A source that unmounts
    // takes its four layers out of the style with it, and the next prop change
    // then calls updateLayer against a style they are no longer in.
    //
    // The layerOn('allGauges') gate in the render is a different thing and
    // stays: that is an explicit user action, not data arriving, so nothing is
    // racing its teardown — the same line 00196's plan-route and plan-endpoints
    // sit on.
    return (
      <Mapbox.ShapeSource
        id="pins-allGauges"
        shape={featureCollection(data, layerColorFor('allGauges', colors))}
        onPress={onClusterablePress}
        cluster
        clusterRadius={50}
        // ZOOM.cluster, like every other clustered layer. It was 11 — three
        // rungs later than the access points beside it — so panning in turned
        // one layer into pins while the other was still bubbles.
        clusterMaxZoomLevel={ZOOM.cluster}
      >
        <Mapbox.CircleLayer
          id="pins-allGauges-cluster"
          filter={['has', 'point_count']}
          style={{
            // Neutral, ALWAYS. A cluster mixes gauges running high with gauges
            // running low, so it has no band and must not borrow one — the
            // average of five verdicts is not a verdict.
            circleColor: CLUSTER_FILL,
            circleOpacity: 0.9,
            circleStrokeWidth: 1.5,
            circleStrokeColor: '#FFFFFF',
            circleRadius: ['step', ['get', 'point_count'], 14, 20, 18, 100, 22],
          }}
        />
        <Mapbox.SymbolLayer
          id="pins-allGauges-count"
          filter={['has', 'point_count']}
          style={{
            textField: ['get', 'point_count_abbreviated'],
            textSize: 11,
            textColor: '#FFFFFF',
            // No halo: white on the cluster's own dark teal is already legible,
            // and a halo at this size closes up the counter's inner shapes.
            //
            // textAllowOverlap, NOT allowOverlap. The unprefixed name is not a
            // Mapbox style property and @rnmapbox throws "allowOverlap is not a
            // valid Mapbox layer style" at RENDER time — which took down the
            // whole map the moment the layer was switched on. The style prop is
            // typed loosely enough that tsc passed it.
            //
            // The value matters as well as the name: a cluster's count must
            // never be dropped by collision detection. A circle with no number
            // in it is a dot that lies about being one gauge.
            textAllowOverlap: true,
            textIgnorePlacement: true,
          }}
        />
        <Mapbox.CircleLayer
          id="pins-allGauges-dot"
          filter={['!', ['has', 'point_count']]}
          style={{
            circleColor: ['get', 'color'],
            circleStrokeWidth: selectedPinId
              ? ['case', ['==', ['get', 'id'], selectedPinId], 3, 1]
              : 1,
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
          id="pins-allGauges-label"
          filter={['!', ['has', 'point_count']]}
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
      shape={pinShapes.access}
      onPress={onClusterablePress}
      cluster
      clusterRadius={42}
      clusterMaxZoomLevel={ZOOM.cluster}
    >
      <Mapbox.CircleLayer
        id="pins-access-cluster"
        filter={['has', 'point_count']}
        style={{
          circleColor: colors.interactive,
          circleStrokeColor: '#FFFFFF',
          circleStrokeWidth: 1.5,
          circleRadius: ['step', ['get', 'point_count'], 13, 5, 16, 12, 19],
        }}
      />
      <Mapbox.SymbolLayer
        id="pins-access-cluster-count"
        filter={['has', 'point_count']}
        style={{
          textField: ['get', 'point_count_abbreviated'],
          textSize: 10,
          textColor: colors.onInteractive,
          textAllowOverlap: true,
          textIgnorePlacement: true,
        }}
      />
      <Mapbox.CircleLayer
        id="pins-access-overview"
        filter={['!', ['has', 'point_count']]}
        maxZoomLevel={ZOOM.places}
        style={{
          circleRadius: 4.5,
          circleColor: ['get', 'color'],
          circleOpacity: ['case', ['get', 'privateAccess'], 0.65, 1],
          circleStrokeColor: '#FFFFFF',
          circleStrokeWidth: selectedPinId
            ? ['case', ['==', ['get', 'id'], selectedPinId], 3, 1.5]
            : 1.5,
        }}
      />
      <Mapbox.SymbolLayer
        id="pins-access-icon"
        filter={['!', ['has', 'point_count']]}
        minZoomLevel={ZOOM.places}
        style={{
          iconImage: PIN_ICONS.pin?.image ?? 'eddy-access-map',
          iconSize: selectedPinId
            ? ['case', ['==', ['get', 'id'], selectedPinId], 1.18, 1]
            : 1,
          iconAnchor: 'bottom',
          iconAllowOverlap: true,
        }}
      />
      {/* No padlock overlay — see the note in the generic pin builder above.
          The private cue at this zoom is the callout and the confirmation
          dialog; at overview zoom it is the dimmed circle below. */}
      <Mapbox.SymbolLayer
        id="pins-access-label"
        filter={['!', ['has', 'point_count']]}
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
    <Mapbox.MapView
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
      // So the sheet's settled height comes in as ornamentBottomInset and both
      // ornaments sit on top of it, keeping the same offsets they have at rest.
      // Settled, not per-frame: these are native props, and the tallest detent
      // is capped so the lifted position always fits (ORNAMENT_BAND).
      //
      // THE OFFSETS ARE MEASURED, NOT TASTE. The wordmark is a fixed 85x21
      // bitmap, so at left:12 its right edge lands at x=97. The (i) is a 44x44
      // .infoLight button with a ~22pt glyph centred in it, so its left:N puts
      // the visible glyph at N+11 — left:94 is what makes the gap between the
      // two read as 8pt, matching the gap the callout's own rows use. Anything
      // larger reads as two unrelated controls rather than one attribution.
      //
      // bottom:9 centres the glyph against the wordmark (bottom:14 sat it
      // high) and, more usefully, puts the top of its 44pt tap frame at y=53 —
      // which is the number MAP_CHROME_BOTTOM has to clear.
      logoEnabled
      logoPosition={{ bottom: 10 + ornamentBottomInset, left: 12 }}
      attributionEnabled
      attributionPosition={{ bottom: 9 + ornamentBottomInset, left: 94 }}
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
              onViewportChange({ bounds: [sw[0], sw[1], ne[0], ne[1]], zoom });
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
      <Mapbox.ShapeSource id="network" shape={networkShape} onPress={onNetworkPress}>
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

      {routeFeature ? (
        <Mapbox.ShapeSource id="plan-route" shape={routeFeature}>
          <Mapbox.LineLayer
            id="plan-route-casing"
            style={{ lineColor: 'rgba(0,0,0,0.4)', lineWidth: 10, lineCap: 'round', lineJoin: 'round' }}
          />
          <Mapbox.LineLayer
            id="plan-route-fill"
            style={{ lineColor: colors.accent, lineWidth: 6, lineCap: 'round', lineJoin: 'round' }}
          />
        </Mapbox.ShapeSource>
      ) : null}

      {/* The national tier goes FIRST of the pin layers, so everything Eddy has
          curated paints over it. A reference dot must never sit on top of a
          rated gauge, an access point or a hazard — it is the layer with the
          least to say and the most members. */}
      {layerOn('allGauges') ? contextGaugeLayer(referenceGauges ?? []) : null}

      {layerOn('access') ? accessLayer() : null}
      {/* ── THE LADDER'S FLOOR, on the four directory tiers ──────────────────
          These four pass ZOOM.min now where they used to pass nothing. Their
          LABELS were always gated — labelMinZoom defaults to ZOOM.names — which
          is why they never produced the wall of text the dams layer did, but
          their icons drew all the way out to a continental camera, over the rung
          the ladder reserves for lines only.

          A floor, and deliberately nothing more. Whether these tiers should
          also cluster and fade to dots is a real question and a different one,
          argued on the boat-ramp comment below and answered there for now with
          "nobody sees this layer without having asked for it". That argument
          survives; it was never an argument for drawing them from orbit. */}
      {layerOn('outfitters')
        ? pinLayer('outfitters', 'outfitter', ZOOM.names, ZOOM.min)
        : null}
      {layerOn('lodging')
        ? pinLayer('lodging', 'lodging', ZOOM.names, ZOOM.min)
        : null}
      {layerOn('campgrounds')
        ? pinLayer('campgrounds', 'campground', ZOOM.names, ZOOM.min)
        : null}
      {/* Drawn exactly as the campgrounds layer is, because it is exactly the
          same handover: a put-in leaves the clustered access source and wears
          its own mark for as long as this tier is on. That means ramps do not
          cluster and do not fade to overview dots — the same trade the tents
          already make, and the same reason it is acceptable, which is that
          nobody sees this layer without having asked for it. */}
      {layerOn('boatRamps') ? pinLayer('boatRamps', 'boatRamp', ZOOM.names, ZOOM.min) : null}
      {/* Present from the opening statewide view, without making that view pay
          for forty full-size symbols and labels. Compact condition dots answer
          "where is the water?" immediately; the staff marks and place names
          arrive at GAUGE_DETAIL_ZOOM.

          ── Rated gauges cluster now, and keep their verdict ──────────────
          They used to be the one pin layer that never collapsed, on the
          argument that a verdict hidden in a grey bubble is a verdict
          withheld. That was an argument against GREY, and it is answered: a
          rated cluster is painted with the worst condition inside it (see
          CLUSTER_WORST). At statewide zoom the Ozarks now read as a handful of
          coloured counts instead of forty overlapping dots, and a river in
          flood is redder for it, not quieter.

          It collapses on the same rung as everything else — ZOOM.cluster — so
          the map changes character once as you pan in rather than six times.
          See the ladder in map/layers.ts.

          ── AND IT HAS NO FLOOR, FOR THE REASON THE DAMS DO NOT ─────────────
          This passed MIN_GAUGE_ZOOM, so zooming out past the statewide view
          emptied the layer — the reported symptom, "I still don't see USGS
          gauges zoomed way out".

          That floor is a FETCH gate and it belongs to the OTHER tier. The
          ~14,000-station reference layer is viewport-driven (useViewportGauges,
          OVERVIEW_LIMIT 1000), and a continental camera there is a request that
          cannot be answered — so contextGaugeLayer keeps its floor and this
          note is not an argument against it.

          The CURATED network is not that. useStatewideNetwork fetches it once,
          ungated, and grades it on the phone; it is the same payload whose
          river lines are already drawn and coloured at continental zoom. So the
          pins were withheld from a camera that was already displaying their
          data, and the floor was protecting a cost that had been paid on
          launch.

          Clustered, this is the most useful thing on a zoomed-out map: a
          handful of counts, each painted with the WORST condition it holds, so
          "where is there water, and is any of it dangerous" survives all the
          way out. Ungated it is also cheap — the set is bounded and already in
          memory. */}
      {layerOn('gauges')
        ? pinLayer('gauges', 'drop', GAUGE_DETAIL_ZOOM, undefined, GAUGE_DETAIL_ZOOM, {
            radius: 40,
            maxZoom: ZOOM.cluster,
          })
        : null}
      {/* ── ON THE LADDER, like every other statewide layer ──────────────────
          This passed labelMinZoom 0 and nothing else: no floor, no overview
          representation, no clustering. The justification was "ten pins
          statewide, so labels are on at every zoom — an unnamed dot cannot be
          told from the lake it sits on", and that was true of a layer that held
          ten Missouri dams.

          The catalog is twenty-four now and spans six states, from Denison on
          the Red to Wolf Creek in Kentucky. The camera that fits them is
          continental, and there the layer drew twenty-four full marks with
          twenty-four labels in one knot — over a rung the ladder says is for
          lines only. Nothing thinned it, because iconAllowOverlap is true here
          on purpose: silently dropping a pin is the worse failure.

          So it takes the rungs everything else takes: count bubbles to
          ZOOM.cluster, overview dots to ZOOM.places, then the mark and its
          name. A dam cluster paints CLUSTER_FILL rather than a verdict colour,
          because every dam feature carries severity `unknown` (rank 6) and
          CLUSTER_CONDITION_COLOR only has arms for the six real codes — so the
          bubble takes the fallback, which is exactly what that fallback is for.
          A dam publishes no condition for a bubble to summarise.

          ── AND IT KEEPS NO FLOOR, WHICH THE OTHER TIERS DO ─────────────────

          The obvious fourth change was minZoom: ZOOM.min, and it is wrong here.
          The ladder's floor is a FETCH gate as much as a paint one — "a
          continental view asks for nothing", and MIN_GAUGE_ZOOM exists to stop
          a continental gauge request. Dams ask for nothing at any zoom: the
          pins come from DAM_CATALOG in the binary (see lib/damCatalog.ts), so
          the cost the floor is protecting against does not exist for them.

          What a floor would cost is real: switch the layer on from a
          zoomed-out camera and it would draw NOTHING, which is precisely the
          "empty layer reads as broken" failure the shipped catalog was written
          to end. Two or three teal counts over six states answer "where are
          they" without crowding anything. Clustered, a continental view of
          this layer is cheap and legible; ungated and unclustered, it was the
          knot above.

          Drawn before hazards so the low-water-dam layer still paints on top:
          where both land in one place, the one that can kill you is on top. */}
      {layerOn('dams')
        ? pinLayer('dams', 'dam', ZOOM.names, undefined, ZOOM.places, {
            radius: 40,
            maxZoom: ZOOM.cluster,
          })
        : null}

      {layerOn('hazards') ? pinLayer('hazards', 'hazard') : null}

      {endpointFeatures ? (
        <Mapbox.ShapeSource id="plan-endpoints" shape={endpointFeatures}>
          <Mapbox.SymbolLayer
            id="plan-endpoints-icon"
            style={{
              iconImage: [
                'match',
                ['get', 'role'],
                'Put-in',
                'route-start',
                'route-finish',
              ],
              iconColor: [
                'match',
                ['get', 'role'],
                'Put-in',
                colors.success,
                colors.accent,
              ],
              iconHaloColor: '#FFFFFF',
              iconHaloWidth: 2.5,
              iconAllowOverlap: true,
            }}
          />
          <Mapbox.SymbolLayer
            id="plan-endpoints-label"
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
      ) : null}
    </Mapbox.MapView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
