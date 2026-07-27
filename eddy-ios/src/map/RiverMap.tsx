// eddy-ios/src/map/RiverMap.tsx
// The Mapbox view: one river's centreline in its live condition colour, plus
// whichever layers the filter row has switched on, plus the planned float when
// there is one.
//
// Mapbox is reached through loadMapbox() at RENDER time rather than by importing
// components at module scope. That is what keeps this file safe to import from a
// screen that also has to work in Expo Go — see runtime.ts.
//
// ── Why circles and text, and no icons ──────────────────────────────────────
// Every pin here is a CircleLayer in its layer's colour with a white halo, and a
// SymbolLayer of plain text above zoom 11. Sprite icons would read better, but
// the icon names in Mapbox's outdoors style are not a contract we control, and a
// missing sprite renders as nothing at all — an invisible hazard is a worse
// failure than a plain dot. Colour comes from src/map/layers.ts so a filter chip
// is literally the colour of the pins it toggles.
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

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type {
  Hazard,
  MapAccessPoint,
  MapGauge,
  RiverDetail,
  RiverGeometry,
  RiverService,
} from '@eddy/types';
import { hasCoordinates, isCampground } from '@eddy/types';
import { boundsForLine } from '@eddy/geo';
import {
  hazardConditionCode,
  hazardTypeLabel,
  portageNote,
  severityLabel,
} from '@eddy/hazards';
import { conditionColor, conditionLabel } from '@/theme/conditions';
import { neutral } from '@/theme/palette';
import { useTheme } from '@/theme/ThemeProvider';
import { readingAge } from '@/lib/readingCopy';
import { gaugeConditionCode, gaugeReadingText, gaugeRiverSlug } from '@/lib/gaugeCondition';
import { loadMapbox } from './runtime';
import { STYLE_URL } from './useOfflinePacks';
import { MAP_LAYERS, OUTFITTER_SERVICE_TYPES, type LayerKey } from './layers';

const SERVICE_TYPE_LABELS: Record<string, string> = {
  outfitter: 'Outfitter',
  canoe_rental: 'Canoe rental',
  shuttle: 'Shuttle',
  lodging: 'Lodging',
  campground: 'Campground',
};

function serviceTypeLabel(type: string): string {
  return SERVICE_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
}

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
  /** Overrides the layer colour. A gauge wears its own condition, not teal. */
  color?: string;
  /** Condition or severity code, for a tinted chip in the callout. */
  code?: string;
  codeLabel?: string;
  /** The headline number: a gauge's reading, in its own unit. */
  value?: string | null;
  /** Prose — a hazard's description and portage note. */
  body?: string | null;
  /** A river to open from the callout, when the pin belongs to one. */
  riverSlug?: string | null;
  /** Tap-to-call or tap-to-book. Never fabricated: null when there is no number. */
  link?: { label: string; url: string } | null;
}

interface Props {
  river: RiverDetail;
  /** Live condition code, used only for the line colour. */
  conditionCode: string;
  accessPoints: MapAccessPoint[];
  gauges: MapGauge[];
  hazards: Hazard[];
  services: RiverService[];
  /** Which layers are switched on. Anything absent is not fetched into GeoJSON. */
  layers: LayerKey[];
  /** Centres and zooms here instead of fitting the river. Cleared by the caller. */
  focus?: { lng: number; lat: number } | null;
  /**
   * Draw the blue dot. Only ever true once the user has granted location, which
   * the screen asks for on an explicit tap — see useLocation.
   */
  showUserLocation?: boolean;
  /** The planned float, drawn over the river line. */
  planRoute?: RiverGeometry | null;
  planEndpoints?: { putIn: MapAccessPoint; takeOut: MapAccessPoint } | null;
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
      properties: { id: pin.id, name: pin.name, color: pin.color ?? defaultColor },
      geometry: {
        type: 'Point' as const,
        coordinates: [pin.coordinates.lng, pin.coordinates.lat],
      },
    })),
  };
}

export function RiverMap({
  river,
  conditionCode,
  accessPoints,
  gauges,
  hazards,
  services,
  layers,
  focus,
  showUserLocation,
  planRoute,
  planEndpoints,
  onSelectPin,
}: Props) {
  const Mapbox = loadMapbox();
  const { colors } = useTheme();

  const lineFeature = useMemo(
    () => ({ type: 'Feature' as const, properties: {}, geometry: river.geometry }),
    [river.geometry],
  );

  const routeFeature = useMemo(
    () =>
      planRoute && planRoute.coordinates?.length
        ? { type: 'Feature' as const, properties: {}, geometry: planRoute }
        : null,
    [planRoute],
  );

  // ── Pins, one array per layer ─────────────────────────────────
  const pins = useMemo(() => {
    const access: MapPin[] = accessPoints.map((p) => ({
      id: `access:${p.id}`,
      name: p.name,
      layer: 'access' as const,
      subtitle: `Mile ${p.riverMile.toFixed(1)}${p.isPublic ? '' : ' · Private'}`,
      coordinates: p.coordinates,
    }));

    // Campgrounds come from two places and must not be deduped away: an access
    // point tagged `campground` is a put-in you can sleep at, and a linked
    // service is somewhere to sleep that is not a put-in. Both matter.
    const campgrounds: MapPin[] = [
      ...accessPoints.filter(isCampground).map((p) => ({
        id: `camp-access:${p.id}`,
        name: p.name,
        layer: 'campgrounds' as const,
        subtitle: `Camp · Mile ${p.riverMile.toFixed(1)}`,
        coordinates: p.coordinates,
      })),
      ...services
        .filter((s) => s.type === 'campground' && s.latitude != null && s.longitude != null)
        .map((s) => ({
          id: `camp-service:${s.id}`,
          name: s.name,
          layer: 'campgrounds' as const,
          subtitle: [s.city, s.state].filter(Boolean).join(', ') || 'Campground',
          coordinates: { lng: s.longitude as number, lat: s.latitude as number },
          body: s.description,
          link: serviceLink(s),
        })),
    ];

    // A gauge wears its OWN condition, graded on the phone from the ladder that
    // came down with the reading. That is the difference between a layer of
    // labels and a layer that answers "where is the water good right now" —
    // and the colours are the canonical ones, so a green dot here means what a
    // green row means in River Reports.
    const gaugePins: MapPin[] = gauges.filter(hasCoordinates).map((g) => {
      const code = gaugeConditionCode(g);
      const reading = gaugeReadingText(g);
      return {
        id: `gauge:${g.id}`,
        name: g.name,
        layer: 'gauges' as const,
        subtitle: [readingAge(g.readingAgeHours), `USGS ${g.usgsSiteId}`]
          .filter(Boolean)
          .join(' · '),
        coordinates: g.coordinates,
        color: conditionColor(code),
        code,
        codeLabel: conditionLabel(code),
        value: reading,
        // The qualifier note is the reason the pin is grey. Saying so beats a
        // colourless dot with no explanation.
        body: g.qualifierNote,
        riverSlug: gaugeRiverSlug(g),
      };
    });

    const hazardPins: MapPin[] = hazards
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
          // The portage instruction leads: it is the only part of a hazard that
          // is an instruction rather than a description.
          body: [portage, h.description, h.seasonalNotes].filter(Boolean).join('\n\n') || null,
        };
      });

    const outfitterPins: MapPin[] = services
      .filter(
        (s) =>
          OUTFITTER_SERVICE_TYPES.includes(s.type) && s.latitude != null && s.longitude != null,
      )
      .map((s) => ({
        id: `outfitter:${s.id}`,
        name: s.name,
        layer: 'outfitters' as const,
        subtitle: [serviceTypeLabel(s.type), [s.city, s.state].filter(Boolean).join(', ')]
          .filter(Boolean)
          .join(' · '),
        coordinates: { lng: s.longitude as number, lat: s.latitude as number },
        body: s.description,
        link: serviceLink(s),
      }));

    return { access, campgrounds, gauges: gaugePins, hazards: hazardPins, outfitters: outfitterPins };
  }, [accessPoints, gauges, hazards, services]);

  const byId = useMemo(() => {
    const map = new Map<string, MapPin>();
    for (const list of Object.values(pins)) for (const pin of list) map.set(pin.id, pin);
    return map;
  }, [pins]);

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

  // Fit the PLANNED stretch when there is one — a twelve-mile float inside a
  // hundred-mile river is invisible at river zoom — and the whole river
  // otherwise.
  const cameraBounds = useMemo(() => {
    const planBounds = routeFeature?.geometry.coordinates?.length
      ? boundsForLine(routeFeature.geometry.coordinates)
      : null;
    const b = planBounds ?? river.bounds;
    return { ne: [b[2], b[3]], sw: [b[0], b[1]] };
  }, [routeFeature, river.bounds]);

  // The caller is responsible for not rendering this when Mapbox is unavailable;
  // this guard is here so a mistake shows an empty map rather than a red screen.
  if (!Mapbox) return <View style={[styles.fill, { backgroundColor: colors.bg }]} />;

  const stroke = conditionColor(conditionCode);

  // Focus wins over bounds while it is set: `bounds` and `centerCoordinate` are
  // contradictory instructions to one camera, so exactly one is passed.
  const cameraProps = focus
    ? {
        // defaultSettings for the same reason it is set in the bounds case: on
        // first mount there is nothing for an update to move FROM, and a camera
        // given only an update opens on the default world view.
        defaultSettings: { centerCoordinate: [focus.lng, focus.lat], zoomLevel: 13 },
        centerCoordinate: [focus.lng, focus.lat],
        zoomLevel: 13,
        animationMode: 'flyTo' as const,
        animationDuration: 700,
      }
    : {
        defaultSettings: { bounds: cameraBounds },
        bounds: cameraBounds,
        animationMode: 'none' as const,
      };

  const layerOn = (key: LayerKey) => layers.includes(key);
  const layerColor = (key: LayerKey) =>
    MAP_LAYERS.find((l) => l.key === key)!.color(colors);

  const onPress = (event: { features?: { properties?: Record<string, unknown> }[] }) => {
    const id = event.features?.[0]?.properties?.id;
    const match = typeof id === 'string' ? byId.get(id) : undefined;
    if (match) onSelectPin?.(match);
  };

  /**
   * Circles plus labels for one layer. Every layer is drawn the same way.
   *
   * A FUNCTION THAT RETURNS JSX, not a component. Declaring a component inside
   * a render gives it a new identity on every pass, so React unmounts and
   * remounts it — which for a ShapeSource means tearing down and rebuilding the
   * native source each time the parent renders, and the pins visibly flicker.
   */
  const pinLayer = (id: LayerKey, data: MapPin[], color: string) =>
    data.length === 0 ? null : (
      <Mapbox.ShapeSource
        id={`pins-${id}`}
        shape={featureCollection(data, color)}
        onPress={onPress}
      >
        <Mapbox.CircleLayer
          id={`pins-${id}-circle`}
          style={{
            circleRadius: 6,
            // Data-driven rather than flat, so a gauge can wear its condition
            // while every other layer still gets its own single colour.
            circleColor: ['get', 'color'],
            circleStrokeWidth: 2,
            circleStrokeColor: '#FFFFFF',
          }}
        />
        <Mapbox.SymbolLayer
          id={`pins-${id}-label`}
          // Labels only once zoomed in; at river zoom thirty overlapping names
          // are noise, and Mapbox's collision detection would drop most anyway.
          minZoomLevel={11}
          style={{
            textField: ['get', 'name'],
            textSize: 11,
            textOffset: [0, 1.2],
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
    >
      {/* defaultSettings is not optional in the bounds case. `bounds` alone is
          applied as an UPDATE, and on first mount there is nothing to update
          from — the map opens on the default world view and stays there, which
          looks like a spinning globe rather than a river. */}
      <Mapbox.Camera
        {...cameraProps}
        // Padding belongs on the root prop. Passing it inside `bounds` still
        // works but is deprecated in @rnmapbox/maps 10.
        padding={{ paddingTop: 40, paddingBottom: 40, paddingLeft: 32, paddingRight: 32 }}
      />

      {/* Rendered only once permission exists. @rnmapbox/maps triggers the
          system prompt itself the moment this mounts, which would spend the
          one-shot iOS dialog on merely opening the Map tab. */}
      {showUserLocation ? <Mapbox.UserLocation visible /> : null}

      <Mapbox.ShapeSource id="river-line" shape={lineFeature}>
        {/* Casing first: a dark outline under the colour keeps a thin river
            legible over both the green forest and the pale gravel of the
            outdoors style, which the condition colour alone does not. */}
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

      {layerOn('access') ? pinLayer('access', pins.access, layerColor('access')) : null}
      {layerOn('outfitters')
        ? pinLayer('outfitters', pins.outfitters, layerColor('outfitters'))
        : null}
      {layerOn('campgrounds')
        ? pinLayer('campgrounds', pins.campgrounds, layerColor('campgrounds'))
        : null}
      {layerOn('gauges') ? pinLayer('gauges', pins.gauges, layerColor('gauges')) : null}
      {layerOn('hazards') ? pinLayer('hazards', pins.hazards, layerColor('hazards')) : null}

      {endpointFeatures ? (
        <Mapbox.ShapeSource id="plan-endpoints" shape={endpointFeatures}>
          <Mapbox.CircleLayer
            id="plan-endpoints-circle"
            style={{
              circleRadius: 9,
              circleColor: [
                'match',
                ['get', 'role'],
                'Put-in',
                colors.success,
                colors.accent,
              ],
              circleStrokeWidth: 3,
              circleStrokeColor: '#FFFFFF',
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
