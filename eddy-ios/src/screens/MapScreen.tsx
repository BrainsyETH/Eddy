import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { apiFetch } from '@/lib/api';
import { env } from '@/lib/env';
import { downloadRiverCorridor } from '@/map/offline';

type FeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry>;
interface RiverDetail {
  river: {
    id: string; name: string; slug: string;
    geometry: GeoJSON.LineString;
    bounds: [number, number, number, number];
  };
}
interface GaugeRow { id: string; coordinates: { lng: number; lat: number } }

const CONDITION_COLORS: Record<string, string> = {
  dangerous: '#c92a2a', high: '#e8590c', flowing: '#087f5b', good: '#66a80f', low: '#e67700', too_low: '#868e96', unknown: '#087f5b',
};

function pointCollection(rows: Array<{ id: string; coordinates?: { lng: number; lat: number }; longitude?: number; latitude?: number }>): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rows.flatMap((row) => {
      const lng = row.coordinates?.lng ?? row.longitude;
      const lat = row.coordinates?.lat ?? row.latitude;
      return lng == null || lat == null ? [] : [{
        type: 'Feature' as const, id: row.id, properties: {}, geometry: { type: 'Point' as const, coordinates: [lng, lat] },
      }];
    }),
  };
}

export function MapScreen() {
  const [river, setRiver] = useState<RiverDetail['river'] | null>(null);
  const [access, setAccess] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [hazards, setHazards] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [gauges, setGauges] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [riverColor, setRiverColor] = useState(CONDITION_COLORS.unknown);
  const [progress, setProgress] = useState<number | null>(null);
  const styleUrl = `${env.apiUrl}/map-styles/eddy-natural.json`;

  useEffect(() => {
    void Promise.all([
      apiFetch<RiverDetail>('/api/rivers/current-river'),
      apiFetch<{ accessPoints: Array<{ id: string; coordinates: { lng: number; lat: number } }> }>('/api/rivers/current-river/access-points'),
      apiFetch<{ hazards: Array<{ id: string; coordinates: { lng: number; lat: number } }> }>('/api/rivers/current-river/hazards'),
      apiFetch<{ gauges: GaugeRow[] }>('/api/gauges'),
      apiFetch<{ rivers: Array<{ slug: string; currentCondition: { code: string } | null }> }>('/api/rivers'),
    ]).then(([detail, accessResponse, hazardResponse, gaugeResponse, riversResponse]) => {
      setRiver(detail.river); setAccess(pointCollection(accessResponse.accessPoints)); setHazards(pointCollection(hazardResponse.hazards));
      const [west, south, east, north] = detail.river.bounds;
      setGauges(pointCollection(gaugeResponse.gauges.filter((gauge) => gauge.coordinates.lng >= west && gauge.coordinates.lng <= east && gauge.coordinates.lat >= south && gauge.coordinates.lat <= north)));
      const condition = riversResponse.rivers.find((item) => item.slug === detail.river.slug)?.currentCondition?.code || 'unknown';
      setRiverColor(CONDITION_COLORS[condition] || CONDITION_COLORS.unknown);
    }).catch((error) => console.warn('[MapScreen]', error));
  }, []);

  const riverShape = useMemo<GeoJSON.Feature<GeoJSON.LineString> | null>(() => river ? ({
    type: 'Feature', properties: { slug: river.slug }, geometry: river.geometry,
  }) : null, [river]);

  if (!river || !riverShape) return <View style={styles.center}><ActivityIndicator /><Text>Loading the Current River…</Text></View>;
  const [west, south, east, north] = river.bounds;
  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={styleUrl}>
        <Camera initialViewState={{ bounds: [west, south, east, north], padding: { top: 60, bottom: 60, left: 40, right: 40 } }} />
        <GeoJSONSource id="river" data={riverShape}><Layer id="river-line" type="line" paint={{ 'line-color': riverColor, 'line-width': 5 }} /></GeoJSONSource>
        <GeoJSONSource id="access" data={access}><Layer id="access-points" type="circle" paint={{ 'circle-color': '#f8f9fa', 'circle-stroke-color': '#087f5b', 'circle-stroke-width': 2, 'circle-radius': 6 }} /></GeoJSONSource>
        <GeoJSONSource id="gauges" data={gauges}><Layer id="gauges" type="circle" paint={{ 'circle-color': '#1971c2', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-radius': 6 }} /></GeoJSONSource>
        <GeoJSONSource id="hazards" data={hazards}><Layer id="hazards" type="circle" paint={{ 'circle-color': '#e03131', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-radius': 7 }} /></GeoJSONSource>
      </Map>
      <View style={styles.offline}>
        <Button title={progress == null ? 'Download Current River' : `Downloading ${Math.round(progress)}%`} disabled={progress != null || !env.offlineStyleUrl}
          onPress={() => { setProgress(0); void downloadRiverCorridor(river.slug, river.bounds, setProgress).then(() => setProgress(100)).catch((error) => { setProgress(null); console.warn(error); }); }} />
        {!env.offlineStyleUrl && <Text style={styles.note}>Offline source awaits Eddy-owned tiles.</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, map: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  offline: { position: 'absolute', left: 16, right: 16, bottom: 16, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.94)' },
  note: { marginTop: 6, color: '#666', textAlign: 'center', fontSize: 12 },
});
