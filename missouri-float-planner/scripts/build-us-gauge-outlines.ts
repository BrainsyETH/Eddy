// Geographic context for the nationwide SVG gauge layer. Regenerate with npx tsx scripts/build-us-gauge-outlines.ts.
import { writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { simplify, lineString } from '@turf/turf';
import topology from 'us-atlas/states-10m.json';

const states = feature(topology as unknown as Parameters<typeof feature>[0], 'states') as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
const outlines = states.features.map(state => {
  const geometry = state.geometry;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return { name: String(state.properties?.name), rings: polygons.flatMap(polygon => {
    const ring = simplify(lineString(polygon[0]), { tolerance: 0.035, highQuality: true }).geometry.coordinates;
    return ring.length < 4 ? [] : [ring.map(([lng, lat]) => [Number(lng.toFixed(4)), Number(lat.toFixed(4))])];
  }) };
});
writeFileSync('src/data/us-gauge-outlines.json', JSON.stringify(outlines));
