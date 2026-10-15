// eddy-ios/src/float/FloatMap.tsx
// The map on the Float Mode screen: the river, both ends, and where you are.
//
// ── Following without fighting ──────────────────────────────────────────────
// The camera follows your confirmed position until you pan. Then it stays put
// until you tap Recenter. Nothing else, a reconnection included, moves it.
// Show route frames the whole stretch at any time and stops following;
// Recenter then zooms back in to tracking level.
//
// ── Markers say what they are ───────────────────────────────────────────────
// The put-in and take-out are labelled and drawn differently (the take-out as
// a ring: the one you are heading for). Access points and hazards along the
// stretch are labelled once zoomed in, and every marker is tappable for its
// name and how far ahead it is. Labels need the map's glyphs; on the neutral
// style they are simply absent, and tapping still works.
//
// ── Preview ─────────────────────────────────────────────────────────────────
// The start summary shows the same map, framed on the stretch, with no
// position, no following and no gestures, so it scrolls with its screen.
//
// ── Your position is the session's, not the map's ──────────────────────────
// No Mapbox UserLocation puck: it would open a second GPS stream (FloatTracker
// owns the only one) and would show raw fixes the tracker has not confirmed.
// The dot is the last committed position, the same one the numbers use.
//
// ── The chosen stretch, not the whole river ─────────────────────────────────
// The river line is the whole river (it calibrates the miles), but the float
// is one stretch of it. That stretch is drawn strong and framed at start; the
// rest of the river stays faint for context. Access points along the way and
// known hazards on the stretch are drawn on it, hazards in their severity's
// condition colour like everywhere else in the app.
//
// ── When the background map cannot load ─────────────────────────────────────
// No downloaded map, no signal, nothing cached: the SAME map switches to a
// built-in neutral style that needs no network, and the river, both ends, the
// dot, the camera, following, pan, zoom and Recenter all carry on. While on the
// neutral style it checks for a connection at most once a minute and tries the
// real style again; a failed retry falls back to neutral. Nothing remounts and
// nothing flaps with a flickering signal (ADR 0011).
//
// The SVG drawing below remains only for builds with no Mapbox at all (no
// token, Expo Go), where there is no map to keep.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { boundsForLine, type LngLat } from '@eddy/geo';
import { hazardConditionCode, hazardTypeLabel } from '@eddy/hazards';
import { markerDistance, type FloatMapFeatures, type RouteHazard } from '@/lib/floatSession';
import { conditionColor } from '@/theme/conditions';
import { loadMapbox, STYLE_URL } from '@/map/runtime';
import { networkHintsOffline } from '@/lib/networkHint';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export interface FloatMapEnd {
  name: string;
  lngLat: LngLat;
}

export interface FloatMapProps {
  /** The whole river line, drawn faint for context. */
  line: LngLat[];
  /** The stretch being floated; framed and drawn strong. Null draws the whole line strong. */
  section: LngLat[] | null;
  /** Access points along the stretch, between its ends. */
  stops: FloatMapFeatures['stops'];
  /** Known hazards on the stretch. */
  hazards: RouteHazard[];
  start: (FloatMapEnd & { riverMile: number | null }) | null;
  takeOut: (FloatMapEnd & { riverMile: number }) | null;
  position: LngLat | null;
  /** The position is not live: draw it, but faded. */
  positionDimmed: boolean;
  /** The last confirmed mile, so a tapped marker can say how far ahead it is. */
  currentMile?: number | null;
  /** A still, framed preview: no following, no controls, no gestures. */
  preview?: boolean;
}

interface CameraRef {
  setCamera: (stop: { centerCoordinate?: [number, number]; zoomLevel?: number; animationDuration?: number }) => void;
  fitBounds: (ne: [number, number], sw: [number, number], padding?: number | number[], animationDuration?: number) => void;
}

interface Selected {
  title: string;
  detail: string;
}

const FOLLOW_ZOOM = 14;
/** Access-point and hazard labels appear from here; ends are always labelled. */
const LABEL_ZOOM = 12;
const FRAME_PADDING = 48;

/** How often, at most, to try the real style again while on the neutral one. */
const STYLE_RETRY_MS = 60_000;

export function FloatMap(props: FloatMapProps) {
  const Mapbox = loadMapbox();
  return Mapbox ? <MapboxFloatMap {...props} Mapbox={Mapbox} /> : <RiverOnlyMap {...props} />;
}

function MapboxFloatMap({
  Mapbox,
  line,
  section,
  stops,
  hazards,
  start,
  takeOut,
  position,
  positionDimmed,
  currentMile = null,
  preview = false,
}: FloatMapProps & { Mapbox: NonNullable<ReturnType<typeof loadMapbox>> }) {
  const { colors } = useTheme();
  const camera = useRef<CameraRef | null>(null);
  const [following, setFollowing] = useState(!preview);
  const [neutral, setNeutral] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);

  // A background with no sources at all: renders with no network, no tiles
  // and no glyphs, so the route layers above it always draw.
  const neutralStyle = useMemo(
    () => JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': colors.selectionBg } }] }),
    [colors.selectionBg],
  );

  // On the neutral style, retry the real one when a connection looks likely.
  useEffect(() => {
    if (!neutral) return;
    const timer = setInterval(() => {
      void networkHintsOffline().then((offline) => {
        if (!offline) setNeutral(false);
      });
    }, STYLE_RETRY_MS);
    return () => clearInterval(timer);
  }, [neutral]);

  // Framed on the stretch, so the float starts looking at the float.
  const bounds = useMemo(() => boundsForLine(section ?? line), [section, line]);
  const [defaultSettings] = useState(() =>
    position && !preview
      ? { centerCoordinate: position, zoomLevel: FOLLOW_ZOOM }
      : bounds
        ? {
            bounds: {
              sw: [bounds[0], bounds[1]],
              ne: [bounds[2], bounds[3]],
              paddingTop: FRAME_PADDING,
              paddingBottom: FRAME_PADDING,
              paddingLeft: FRAME_PADDING,
              paddingRight: FRAME_PADDING,
            },
          }
        : { centerCoordinate: takeOut?.lngLat ?? line[0], zoomLevel: 12 },
  );

  // Follow the confirmed position while following is on. The first position
  // also zooms in to tracking level (a float starts fitted to its stretch,
  // before GPS); after that only the centre moves, so a zoom the paddler chose
  // is kept, Recenter included, unless Show route zoomed out since.
  const lng = position?.[0];
  const lat = position?.[1];
  const zoomedToTrack = useRef(position != null);
  useEffect(() => {
    if (preview || !following || lng == null || lat == null) return;
    if (!zoomedToTrack.current) {
      zoomedToTrack.current = true;
      camera.current?.setCamera({ centerCoordinate: [lng, lat], zoomLevel: FOLLOW_ZOOM, animationDuration: 800 });
      return;
    }
    camera.current?.setCamera({ centerCoordinate: [lng, lat], animationDuration: 600 });
  }, [preview, following, lng, lat]);

  const showRoute = () => {
    if (!bounds) return;
    setFollowing(false);
    zoomedToTrack.current = false;
    camera.current?.fitBounds([bounds[2], bounds[3]], [bounds[0], bounds[1]], FRAME_PADDING, 700);
  };

  const routeShape = useMemo(
    () => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: line } }),
    [line],
  );
  const sectionShape = useMemo(
    () => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: section ?? line } }),
    [section, line],
  );
  const markersShape = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: [
        ...stops.map((stop) => ({
          type: 'Feature' as const,
          properties: { kind: 'stop', color: colors.card, label: stop.name, title: stop.name, sub: 'Access point', mile: stop.riverMile },
          geometry: { type: 'Point' as const, coordinates: stop.lngLat },
        })),
        ...hazards.map((hazard) => ({
          type: 'Feature' as const,
          properties: {
            kind: 'hazard',
            color: conditionColor(hazardConditionCode(hazard.severity)),
            label: hazard.name,
            title: hazard.name,
            sub: hazardTypeLabel(hazard.type) + (hazard.portageRequired ? ' · portage' : ''),
            mile: hazard.riverMile,
          },
          geometry: { type: 'Point' as const, coordinates: hazard.lngLat },
        })),
      ],
    }),
    [stops, hazards, colors.card],
  );
  const endsShape = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: [
        ...(start
          ? [
              {
                type: 'Feature' as const,
                properties: { end: 'start', label: `Put-in · ${start.name}`, title: start.name, sub: 'Put-in', mile: start.riverMile ?? -1 },
                geometry: { type: 'Point' as const, coordinates: start.lngLat },
              },
            ]
          : []),
        ...(takeOut ? [{
          type: 'Feature' as const,
          properties: { end: 'take-out', label: `Take-out · ${takeOut.name}`, title: takeOut.name, sub: 'Take-out', mile: takeOut.riverMile },
          geometry: { type: 'Point' as const, coordinates: takeOut.lngLat },
        }] : []),
      ],
    }),
    [start, takeOut],
  );

  const onMarkerPress = (event: { features?: { properties?: Record<string, unknown> | null }[] }) => {
    const props = event.features?.[0]?.properties;
    if (!props || typeof props.title !== 'string') return;
    const mile = typeof props.mile === 'number' && props.mile >= 0 ? props.mile : null;
    const where = mile == null ? '' : ` · ${markerDistance(mile, currentMile)}`;
    setSelected({ title: props.title, detail: `${String(props.sub ?? '')}${where}` });
  };

  const labelStyle = {
    textField: ['get', 'label'],
    textSize: 12,
    textColor: colors.text,
    textHaloColor: colors.card,
    textHaloWidth: 1.5,
    textAnchor: 'top',
    textOffset: [0, 1.1],
    textOptional: true,
    textMaxWidth: 10,
  } as const;

  return (
    <View style={styles.fill}>
      <Mapbox.MapView
        style={styles.fill}
        {...(neutral ? { styleJSON: neutralStyle } : { styleURL: STYLE_URL })}
        scaleBarEnabled={false}
        // Required by Mapbox's terms on every map; position only.
        logoEnabled
        attributionEnabled
        scrollEnabled={!preview}
        zoomEnabled={!preview}
        rotateEnabled={false}
        pitchEnabled={false}
        onDidFailLoadingMap={() => setNeutral(true)}
        onPress={() => setSelected(null)}
        onCameraChanged={(state: { gestures?: { isGestureActive?: boolean } }) => {
          if (state?.gestures?.isGestureActive) setFollowing(false);
        }}
      >
        <Mapbox.Camera ref={camera} defaultSettings={defaultSettings} />
        <Mapbox.ShapeSource id="float-route" shape={routeShape}>
          <Mapbox.LineLayer
            id="float-route-line"
            style={{ lineColor: colors.interactive, lineOpacity: section ? 0.3 : 1, lineWidth: section ? 3 : 5, lineCap: 'round', lineJoin: 'round' }}
          />
        </Mapbox.ShapeSource>
        {section ? (
          <Mapbox.ShapeSource id="float-section" shape={sectionShape}>
            <Mapbox.LineLayer
              id="float-section-line"
              style={{ lineColor: colors.interactive, lineWidth: 5, lineCap: 'round', lineJoin: 'round' }}
            />
          </Mapbox.ShapeSource>
        ) : null}
        <Mapbox.ShapeSource id="float-markers" shape={markersShape} onPress={preview ? undefined : onMarkerPress} hitbox={{ width: 32, height: 32 }}>
          <Mapbox.CircleLayer
            id="float-markers-dot"
            style={{
              circleRadius: ['match', ['get', 'kind'], 'hazard', 7, 5],
              circleColor: ['get', 'color'],
              circleStrokeColor: ['match', ['get', 'kind'], 'hazard', '#ffffff', colors.interactive],
              circleStrokeWidth: 2,
            }}
          />
          {preview ? null : <Mapbox.SymbolLayer id="float-markers-label" minZoomLevel={LABEL_ZOOM} style={labelStyle} />}
        </Mapbox.ShapeSource>
        <Mapbox.ShapeSource id="float-ends" shape={endsShape} onPress={preview ? undefined : onMarkerPress} hitbox={{ width: 36, height: 36 }}>
          <Mapbox.CircleLayer
            id="float-ends-dot"
            style={{
              circleRadius: ['match', ['get', 'end'], 'take-out', 10, 7],
              circleColor: ['match', ['get', 'end'], 'take-out', colors.accent, colors.interactive],
              circleStrokeColor: '#ffffff',
              circleStrokeWidth: ['match', ['get', 'end'], 'take-out', 3, 2],
            }}
          />
          {/* The take-out is a ring: the end you are heading for. */}
          <Mapbox.CircleLayer
            id="float-ends-core"
            filter={['==', ['get', 'end'], 'take-out']}
            style={{ circleRadius: 3.5, circleColor: '#ffffff' }}
          />
          <Mapbox.SymbolLayer id="float-ends-label" style={{ ...labelStyle, textSize: 13 }} />
        </Mapbox.ShapeSource>
        {position && !preview ? (
          <Mapbox.ShapeSource
            id="float-position"
            shape={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: position } }}
          >
            <Mapbox.CircleLayer
              id="float-position-dot"
              style={{
                circleRadius: 9,
                circleColor: '#1E6FD9',
                circleOpacity: positionDimmed ? 0.4 : 1,
                circleStrokeColor: '#ffffff',
                circleStrokeWidth: 3,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}
      </Mapbox.MapView>
      {neutral && !preview ? (
        <View style={[styles.chip, { backgroundColor: colors.card }]} pointerEvents="none">
          <Text style={[styles.chipText, { color: colors.textMuted }]}>Background map unavailable</Text>
        </View>
      ) : null}
      {selected ? <MarkerCard selected={selected} onClose={() => setSelected(null)} /> : null}
      {preview ? null : (
        <View style={styles.controls}>
          {bounds ? <MapButton icon="map-outline" label="Show route" onPress={showRoute} accessibilityLabel="Show the whole route" /> : null}
          {!following && position ? (
            <MapButton icon="locate" label="Recenter" onPress={() => setFollowing(true)} accessibilityLabel="Recenter on your position" />
          ) : null}
        </View>
      )}
    </View>
  );
}

function MarkerCard({ selected, onClose }: { selected: Selected; onClose: () => void }) {
  const { colors, elevation } = useTheme();
  return (
    <View style={[styles.markerCard, { backgroundColor: colors.card }, elevation(2)]} accessibilityLiveRegion="polite">
      <View style={styles.markerText}>
        <Text style={[styles.markerTitle, { color: colors.text }]} numberOfLines={2}>
          {selected.title}
        </Text>
        <Text style={[styles.markerDetail, { color: colors.textMuted }]}>{selected.detail}</Text>
      </View>
      <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
        <ControlIcon name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function MapButton({
  icon,
  label,
  onPress,
  accessibilityLabel,
}: {
  icon: 'locate' | 'map-outline';
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors, elevation } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.mapButton, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }, elevation(2)]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <ControlIcon name={icon} size={18} color={colors.interactive} />
      <Text style={[styles.mapButtonText, { color: colors.interactive }]}>{label}</Text>
    </Pressable>
  );
}

/** The river drawn plainly, for builds with no Mapbox at all (no token, Expo Go). */
function RiverOnlyMap({ line, section, stops, hazards, start, takeOut, position, positionDimmed, preview = false }: FloatMapProps) {
  const { colors } = useTheme();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  // Fitted to the stretch; the rest of the river runs off the edges, faint.
  const drawing = useMemo(() => (size ? fit(section ?? line, size.width, size.height, 24) : null), [section, line, size]);
  const sectionPath = useMemo(() => (drawing && section ? drawing.pathOf(section) : null), [drawing, section]);

  return (
    <View style={[styles.fill, styles.clip, { backgroundColor: colors.selectionBg }]} onLayout={onLayout}>
      {drawing && size ? (
        <Svg width={size.width} height={size.height}>
          <Path
            d={sectionPath ? drawing.pathOf(line) : drawing.path}
            stroke={colors.interactive}
            strokeOpacity={sectionPath ? 0.3 : 1}
            strokeWidth={sectionPath ? 3 : 5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {sectionPath ? (
            <Path d={sectionPath} stroke={colors.interactive} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ) : null}
          {stops.map((stop, i) => (
            <Circle key={`stop-${i}`} {...drawing.point(stop.lngLat)} r={4} fill={colors.card} stroke={colors.interactive} strokeWidth={2} />
          ))}
          {hazards.map((hazard, i) => (
            <Circle
              key={`hazard-${i}`}
              {...drawing.point(hazard.lngLat)}
              r={6}
              fill={conditionColor(hazardConditionCode(hazard.severity))}
              stroke="#ffffff"
              strokeWidth={2}
            />
          ))}
          {start ? <Circle {...drawing.point(start.lngLat)} r={7} fill={colors.interactive} stroke="#ffffff" strokeWidth={2} /> : null}
          {takeOut ? <>
            <Circle {...drawing.point(takeOut.lngLat)} r={10} fill={colors.accent} stroke="#ffffff" strokeWidth={3} />
            <Circle {...drawing.point(takeOut.lngLat)} r={3.5} fill="#ffffff" />
          </> : null}
          {position && !preview ? (
            <Circle {...drawing.point(position)} r={9} fill="#1E6FD9" opacity={positionDimmed ? 0.4 : 1} stroke="#ffffff" strokeWidth={3} />
          ) : null}
        </Svg>
      ) : null}
      {preview ? null : (
        <Text style={[styles.fallbackNote, { color: colors.textMuted }]}>River only · background map unavailable</Text>
      )}
    </View>
  );
}

/**
 * Fit a line into a box: equirectangular with a cos(lat) correction and one
 * scale for both axes, north up. Same projection as routePreview in
 * @eddy/geo, extended to place any point, which the dot needs.
 */
function fit(line: LngLat[], width: number, height: number, padding: number) {
  const lats = line.map(([, lat]) => lat);
  const lngs = line.map(([lng]) => lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const minX = Math.min(...lngs) * k;
  const maxX = Math.max(...lngs) * k;
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  const scale = Math.min((width - padding * 2) / (maxX - minX || 1e-9), (height - padding * 2) / (maxY - minY || 1e-9));
  const offsetX = (width - (maxX - minX) * scale) / 2;
  const offsetY = (height - (maxY - minY) * scale) / 2;
  const point = ([lng, lat]: LngLat) => ({ cx: offsetX + (lng * k - minX) * scale, cy: offsetY + (maxY - lat) * scale });
  /** Any line in the same frame; parts outside the box are clipped by the view. */
  const pathOf = (points: LngLat[]) => {
    const step = Math.max(1, Math.floor(points.length / 400));
    return points
      .filter((_, i) => i % step === 0 || i === points.length - 1)
      .map((p, i) => {
        const { cx, cy } = point(p);
        return `${i === 0 ? 'M' : 'L'}${cx.toFixed(1)} ${cy.toFixed(1)}`;
      })
      .join(' ');
  };
  return { path: pathOf(line), pathOf, point };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  clip: { overflow: 'hidden' },
  controls: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', gap: 8 },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
  },
  mapButtonText: { ...t.sm, fontFamily: fonts.semibold },
  markerCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
  },
  markerText: { flex: 1, gap: 2 },
  markerTitle: { ...t.base, fontFamily: fonts.semibold },
  markerDetail: { ...t.sm, fontFamily: fonts.body },
  chip: { position: 'absolute', top: 10, alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  chipText: { ...t.xs, fontFamily: fonts.semibold },
  fallbackNote: { position: 'absolute', left: 12, bottom: 10, ...t.xs, fontFamily: fonts.body },
});
