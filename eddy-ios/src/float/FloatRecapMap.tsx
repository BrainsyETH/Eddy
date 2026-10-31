import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { recapRouteDrawing, recapRouteGeometry, type RecapRouteGeometry } from '@/lib/floatRecapRoute';
import { loadMapbox, STYLE_URL } from '@/map/runtime';
import { styleLoadFailed } from '@/lib/mapLoadingError';
import { useTheme } from '@/theme/ThemeProvider';
import { type as t } from '@/theme/typography';
import { loadFloatRoute, type LoadedRoute } from './loadFloatRoute';

/** Cached river geometry, never a new location request or a downloaded GPS trace. */
export function FloatRecapMap({ trip }: { trip: CompletedFloat }) {
  const { colors } = useTheme();
  const slug = trip.riverSlug;
  const key = slug + ':' + trip.routeSnapshot?.calibration;
  const [loaded, setLoaded] = useState<{ key: string; result: LoadedRoute | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void loadFloatRoute(slug, controller.signal).then(result => {
      if (active) setLoaded({ key, result });
    }).catch(() => {
      if (active) setLoaded({ key, result: null });
    });
    return () => { active = false; controller.abort(); };
  }, [key, slug]);
  // A backup can enrich the water reading without reloading or flashing the map.
  const geometry = useMemo(() => loaded?.key === key && loaded.result?.ok
    ? recapRouteGeometry(trip, loaded.result.route, loaded.result.index) : null, [loaded, key, trip]);
  if (loaded?.key !== key) return <View style={styles.loading}>
    <ActivityIndicator color={colors.interactive} accessibilityLabel="Loading route map" />
  </View>;
  if (!geometry) return <Text style={[t.sm, { color: colors.textMuted }]}>Route map unavailable</Text>;
  return <RouteMap key={trip.id} geometry={geometry} />;
}

function RouteMap({ geometry }: { geometry: RecapRouteGeometry }) {
  const { colors, isDark } = useTheme();
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(320);
  const Mapbox = loadMapbox();
  const drawing = useMemo(() => recapRouteDrawing(geometry, width, 180), [geometry, width]);
  const shape = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: geometry.section } };
  const covered = { type: 'Feature' as const, properties: {}, geometry: { type: 'MultiLineString' as const, coordinates: geometry.covered } };
  const markers = {
    type: 'FeatureCollection' as const,
    features: [
      { point: geometry.start, label: geometry.startName, kind: 'start', color: colors.interactive },
      { point: geometry.takeOut, label: geometry.takeOutName, kind: 'take-out', color: colors.accent },
      ...(geometry.last ? [{ point: geometry.last, label: 'Last recorded', kind: 'last', color: colors.text }] : []),
    ].map(({ point, ...properties }) => ({ type: 'Feature' as const, properties, geometry: { type: 'Point' as const, coordinates: point } })),
  };
  const frame = geometry.bounds;
  return <View style={[styles.map, { backgroundColor: colors.cardRaised }]} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {Mapbox && !failed ? <Mapbox.MapView
      style={styles.fill}
      styleURL={isDark ? 'mapbox://styles/mapbox/dark-v11' : STYLE_URL}
      scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
      compassEnabled={false} scaleBarEnabled={false} logoEnabled attributionEnabled
      onMapLoadingError={(event: unknown) => { if (styleLoadFailed(event)) setFailed(true); }}
    >
      <Mapbox.Camera animationDuration={0} defaultSettings={{ bounds: {
        sw: [frame[0], frame[1]], ne: [frame[2], frame[3]],
        paddingTop: 34, paddingBottom: 34, paddingLeft: 36, paddingRight: 36,
      } }} />
      <Mapbox.ShapeSource id="recap-route" shape={shape}>
        <Mapbox.LineLayer id="recap-route-line" style={{ lineColor: colors.borderStrong, lineWidth: 3, lineDasharray: [2, 2], lineCap: 'round', lineJoin: 'round' }} />
      </Mapbox.ShapeSource>
      {geometry.covered.length ? <Mapbox.ShapeSource id="recap-covered" shape={covered}>
        <Mapbox.LineLayer id="recap-covered-outline" style={{ lineColor: colors.card, lineWidth: 7, lineCap: 'round', lineJoin: 'round' }} />
        <Mapbox.LineLayer id="recap-covered-line" style={{ lineColor: colors.accent, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }} />
      </Mapbox.ShapeSource> : null}
      <Mapbox.ShapeSource id="recap-markers" shape={markers}>
        <Mapbox.CircleLayer id="recap-marker-dots" style={{ circleColor: ['get', 'color'], circleRadius: 6, circleStrokeColor: colors.card, circleStrokeWidth: 2 }} />
        <Mapbox.SymbolLayer id="recap-marker-labels" style={{
          textField: ['get', 'label'], textSize: 12, textColor: colors.text,
          textHaloColor: colors.card, textHaloWidth: 2, textAnchor: 'top', textOffset: [0, 1], textMaxWidth: 9,
        }} />
      </Mapbox.ShapeSource>
    </Mapbox.MapView> : <View accessible accessibilityRole="image"
      accessibilityLabel={'River route from ' + geometry.startName + ' to ' + geometry.takeOutName + '. Orange shows estimated river coverage.'}>
      <Svg width={width} height={180}>
        <Path d={drawing.path(geometry.section)} stroke={colors.borderStrong} strokeWidth={3} strokeDasharray="5 5" fill="none" />
        {geometry.covered.map((line, i) => <Path key={i} d={drawing.path(line)} stroke={colors.accent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
        <Circle {...drawing.point(geometry.start)} r={7} fill={colors.interactive} stroke={colors.card} strokeWidth={2} />
        <Circle {...drawing.point(geometry.takeOut)} r={7} fill={colors.accent} stroke={colors.card} strokeWidth={2} />
        {geometry.last ? <>
          <Circle {...drawing.point(geometry.last)} r={6} fill={colors.text} stroke={colors.card} strokeWidth={2} />
          <SvgText x={drawing.point(geometry.last).cx} y={Math.max(14, drawing.point(geometry.last).cy - 12)}
            textAnchor={drawing.point(geometry.last).cx > width / 2 ? 'end' : 'start'} fontSize={12} fill={colors.text}>Last recorded</SvgText>
        </> : null}
      </Svg>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  loading: { height: 180, alignItems: 'center', justifyContent: 'center' },
  map: { height: 180, borderRadius: 14, overflow: 'hidden' },
  fill: { flex: 1 },
});
