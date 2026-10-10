// eddy-ios/src/float/FloatMap.tsx
// The map on the Float Mode screen: the river, both ends, and where you are.
//
// ── Following without fighting ──────────────────────────────────────────────
// The camera follows your confirmed position until you pan. Then it stays put
// until you tap Recenter. Nothing else, a reconnection included, moves it.
//
// ── Your position is the session's, not the map's ──────────────────────────
// No Mapbox UserLocation puck: it would open a second GPS stream (FloatTracker
// owns the only one) and would show raw fixes the tracker has not confirmed.
// The dot is the last committed position, the same one the numbers use.
//
// ── When Mapbox cannot draw ─────────────────────────────────────────────────
// No token, Expo Go, a failed native load, or a map that cannot load its style
// (no downloaded map, no signal, nothing cached): the river is drawn plainly
// in SVG instead, with the same ends and the same dot. It needs no style,
// tiles or network. See ADR 0011.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { boundsForLine, type LngLat } from '@eddy/geo';
import { loadMapbox, STYLE_URL } from '@/map/runtime';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export interface FloatMapProps {
  line: LngLat[];
  start: LngLat | null;
  takeOut: LngLat;
  position: LngLat | null;
  /** The position is not live: draw it, but faded. */
  positionDimmed: boolean;
}

interface CameraRef {
  setCamera: (stop: { centerCoordinate?: [number, number]; zoomLevel?: number; animationDuration?: number }) => void;
}

const FOLLOW_ZOOM = 14;

export function FloatMap(props: FloatMapProps) {
  const Mapbox = loadMapbox();
  // One-way for this visit (ADR 0011): once the map has failed to load its
  // style (no download, no signal, nothing cached), draw the river instead
  // and stay there. Flipping back and forth with connectivity would remount
  // the map and lose the camera every time service flickered.
  const [failed, setFailed] = useState(false);
  return Mapbox && !failed ? (
    <MapboxFloatMap {...props} Mapbox={Mapbox} onFail={() => setFailed(true)} />
  ) : (
    <RiverOnlyMap {...props} />
  );
}

function MapboxFloatMap({
  Mapbox,
  line,
  start,
  takeOut,
  position,
  positionDimmed,
  onFail,
}: FloatMapProps & { Mapbox: NonNullable<ReturnType<typeof loadMapbox>>; onFail: () => void }) {
  const { colors } = useTheme();
  const camera = useRef<CameraRef | null>(null);
  const [following, setFollowing] = useState(true);

  const bounds = useMemo(() => boundsForLine(line), [line]);
  const [defaultSettings] = useState(() =>
    position
      ? { centerCoordinate: position, zoomLevel: FOLLOW_ZOOM }
      : bounds
        ? { bounds: { sw: [bounds[0], bounds[1]], ne: [bounds[2], bounds[3]], paddingTop: 40, paddingBottom: 40, paddingLeft: 40, paddingRight: 40 } }
        : { centerCoordinate: takeOut, zoomLevel: 12 },
  );

  // Follow the confirmed position while following is on.
  const lng = position?.[0];
  const lat = position?.[1];
  useEffect(() => {
    if (!following || lng == null || lat == null) return;
    camera.current?.setCamera({ centerCoordinate: [lng, lat], animationDuration: 600 });
  }, [following, lng, lat]);

  const routeShape = useMemo(
    () => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: line } }),
    [line],
  );
  const endsShape = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: [
        ...(start ? [{ type: 'Feature' as const, properties: { end: 'start' }, geometry: { type: 'Point' as const, coordinates: start } }] : []),
        { type: 'Feature' as const, properties: { end: 'take-out' }, geometry: { type: 'Point' as const, coordinates: takeOut } },
      ],
    }),
    [start, takeOut],
  );

  return (
    <View style={styles.fill}>
      <Mapbox.MapView
        style={styles.fill}
        styleURL={STYLE_URL}
        scaleBarEnabled={false}
        // Required by Mapbox's terms on every map; position only.
        logoEnabled
        attributionEnabled
        onDidFailLoadingMap={onFail}
        onCameraChanged={(state: { gestures?: { isGestureActive?: boolean } }) => {
          if (state?.gestures?.isGestureActive) setFollowing(false);
        }}
      >
        <Mapbox.Camera ref={camera} defaultSettings={defaultSettings} />
        <Mapbox.ShapeSource id="float-route" shape={routeShape}>
          <Mapbox.LineLayer
            id="float-route-line"
            style={{ lineColor: colors.interactive, lineWidth: 5, lineCap: 'round', lineJoin: 'round' }}
          />
        </Mapbox.ShapeSource>
        <Mapbox.ShapeSource id="float-ends" shape={endsShape}>
          <Mapbox.CircleLayer
            id="float-ends-dot"
            style={{
              circleRadius: 7,
              circleColor: ['match', ['get', 'end'], 'take-out', colors.accent, colors.interactive],
              circleStrokeColor: '#ffffff',
              circleStrokeWidth: 2,
            }}
          />
        </Mapbox.ShapeSource>
        {position ? (
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
      {!following && position ? <RecenterButton onPress={() => setFollowing(true)} /> : null}
    </View>
  );
}

function RecenterButton({ onPress }: { onPress: () => void }) {
  const { colors, elevation } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.recenter, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }, elevation(2)]}
      accessibilityRole="button"
      accessibilityLabel="Recenter on your position"
    >
      <ControlIcon name="locate" size={18} color={colors.interactive} />
      <Text style={[styles.recenterText, { color: colors.interactive }]}>Recenter</Text>
    </Pressable>
  );
}

/** The river drawn plainly, for when Mapbox cannot draw at all. */
function RiverOnlyMap({ line, start, takeOut, position, positionDimmed }: FloatMapProps) {
  const { colors } = useTheme();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const drawing = useMemo(() => (size ? fit(line, size.width, size.height, 24) : null), [line, size]);

  return (
    <View style={[styles.fill, { backgroundColor: colors.selectionBg }]} onLayout={onLayout}>
      {drawing && size ? (
        <Svg width={size.width} height={size.height}>
          <Path d={drawing.path} stroke={colors.interactive} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          {start ? <Circle {...drawing.point(start)} r={7} fill={colors.interactive} stroke="#ffffff" strokeWidth={2} /> : null}
          <Circle {...drawing.point(takeOut)} r={7} fill={colors.accent} stroke="#ffffff" strokeWidth={2} />
          {position ? (
            <Circle {...drawing.point(position)} r={9} fill="#1E6FD9" opacity={positionDimmed ? 0.4 : 1} stroke="#ffffff" strokeWidth={3} />
          ) : null}
        </Svg>
      ) : null}
      <Text style={[styles.fallbackNote, { color: colors.textMuted }]}>River only · background map unavailable</Text>
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
  const step = Math.max(1, Math.floor(line.length / 400));
  const path = line
    .filter((_, i) => i % step === 0 || i === line.length - 1)
    .map((p, i) => {
      const { cx, cy } = point(p);
      return `${i === 0 ? 'M' : 'L'}${cx.toFixed(1)} ${cy.toFixed(1)}`;
    })
    .join(' ');
  return { path, point };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  recenter: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
  },
  recenterText: { ...t.sm, fontFamily: fonts.semibold },
  fallbackNote: { position: 'absolute', left: 12, bottom: 10, ...t.xs, fontFamily: fonts.body },
});
