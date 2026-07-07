#!/usr/bin/env npx tsx
/**
 * Build src/data/mo-outline.json from US Census TIGER/Line state boundaries.
 *
 * Source: us-atlas (topojson/us-atlas) states-10m.json — generated from the
 * Census Cartographic Boundary file `cb_2023_us_state_5m`. Already projected
 * in EPSG:4326. Missouri is STATEFP 29, Arkansas is 05.
 *
 * The output is a GeoJSON MultiPolygon with one polygon per state (Missouri
 * first, then Arkansas), used by `MOMap.tsx` for the parchment silhouette
 * fill, the state-border paths, the projection window, and the in-region
 * point test. Two states because rivers like the Buffalo (all Arkansas) and
 * the Eleven Point / Current (which cross the MO/AR line) belong to a
 * Missouri + Arkansas Ozark region, not Missouri alone.
 *
 * Run:   npx tsx scripts/build-mo-outline.ts
 */
import { writeFileSync } from 'fs';
import { feature } from 'topojson-client';
import * as turf from '@turf/turf';
// us-atlas ships pre-built TopoJSON artifacts in its npm tarball.
import topologyRaw from 'us-atlas/states-10m.json';

const SIMPLIFY_TOLERANCE_DEG = 0.015; // ~150 vertices, ~1km accuracy at MO latitude
// Missouri first (the historical anchor), Arkansas second.
const REGIONS = [
  { fips: '29', name: 'Missouri' },
  { fips: '05', name: 'Arkansas' },
];

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

// One simplified polygon (its rings) per state, assembled into a
// MultiPolygon. Both MO and AR are contiguous single polygons in the
// cartographic boundary file.
const polygons: GeoJSON.Position[][][] = [];
const regionMeta: Array<{ name: string; fips: string; vertex_count: number }> = [];

for (const region of REGIONS) {
  const geometry = topology.objects.states.geometries.find((g) => g.id === region.fips);
  if (!geometry) throw new Error(`${region.name} (FIPS ${region.fips}) not found in us-atlas states-10m`);

  // Wrap the single geometry in a fresh Topology so feature() can resolve arcs.
  // topojson-client's feature() signature is intentionally loose; we bypass
  // generics here rather than fight topojson-specification's deep types.
  const topo = { ...topology, objects: { region: geometry } } as unknown as Parameters<
    typeof feature
  >[0];
  const feat = feature(topo, 'region') as unknown as GeoJSON.Feature<
    GeoJSON.Polygon | GeoJSON.MultiPolygon
  >;
  if (feat.geometry.type !== 'Polygon') {
    throw new Error(`Expected Polygon for ${region.name}, got ${feat.geometry.type}`);
  }

  const simplified = turf.simplify(feat, {
    tolerance: SIMPLIFY_TOLERANCE_DEG,
    highQuality: true,
  }) as GeoJSON.Feature<GeoJSON.Polygon>;

  // MultiPolygon coordinate shape: [ polygon ][ ring ][ vertex ]. Each state
  // contributes one polygon whose [0] entry is its outer ring.
  polygons.push(simplified.geometry.coordinates);
  regionMeta.push({
    name: region.name,
    fips: region.fips,
    vertex_count: simplified.geometry.coordinates[0].length,
  });
}

const out = {
  type: 'MultiPolygon' as const,
  coordinates: polygons,
  properties: {
    source: 'US Census TIGER/Line via topojson/us-atlas states-10m',
    regions: regionMeta,
    simplification: {
      algorithm: 'turf.simplify (Douglas-Peucker)',
      tolerance_deg: SIMPLIFY_TOLERANCE_DEG,
    },
  },
};

writeFileSync('src/data/mo-outline.json', JSON.stringify(out, null, 2));
console.log(
  `wrote ${regionMeta.map((r) => `${r.name}:${r.vertex_count}`).join(', ')} vertices to src/data/mo-outline.json`,
);
