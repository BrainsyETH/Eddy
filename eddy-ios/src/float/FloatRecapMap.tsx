import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { recapMapDescription, recapRouteDrawing, recapRouteMap, type RecapRouteGeometry } from '@/lib/floatRecapRoute';
import { loadMapbox, STYLE_URL } from '@/map/runtime';
import { styleLoadFailed } from '@/lib/mapLoadingError';
import { useTheme } from '@/theme/ThemeProvider';
import { lightPalette } from '@/theme/palette';
import { type as t } from '@/theme/typography';
import { loadFloatRoute, type LoadedRoute } from './loadFloatRoute';

/** Cached river geometry, never a new location request or a downloaded GPS trace. */
export function FloatRecapMap({ trip }: { trip: CompletedFloat }) {
  const { colors } = useTheme();
  const slug = trip.riverSlug;
  const downloadKey = typeof trip.routeSnapshot?.downloadKey === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(trip.routeSnapshot.downloadKey)
    ? trip.routeSnapshot.downloadKey : undefined;
  const key = slug + ':' + downloadKey + ':' + trip.routeSnapshot?.calibration;
  const [loaded, setLoaded] = useState<{ key: string; results: LoadedRoute[]; pending: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const read = async (packageKey?: string) => {
      try { return await loadFloatRoute(slug, controller.signal, packageKey); }
      catch { return null; }
    };
    void (async () => {
      const results: LoadedRoute[] = [];
      if (downloadKey) {
        const original = await read(downloadKey);
        if (!active) return;
        if (original) results.push(original);
        // Show an available original map before any cache/network fallback finishes.
        setLoaded({ key, results: [...results], pending: true });
      }
      const current = await read();
      if (!active) return;
      if (current) results.push(current);
      setLoaded({ key, results, pending: false });
    })();
    return () => { active = false; controller.abort(); };
  }, [downloadKey, key, slug]);
  // A backup can enrich the water reading without reloading or flashing the map.
  const map = useMemo(() => recapRouteMap(trip, loaded?.key === key
    ? loaded.results.flatMap(result => result.ok ? [result] : []) : []), [loaded, key, trip]);
  if (loaded?.key !== key || (!map.geometry && loaded.pending)) return <View style={styles.loading}>
    <ActivityIndicator color={colors.interactive} accessibilityLabel="Loading route map" />
  </View>;
  if (!map.geometry) return <Text style={[t.sm, { color: colors.textMuted }]}>{map.message}</Text>;
  return <RouteMap key={trip.id} geometry={map.geometry} />;
}

function RouteMap({ geometry }: { geometry: RecapRouteGeometry }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(320);
  const Mapbox = loadMapbox();
  // Outdoors stays light in both appearances; its overlay ink must stay legible.
  const ink = Mapbox && !failed ? lightPalette : colors;
  const drawing = useMemo(() => recapRouteDrawing(geometry, width, 180), [geometry, width]);
  const shape = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: geometry.section } };
  const covered = { type: 'Feature' as const, properties: {}, geometry: { type: 'MultiLineString' as const, coordinates: geometry.covered } };
  const markers = {
    type: 'FeatureCollection' as const,
    features: [
      { point: geometry.start, label: geometry.startName, kind: 'start', color: ink.interactive },
      { point: geometry.takeOut, label: geometry.takeOutName, kind: 'take-out', color: ink.accent },
      ...(geometry.last ? [{ point: geometry.last, label: 'Last recorded', kind: 'last', color: ink.text }] : []),
    ].map(({ point, ...properties }) => ({ type: 'Feature' as const, properties, geometry: { type: 'Point' as const, coordinates: point } })),
  };
  const frame = geometry.bounds;
  const description = recapMapDescription(geometry);
  return <View style={[styles.map, { backgroundColor: colors.cardRaised }]} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {Mapbox && !failed ? <>
      {/* A separate accessible image avoids grouping away Mapbox's attribution button. */}
      <View accessible accessibilityRole="image" accessibilityLabel={description} pointerEvents="none" style={StyleSheet.absoluteFill} />
      <Mapbox.MapView
        style={styles.fill}
        styleURL={STYLE_URL}
        accessible={false}
        scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
        compassEnabled={false} scaleBarEnabled={false} logoEnabled attributionEnabled
        onMapLoadingError={(event: unknown) => { if (styleLoadFailed(event)) setFailed(true); }}
      >
        <Mapbox.Camera animationDuration={0} defaultSettings={{ bounds: {
          sw: [frame[0], frame[1]], ne: [frame[2], frame[3]],
          paddingTop: 34, paddingBottom: 34, paddingLeft: 36, paddingRight: 36,
        } }} />
        <Mapbox.ShapeSource id="recap-route" shape={shape}>
          <Mapbox.LineLayer id="recap-route-line" style={{ lineColor: ink.borderStrong, lineWidth: 3, lineDasharray: [2, 2], lineCap: 'round', lineJoin: 'round' }} />
        </Mapbox.ShapeSource>
        {geometry.covered.length ? <Mapbox.ShapeSource id="recap-covered" shape={covered}>
          <Mapbox.LineLayer id="recap-covered-outline" style={{ lineColor: ink.card, lineWidth: 7, lineCap: 'round', lineJoin: 'round' }} />
          <Mapbox.LineLayer id="recap-covered-line" style={{ lineColor: ink.accent, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }} />
        </Mapbox.ShapeSource> : null}
        <Mapbox.ShapeSource id="recap-markers" shape={markers}>
          <Mapbox.CircleLayer id="recap-marker-dots" style={{ circleColor: ['get', 'color'], circleRadius: 6, circleStrokeColor: ink.card, circleStrokeWidth: 2 }} />
          <Mapbox.SymbolLayer id="recap-marker-labels" style={{
            textField: ['get', 'label'], textSize: 12, textColor: ink.text,
            textHaloColor: ink.card, textHaloWidth: 2, textAnchor: 'top', textOffset: [0, 1], textMaxWidth: 9,
          }} />
        </Mapbox.ShapeSource>
      </Mapbox.MapView>
    </> : <View accessible accessibilityRole="image" accessibilityLabel={description}>
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
