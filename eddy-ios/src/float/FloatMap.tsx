// eddy-ios/src/float/FloatMap.tsx
// The map on the River Mode screen: the river, both ends, and where you are.
//
// The first GPS fix frames you and the take-out. Panning stops following;
// Recenter follows your position and Show route fits the complete stretch.
// A location dot is display-only: confirmed river progress owns the estimates.
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
// Position comes from the existing recorder, including usable off-river fixes.
// No Mapbox UserLocation component: that would open a second GPS stream.
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
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { type LngLat } from '@eddy/geo';
import { hazardConditionCode, hazardTypeLabel } from '@eddy/hazards';
import { markerDistance, type FloatMapFeatures, type RouteHazard } from '@/lib/floatSession';
import { conditionColor } from '@/theme/conditions';
import { loadMapbox, STYLE_URL } from '@/map/runtime';
import { floatMapChoices, floatTapRect, type FloatMapChoice } from '@/lib/floatMapSelection';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { selectionFeedback } from '@/lib/haptics';
import { consumeFloatMapFocus, type FloatMapFocus } from './mapFocus';
import { floatOverviewBounds, floatRouteBounds } from '@/lib/floatDisplay';
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
  focus?: FloatMapFocus | null;
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
  focus,
}: FloatMapProps & { Mapbox: NonNullable<ReturnType<typeof loadMapbox>> }) {
  const { colors } = useTheme();
  const camera = useRef<CameraRef | null>(null);
  const map = useRef<{ queryRenderedFeaturesInRect(rect: number[], filter: unknown[], layers: string[]): Promise<{ features: Parameters<typeof floatMapChoices>[0] } | undefined> } | null>(null);
  const tapGeneration = useRef(0);
  const reducedMotion = useReducedMotion(true);
  const [choices, setChoices] = useState<FloatMapChoice[]>([]);
  useEffect(() => () => { tapGeneration.current += 1; }, []);
  const [following, setFollowing] = useState<'overview' | 'position' | false>(preview ? false : 'overview');
  const [mapReady, setMapReady] = useState(false);
  const [neutral, setNeutral] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [focusedTarget, setFocusedTarget] = useState<FloatMapFocus | null>(null);

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
  const bounds = useMemo(() => floatRouteBounds(section ?? line, start?.lngLat ?? null, takeOut?.lngLat ?? null), [section, line, start, takeOut]);
  const [defaultSettings] = useState(() => {
    const frame = !preview && position ? floatOverviewBounds(position, takeOut?.lngLat ?? null) : bounds;
    return frame ? { bounds: { sw: [frame[0], frame[1]], ne: [frame[2], frame[3]],
      paddingTop: FRAME_PADDING, paddingBottom: FRAME_PADDING, paddingLeft: FRAME_PADDING, paddingRight: FRAME_PADDING } }
      : { centerCoordinate: takeOut?.lngLat ?? line[0], zoomLevel: 12 };
  });
  const lng = position?.[0];
  const lat = position?.[1];
  const endLng = takeOut?.lngLat[0];
  const endLat = takeOut?.lngLat[1];
  useEffect(() => {
    if (preview || !following || !mapReady || lng == null || lat == null) return;
    if (following === 'overview') {
      // Follow actual coordinate changes only. A manual gesture stops following.
      const frame = floatOverviewBounds([lng, lat], endLng != null && endLat != null ? [endLng, endLat] : null);
      if (frame) camera.current?.fitBounds([frame[2], frame[3]], [frame[0], frame[1]], FRAME_PADDING, reducedMotion ? 0 : 600);
    } else {
      camera.current?.setCamera({ centerCoordinate: [lng, lat], zoomLevel: FOLLOW_ZOOM, animationDuration: reducedMotion ? 0 : 600 });
    }
  }, [preview, following, mapReady, lng, lat, endLng, endLat, reducedMotion]);

  const clearSelection = () => {
    tapGeneration.current++;
    setChoices([]);
    setSelected(null);
    setFocusedTarget(null);
  };
  const showRoute = () => {
    clearSelection();
    if (!bounds) return;
    setFollowing(false);
    camera.current?.fitBounds([bounds[2], bounds[3]], [bounds[0], bounds[1]], FRAME_PADDING, reducedMotion ? 0 : 700);
  };
  const recenter = () => {
    clearSelection();
    setFollowing('position');
    // Repeated taps work even if following was already selected.
    if (position) camera.current?.setCamera({ centerCoordinate: position, zoomLevel: FOLLOW_ZOOM, animationDuration: reducedMotion ? 0 : 600 });
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
          properties: { id: `access:${stop.id}`, kind: 'stop', color: colors.card, label: stop.name, title: stop.name, sub: 'Mapped access', mile: stop.riverMile },
          geometry: { type: 'Point' as const, coordinates: stop.lngLat },
        })),
        ...hazards.map((hazard) => ({
          type: 'Feature' as const,
          properties: {
            id: `hazard:${hazard.id}`, kind: 'hazard',
            color: conditionColor(hazardConditionCode(hazard.severity)),
            label: hazard.name,
            title: hazard.name,
            sub: hazardTypeLabel(hazard.type) + (hazard.portageRequired ? ` · Portage${hazard.portageSide && hazard.portageSide !== 'either' ? ` river ${hazard.portageSide}` : ''}` : ''),
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
                properties: { id: 'end:start', end: 'start', label: `Put-in · ${start.name}`, title: start.name, sub: 'Put-in', mile: start.riverMile ?? -1 },
                geometry: { type: 'Point' as const, coordinates: start.lngLat },
              },
            ]
          : []),
        ...(takeOut ? [{
          type: 'Feature' as const,
          properties: { id: 'end:take-out', end: 'take-out', label: `Take-out · ${takeOut.name}`, title: takeOut.name, sub: 'Take-out', mile: takeOut.riverMile },
          geometry: { type: 'Point' as const, coordinates: takeOut.lngLat },
        }] : []),
      ],
    }),
    [start, takeOut],
  );

  useEffect(() => {
    if (!focus || !mapReady || preview || !camera.current) return;
    const applied = consumeFloatMapFocus(focus.id);
    if (!applied) return;
    tapGeneration.current++;
    // Synchronize the sheet's explicit map-focus command with local interaction state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFollowing(false);
    setChoices([]);
    setFocusedTarget(applied);
    setSelected({ title: applied.title, detail: applied.detail });
    camera.current.setCamera({ centerCoordinate: applied.point, zoomLevel: FOLLOW_ZOOM, animationDuration: reducedMotion ? 0 : 600 });
  }, [focus, mapReady, preview, reducedMotion]);

  const choose = (choice: FloatMapChoice) => {
    tapGeneration.current++;
    selectionFeedback();
    setChoices([]);
    setFocusedTarget(null);
    const where = choice.mile == null ? '' : ` · ${markerDistance(choice.mile, currentMile)}`;
    setSelected({ title: choice.title, detail: `${choice.detail}${where}` });
  };
  const onMapPress = async (event: { properties?: { screenPointX?: number; screenPointY?: number } }) => {
    if (preview) return;
    const x = event.properties?.screenPointX;
    const y = event.properties?.screenPointY;
    if (x == null || y == null || !map.current) return;
    const generation = ++tapGeneration.current;
    try {
      const hit = await map.current.queryRenderedFeaturesInRect(floatTapRect(x, y), [], [
        'float-markers-dot', 'float-markers-label', 'float-ends-dot', 'float-ends-label',
      ]);
      if (generation !== tapGeneration.current || !hit) return;
      const matches = floatMapChoices(hit.features);
      if (matches.length === 1) choose(matches[0]);
      else { setSelected(null); setFocusedTarget(null); setChoices(matches); }
    } catch { /* Keep the current selection when the style cannot be queried. */ }
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
        ref={map}
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
        onDidFinishLoadingStyle={() => setMapReady(true)}
        onPress={onMapPress}
        onCameraChanged={(state: { gestures?: { isGestureActive?: boolean } }) => {
          if (state?.gestures?.isGestureActive) { tapGeneration.current++; setFollowing(false); }
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
        <Mapbox.ShapeSource id="float-markers" shape={markersShape}>
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
        <Mapbox.ShapeSource id="float-ends" shape={endsShape}>
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
        {focusedTarget && !preview ? <Mapbox.ShapeSource id="float-focus" shape={{ type: 'Feature', properties: { label: focusedTarget.title }, geometry: { type: 'Point', coordinates: focusedTarget.point } }}>
          <Mapbox.CircleLayer id="float-focus-dot" style={{ circleRadius: 14, circleColor: colors.accent, circleStrokeColor: colors.text, circleStrokeWidth: 3 }} />
          <Mapbox.SymbolLayer id="float-focus-label" style={labelStyle} />
        </Mapbox.ShapeSource> : null}
      </Mapbox.MapView>
      {neutral && !preview ? (
        <View style={[styles.chip, { backgroundColor: colors.card }]} pointerEvents="none">
          <Text style={[styles.chipText, { color: colors.textMuted }]}>Background map unavailable</Text>
        </View>
      ) : null}
      <Modal visible={choices.length > 1} transparent animationType={reducedMotion ? 'none' : 'fade'}
        onRequestClose={clearSelection}>
        <View style={[styles.selectionOverlay, { backgroundColor: colors.scrim }]}>
          <SafeAreaView edges={['bottom']} style={[styles.selectionSheet, { backgroundColor: colors.card }]} accessibilityViewIsModal>
            <View style={styles.choiceCard}>
              <View style={styles.choiceHeader}>
                <Text style={[styles.markerTitle, { flex: 1, color: colors.text }]} accessibilityRole="header">Choose a place</Text>
                <Pressable style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close selection" onPress={clearSelection}>
                  <ControlIcon name="close" size={22} color={colors.interactive} />
                </Pressable>
              </View>
              <ScrollView>{choices.map(choice => <Pressable key={choice.id} accessibilityRole="button" onPress={() => choose(choice)}
                style={[styles.choice, { borderTopColor: colors.border }]}>
                <Text style={[styles.markerTitle, { color: colors.text }]}>{choice.title}</Text>
                <Text style={[styles.markerDetail, { color: colors.textMuted }]}>{choice.detail}</Text>
              </Pressable>)}</ScrollView>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
      {selected ? <View style={styles.markerOverlay} pointerEvents="box-none">
        <MarkerCard selected={selected} onClose={clearSelection} />
      </View> : null}
      {preview ? null : (
        <View style={styles.controls}>
          {bounds ? <MapButton icon="map-outline" label="Show route" onPress={showRoute} accessibilityLabel="Show the whole route" /> : null}
          {position && following !== 'position' ? (
            <MapButton icon="locate" label="Recenter" onPress={recenter} accessibilityLabel="Recenter on your position" />
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
      <ScrollView style={styles.markerText}>
        <Text style={[styles.markerTitle, { color: colors.text }]}>
          {selected.title}
        </Text>
        <Text style={[styles.markerDetail, { color: colors.textMuted }]}>{selected.detail}</Text>
      </ScrollView>
      <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close">
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
function RiverOnlyMap({ line, section, stops, hazards, start, takeOut, position, positionDimmed, preview = false, focus }: FloatMapProps) {
  const { colors } = useTheme();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [focusedTarget, setFocusedTarget] = useState<FloatMapFocus | null>(null);
  const ready = size !== null;
  useEffect(() => {
    if (!focus || !ready || preview) return;
    const applied = consumeFloatMapFocus(focus.id);
    // Synchronize the explicit focus command, including builds without Mapbox.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (applied) setFocusedTarget(applied);
  }, [focus, ready, preview]);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  // Fitted to the stretch; the rest of the river runs off the edges, faint.
  const drawing = useMemo(() => (size ? fit([...(section ?? line), ...(start ? [start.lngLat] : []), ...(takeOut ? [takeOut.lngLat] : []), ...(!preview && position ? [position] : []), ...(!preview && focusedTarget ? [focusedTarget.point] : [])], size.width, size.height, 24) : null), [section, line, size, start, takeOut, preview, position, focusedTarget]);
  const sectionPath = useMemo(() => (drawing && section ? drawing.pathOf(section) : null), [drawing, section]);

  return (
    <View style={[styles.fill, styles.clip, { backgroundColor: colors.selectionBg }]} onLayout={onLayout}>
      {drawing && size ? (
        <Svg width={size.width} height={size.height}>
          <Path
            d={drawing.pathOf(line)}
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
          {focusedTarget && !preview ? <Circle {...drawing.point(focusedTarget.point)} r={13} fill={colors.accent} stroke={colors.text} strokeWidth={3} /> : null}
          {position && !preview ? (
            <Circle {...drawing.point(position)} r={9} fill="#1E6FD9" opacity={positionDimmed ? 0.4 : 1} stroke="#ffffff" strokeWidth={3} />
          ) : null}
        </Svg>
      ) : null}
      {focusedTarget && !preview ? <View style={styles.markerOverlay} pointerEvents="box-none">
        <MarkerCard selected={focusedTarget} onClose={() => setFocusedTarget(null)} />
      </View> : null}
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
  closeButton: { minWidth: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  selectionOverlay: { flex: 1, justifyContent: 'flex-end' },
  selectionSheet: { maxHeight: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  choiceCard: { flexShrink: 1, paddingHorizontal: 4 },
  choiceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  choice: { minHeight: 56, paddingVertical: 12, gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
  fill: { flex: 1 },
  clip: { overflow: 'hidden' },
  controls: { position: 'absolute', right: 12, bottom: 12, left: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  mapButton: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 56,
    paddingHorizontal: 14,
    borderRadius: 22,
  },
  mapButtonText: { flexShrink: 1, ...t.sm, fontFamily: fonts.semibold },
  markerOverlay: { position: 'absolute', top: 12, left: 12, right: 12, maxHeight: '55%' },
  markerCard: {
    flexShrink: 1,
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
