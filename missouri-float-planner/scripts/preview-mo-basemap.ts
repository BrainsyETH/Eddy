#!/usr/bin/env npx tsx
/**
 * Render a static SVG preview of the /missouri-surface-water basemap so
 * we can sanity-check `src/data/mo-rivers-basemap.json` + the projection
 * choices in `MOMap.tsx` without booting the Next dev server.
 *
 * Mirrors MOMap.tsx's projection (state-bbox locked, plate-carrée with
 * cosLat correction) and stroke-weight scheme exactly. The output is a
 * single self-contained .svg that can be opened in any browser to
 * compare against the geology.com reference image.
 *
 * Run:  npx tsx scripts/preview-mo-basemap.ts [out.svg]
 */
import { readFileSync, writeFileSync } from 'fs';

const W = 1600;
const H = 1000;
const PADDING = 60;

type LineCoords = Array<[number, number]>;

const moOutline = JSON.parse(readFileSync('src/data/mo-outline.json', 'utf8'));
const basemap = JSON.parse(readFileSync('src/data/mo-rivers-basemap.json', 'utf8'));
const MO_OUTLINE = moOutline.coordinates[0] as LineCoords;
const BASEMAP_RIVERS = basemap.rivers.features as Array<{
  properties: { name: string; length_mi: number };
  geometry: { type: 'LineString'; coordinates: number[][] };
}>;
const BASEMAP_LAKES = basemap.lakes.features as Array<{
  properties: { name: string; area_sqkm: number };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}>;

let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
for (const [lon, lat] of MO_OUTLINE) {
  if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
  if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
}
const lonPad = (maxLon - minLon) * 0.02;
const latPad = (maxLat - minLat) * 0.02;
const bbox = {
  minLon: minLon - lonPad, maxLon: maxLon + lonPad,
  minLat: minLat - latPad, maxLat: maxLat + latPad,
};
const lonSpan = bbox.maxLon - bbox.minLon;
const latSpan = bbox.maxLat - bbox.minLat;
const centerLon = (bbox.minLon + bbox.maxLon) / 2;
const centerLat = (bbox.minLat + bbox.maxLat) / 2;
const cosLat = Math.cos((centerLat * Math.PI) / 180);
const innerW = W - 2 * PADDING;
const innerH = H - 2 * PADDING;
const scale = Math.min(innerW / lonSpan, innerH / (latSpan / cosLat));

function project(lon: number, lat: number): [number, number] {
  const x = (lon - centerLon) * scale + W / 2;
  const y = -(lat - centerLat) * (scale / cosLat) + H / 2;
  return [x, y];
}
function lineToPath(coords: LineCoords): string {
  if (!coords.length) return '';
  return coords
    .map(([lon, lat], i) => {
      const [x, y] = project(lon, lat);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}
function polygonToPath(coords: LineCoords): string {
  return lineToPath(coords) + ' Z';
}
function strokeWidthForBasemapRiver(lengthMi: number): number {
  if (lengthMi >= 200) return 1.6;
  if (lengthMi >= 100) return 1.2;
  if (lengthMi >= 50) return 0.95;
  return 0.7;
}

const stateOutlinePath = polygonToPath(MO_OUTLINE);
const sortedRivers = BASEMAP_RIVERS.slice().sort(
  (a, b) => b.properties.length_mi - a.properties.length_mi,
);

const lakePaths: Array<{ name: string; d: string }> = [];
for (const f of BASEMAP_LAKES) {
  const rings: LineCoords[] = [];
  if (f.geometry.type === 'Polygon') {
    const outer = (f.geometry.coordinates as number[][][])[0];
    if (outer) rings.push(outer as LineCoords);
  } else {
    for (const poly of f.geometry.coordinates as number[][][][]) {
      if (poly[0]) rings.push(poly[0] as LineCoords);
    }
  }
  const d = rings.map(polygonToPath).join(' ');
  if (d) lakePaths.push({ name: f.properties.name, d });
}

const out = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
  <defs>
    <radialGradient id="mo-bg" cx="50%" cy="50%" r="85%">
      <stop offset="0%" stop-color="#F4ECDB" />
      <stop offset="60%" stop-color="#EADFC2" />
      <stop offset="100%" stop-color="#D4C394" />
    </radialGradient>
    <clipPath id="mo-clip"><path d="${stateOutlinePath}" /></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#0F2D35" />
  <g clip-path="url(#mo-clip)">
    <rect width="${W}" height="${H}" fill="url(#mo-bg)" />
    ${lakePaths.map((l) =>
      `<path d="${l.d}" fill="#7FB2C2" stroke="#3F8499" stroke-width="0.6" opacity="0.78" />`,
    ).join('\n    ')}
    ${sortedRivers.map((r) => {
      const d = lineToPath(r.geometry.coordinates as LineCoords);
      const sw = strokeWidthForBasemapRiver(r.properties.length_mi);
      return `<path d="${d}" stroke="#3F8499" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" />`;
    }).join('\n    ')}
  </g>
  <path d="${stateOutlinePath}" fill="none" stroke="rgba(80,60,30,0.65)" stroke-width="2.2" stroke-linejoin="round" />
  <text x="${W / 2}" y="48" text-anchor="middle" font-family="ui-monospace, monospace" font-size="13" letter-spacing="0.45em" fill="rgba(80,60,30,0.5)" font-weight="500">STATE OF MISSOURI · SURFACE WATER NETWORK</text>
  <text x="${W - 14}" y="${H - 14}" text-anchor="end" font-family="ui-monospace, monospace" font-size="10" fill="rgba(80,60,30,0.55)">Geometry: USGS NHD HR · ${BASEMAP_RIVERS.length} named rivers · ${BASEMAP_LAKES.length} reservoirs</text>
</svg>`;

const outPath = process.argv[2] ?? 'tmp/mo-basemap-preview.svg';
writeFileSync(outPath, out);
console.log(`wrote ${out.length} bytes to ${outPath}`);
console.log(`  ${BASEMAP_RIVERS.length} rivers, ${BASEMAP_LAKES.length} lakes`);
