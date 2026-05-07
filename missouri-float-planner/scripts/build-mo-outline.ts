#!/usr/bin/env npx tsx
/**
 * Build src/data/mo-outline.json from US Census TIGER/Line state boundaries.
 *
 * Source: us-atlas (topojson/us-atlas) states-10m.json — generated from the
 * Census Cartographic Boundary file `cb_2023_us_state_5m`. Already projected
 * in EPSG:4326. Missouri is STATEFP 29.
 *
 * The output is a single GeoJSON Polygon (MO's mainland is contiguous —
 * no MultiPolygon needed) used by `MOMap.tsx` for the parchment silhouette
 * fill and the state-border path. See `src/components/mo-surface-water/
 * MOMap.tsx` and the `outlineToPath()` helper in that file.
 *
 * Run:   npx tsx scripts/build-mo-outline.ts
 */
import { writeFileSync } from 'fs';
import { feature } from 'topojson-client';
import * as turf from '@turf/turf';
// us-atlas ships pre-built TopoJSON artifacts in its npm tarball.
import topologyRaw from 'us-atlas/states-10m.json';

const SIMPLIFY_TOLERANCE_DEG = 0.015; // ~150 vertices, ~1km accuracy at MO latitude
const MO_FIPS = '29';

interface StateGeometry {
  id?: string;
  type: string;
  arcs: unknown;
  properties?: { name?: string };
}
interface UsAtlasTopology {
  type: string;
  bbox?: number[];
  transform?: { scale: number[]; translate: number[] };
  arcs: number[][][];
  objects: { states: { type: string; geometries: StateGeometry[] }; nation: unknown };
}

const topology = topologyRaw as unknown as UsAtlasTopology;
const moGeometry = topology.objects.states.geometries.find((g) => g.id === MO_FIPS);
if (!moGeometry) {
  throw new Error('Missouri (FIPS 29) not found in us-atlas states-10m');
}

// Wrap the single geometry in a fresh Topology so feature() can resolve arcs.
// topojson-client's feature() signature is intentionally loose; we bypass
// generics here rather than fight topojson-specification's deep types.
const moTopo = { ...topology, objects: { mo: moGeometry } } as unknown as Parameters<
  typeof feature
>[0];
const moFeature = feature(moTopo, 'mo') as unknown as GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon
>;

if (moFeature.geometry.type !== 'Polygon') {
  throw new Error(`Expected Polygon, got ${moFeature.geometry.type}`);
}

const simplified = turf.simplify(moFeature, {
  tolerance: SIMPLIFY_TOLERANCE_DEG,
  highQuality: true,
}) as GeoJSON.Feature<GeoJSON.Polygon>;

const coords = simplified.geometry.coordinates[0];

const out = {
  type: 'Polygon' as const,
  coordinates: simplified.geometry.coordinates,
  properties: {
    source: 'US Census TIGER/Line via topojson/us-atlas states-10m',
    state_fips: MO_FIPS,
    name: 'Missouri',
    simplification: {
      algorithm: 'turf.simplify (Douglas-Peucker)',
      tolerance_deg: SIMPLIFY_TOLERANCE_DEG,
      vertex_count: coords.length,
    },
  },
};

writeFileSync('src/data/mo-outline.json', JSON.stringify(out, null, 2));
console.log(`wrote ${coords.length} vertices to src/data/mo-outline.json`);
