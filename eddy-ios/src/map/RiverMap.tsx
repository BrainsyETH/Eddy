// eddy-ios/src/map/RiverMap.tsx
// The Mapbox view: one river's centreline, coloured by its live condition, with
// its access points.
//
// Mapbox is reached through loadMapbox() at RENDER time rather than by importing
// components at module scope. That is what keeps this file safe to import from a
// screen that also has to work in Expo Go — see runtime.ts.

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MapAccessPoint, RiverDetail } from '@eddy/types';
import { COLORS, conditionColor } from '@/theme/conditions';
import { loadMapbox } from './runtime';
import { STYLE_URL } from './useOfflinePacks';

interface Props {
  river: RiverDetail;
  accessPoints: MapAccessPoint[];
  /** Live condition code, used only for the line colour. */
  conditionCode: string;
  onSelectAccessPoint?: (point: MapAccessPoint) => void;
}

export function RiverMap({ river, accessPoints, conditionCode, onSelectAccessPoint }: Props) {
  const Mapbox = loadMapbox();

  const lineFeature = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: river.geometry,
    }),
    [river.geometry],
  );

  const accessFeatures = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: accessPoints.map((point) => ({
        type: 'Feature' as const,
        id: point.id,
        properties: {
          id: point.id,
          name: point.name,
          riverMile: point.riverMile,
          // Mapbox expression matching on a boolean works, but paint values read
          // more clearly from a string.
          access: point.isPublic ? 'public' : 'private',
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [point.coordinates.lng, point.coordinates.lat],
        },
      })),
    }),
    [accessPoints],
  );

  const cameraBounds = useMemo(
    () => ({
      ne: [river.bounds[2], river.bounds[3]],
      sw: [river.bounds[0], river.bounds[1]],
    }),
    [river.bounds],
  );

  // The caller is responsible for not rendering this when Mapbox is unavailable;
  // this guard is here so a mistake shows an empty map rather than a red screen.
  if (!Mapbox) return <View style={styles.fill} />;

  const stroke = conditionColor(conditionCode);

  return (
    <Mapbox.MapView style={styles.fill} styleURL={STYLE_URL} scaleBarEnabled={false}>
      <Mapbox.Camera
        // defaultSettings is not optional here. `bounds` alone is applied as an
        // UPDATE, and on first mount there is nothing to update from — the map
        // opens on the default world view and stays there, which looks like a
        // spinning globe rather than a river. defaultSettings sets the initial
        // camera; bounds then moves it when the user picks another river.
        defaultSettings={{ bounds: cameraBounds }}
        bounds={cameraBounds}
        // Padding belongs on the root prop. Passing it inside `bounds` still
        // works but is deprecated in @rnmapbox/maps 10 — the type comment says
        // the nested props exist only for backwards compatibility.
        padding={{
          paddingTop: 40,
          paddingBottom: 40,
          paddingLeft: 32,
          paddingRight: 32,
        }}
        animationMode="none"
      />

      <Mapbox.ShapeSource id="river-line" shape={lineFeature}>
        {/* Casing first: a dark outline under the colour keeps a thin river
            legible over both the green forest and the pale gravel of the
            outdoors style, which the condition colour alone does not. */}
        <Mapbox.LineLayer
          id="river-line-casing"
          style={{
            lineColor: 'rgba(0,0,0,0.35)',
            lineWidth: 7,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
        <Mapbox.LineLayer
          id="river-line-fill"
          style={{ lineColor: stroke, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }}
        />
      </Mapbox.ShapeSource>

      <Mapbox.ShapeSource
        id="access-points"
        shape={accessFeatures}
        onPress={(event: { features?: { properties?: Record<string, unknown> }[] }) => {
          const id = event.features?.[0]?.properties?.id;
          const match = accessPoints.find((p) => p.id === id);
          if (match) onSelectAccessPoint?.(match);
        }}
      >
        <Mapbox.CircleLayer
          id="access-points-circle"
          style={{
            circleRadius: 6,
            circleColor: [
              'match',
              ['get', 'access'],
              'public',
              COLORS.accent,
              COLORS.textSubtle,
            ],
            circleStrokeWidth: 2,
            circleStrokeColor: '#FFFFFF',
          }}
        />
        <Mapbox.SymbolLayer
          id="access-points-label"
          // Labels only once zoomed in; at region zoom thirty overlapping names
          // are noise, and Mapbox's collision detection would drop most anyway.
          minZoomLevel={11}
          style={{
            textField: ['get', 'name'],
            textSize: 11,
            textOffset: [0, 1.2],
            textAnchor: 'top',
            textColor: COLORS.text,
            textHaloColor: '#FFFFFF',
            textHaloWidth: 1.5,
          }}
        />
      </Mapbox.ShapeSource>
    </Mapbox.MapView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.bg },
});
