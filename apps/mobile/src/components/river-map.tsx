// Renders a polyline (typically a river segment or planned float route) on a
// MapLibre map. Native-only: MapLibre RN doesn't run in the web bundler, so a
// .web.tsx sibling renders a graceful placeholder.

import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
} from '@maplibre/maplibre-react-native';
import type { Feature, LineString } from 'geojson';
import { StyleSheet, View } from 'react-native';

const TILE_STYLE_URL = 'https://demotiles.maplibre.org/style.json';
const LINE_COLOR = '#0E7490';

export interface RiverMapProps {
  /** GeoJSON LineString or Feature<LineString> for the polyline. */
  route: Feature<LineString> | LineString;
  /** Optional [minLng, minLat, maxLng, maxLat] to frame the route. */
  bounds?: [number, number, number, number];
}

export function RiverMap({ route, bounds }: RiverMapProps) {
  const feature: Feature<LineString> =
    route.type === 'Feature'
      ? route
      : { type: 'Feature', geometry: route, properties: {} };

  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={TILE_STYLE_URL}>
        {bounds && (
          <Camera
            initialViewState={{
              bounds: bounds,
              padding: { top: 40, right: 40, bottom: 40, left: 40 },
            }}
          />
        )}
        <GeoJSONSource id="route" data={feature}>
          <Layer
            id="route-line"
            type="line"
            paint={{
              'line-color': LINE_COLOR,
              'line-width': 3,
            }}
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
          />
        </GeoJSONSource>
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 240,
    overflow: 'hidden',
    borderRadius: 12,
  },
  map: {
    flex: 1,
  },
});
