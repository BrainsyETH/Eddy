#!/usr/bin/env npx tsx
/**
 * Build public/mo-hillshade.png — a baked terrain-relief raster for the
 * /missouri-surface-water observatory map.
 *
 * Source: AWS Terrain Tiles (Mapzen terrarium encoding, SRTM-derived),
 * s3.amazonaws.com/elevation-tiles-prod, public domain. Fetched ONCE at
 * build time — the page itself never downloads elevation tiles, which is
 * the point: real Ozark relief at zero runtime tile cost for rural /
 * weak-signal users.
 *
 * The raster is rendered in the SAME projection as MOMap.tsx
 * (src/components/mo-surface-water/projection.ts, framed to the state
 * outline bbox with 2% pad), so it drops into the SVG at
 * x=0 y=0 width=1600 height=1000 and aligns exactly with the river
 * geometry. Relief is encoded in the ALPHA channel — black pixels where
 * slopes fall in shadow, white where they catch sun, transparent where
 * flat — so it composites with plain source-over blending on the light
 * parchment fill (blend modes compress shadow contrast on a near-white
 * base to almost nothing).
 *
 * Run:   npx tsx scripts/build-mo-hillshade.ts
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PNG } from 'pngjs';
import moOutline from '../src/data/mo-outline.json';
import { W, H, buildProjector, bboxOf } from '../src/components/mo-surface-water/projection';

const Z = 9; // ~360 px/deg — comfortably above the 1600px output width
const TILE_BASE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const CACHE_DIR = join(process.cwd(), '.terrain-tile-cache');
const OUT_PATH = join(process.cwd(), 'public', 'mo-hillshade.png');

// Sun + relief parameters. Ozark relief is modest (~150–400 m), so a
// healthy vertical exaggeration is needed for it to read at state scale.
const SUN_AZIMUTH_DEG = 315;
const SUN_ALTITUDE_DEG = 45;
const Z_FACTOR = 13;

// Output raster resolution. Sub-viewBox on purpose: the SVG scales it
// back up to 1600x1000 and shaded relief has no crisp edges to lose,
// while the PNG lands ~4x smaller (weak-signal budget: <400 KB).
const OUT_W = 1120;
const OUT_H = 700;
const SCALE_OUT = W / OUT_W;

const MO_OUTLINE = (moOutline as { coordinates: number[][][] }).coordinates[0] as Array<
  [number, number]
>;

// ── Web-mercator helpers (terrarium tiles are z/x/y mercator) ──────────
const worldPx = (z: number) => 256 * Math.pow(2, z);
function lonToWorldX(lon: number, z: number): number {
  return ((lon + 180) / 360) * worldPx(z);
}
function latToWorldY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * worldPx(z);
}

async function fetchTile(x: number, y: number): Promise<PNG> {
  const cached = join(CACHE_DIR, `${Z}-${x}-${y}.png`);
  let buf: Buffer;
  if (existsSync(cached)) {
    buf = readFileSync(cached);
  } else {
    const url = `${TILE_BASE}/${Z}/${x}/${y}.png`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`tile ${url} → ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(cached, buf);
  }
  return PNG.sync.read(buf);
}

function terrariumElev(png: PNG, px: number, py: number): number {
  const i = (py * png.width + px) * 4;
  return png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });

  const bbox = bboxOf(MO_OUTLINE, 0.02);
  const project = buildProjector(bbox);
  // Invert the projector analytically (it's linear in lon/lat).
  const centerLon = (bbox.minLon + bbox.maxLon) / 2;
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const [x1] = project(centerLon + 0.5, centerLat);
  const [x0] = project(centerLon - 0.5, centerLat);
  const scale = x1 - x0; // px per degree lon
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  const invert = (x: number, y: number): [number, number] => [
    (x - W / 2) / scale + centerLon,
    -((y - H / 2) * cosLat) / scale + centerLat,
  ];

  // Tile range covering the output raster (with a 1-tile margin so the
  // Horn kernel can sample beyond the edge).
  const corners: Array<[number, number]> = [
    invert(0, 0), invert(W, 0), invert(0, H), invert(W, H),
  ];
  const lons = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  const tx0 = Math.floor(lonToWorldX(Math.min(...lons), Z) / 256) - 1;
  const tx1 = Math.floor(lonToWorldX(Math.max(...lons), Z) / 256) + 1;
  const ty0 = Math.floor(latToWorldY(Math.max(...lats), Z) / 256) - 1;
  const ty1 = Math.floor(latToWorldY(Math.min(...lats), Z) / 256) + 1;

  console.log(`fetching ${(tx1 - tx0 + 1) * (ty1 - ty0 + 1)} terrarium tiles at z${Z}…`);
  const tiles = new Map<string, PNG>();
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      tiles.set(`${tx}/${ty}`, await fetchTile(tx, ty));
      process.stdout.write('.');
    }
  }
  console.log('\nsampling elevation grid…');

  const elevAt = (lon: number, lat: number): number => {
    const wx = lonToWorldX(lon, Z);
    const wy = latToWorldY(lat, Z);
    // Bilinear over the mosaic.
    const x0f = Math.floor(wx - 0.5);
    const y0f = Math.floor(wy - 0.5);
    const fx = wx - 0.5 - x0f;
    const fy = wy - 0.5 - y0f;
    const sample = (wxi: number, wyi: number): number => {
      const tx = Math.floor(wxi / 256);
      const ty = Math.floor(wyi / 256);
      const png = tiles.get(`${tx}/${ty}`);
      if (!png) return 0;
      return terrariumElev(png, wxi - tx * 256, wyi - ty * 256);
    };
    const e00 = sample(x0f, y0f);
    const e10 = sample(x0f + 1, y0f);
    const e01 = sample(x0f, y0f + 1);
    const e11 = sample(x0f + 1, y0f + 1);
    return e00 * (1 - fx) * (1 - fy) + e10 * fx * (1 - fy) + e01 * (1 - fx) * fy + e11 * fx * fy;
  };

  // Elevation grid in output-raster space (one extra ring for the kernel).
  const gw = OUT_W + 2;
  const gh = OUT_H + 2;
  const grid = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const [lon, lat] = invert((i - 1) * SCALE_OUT, (j - 1) * SCALE_OUT);
      grid[j * gw + i] = elevAt(lon, lat);
    }
  }

  console.log('computing hillshade…');
  // Ground size of one output pixel (m). The projector is locally square
  // by construction (lat scaled by 1/cosLat), so one cellsize suffices.
  const cellM = ((111320 * cosLat) / scale) * SCALE_OUT;
  const az = ((360 - SUN_AZIMUTH_DEG + 90) * Math.PI) / 180;
  const alt = (SUN_ALTITUDE_DEG * Math.PI) / 180;

  // Shade field first, then one 3x3 box blur — SRTM speckle is what
  // bloats the PNG, and shaded relief loses nothing to a gentle blur.
  const shadeArr = new Float32Array(OUT_W * OUT_H);
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const g = (i: number, j: number) => grid[(y + 1 + j) * gw + (x + 1 + i)];
      // Horn 1981 kernel
      const dzdx =
        (g(1, -1) + 2 * g(1, 0) + g(1, 1) - (g(-1, -1) + 2 * g(-1, 0) + g(-1, 1))) /
        (8 * cellM) * Z_FACTOR;
      const dzdy =
        (g(-1, 1) + 2 * g(0, 1) + g(1, 1) - (g(-1, -1) + 2 * g(0, -1) + g(1, -1))) /
        (8 * cellM) * Z_FACTOR;
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      const shade =
        Math.sin(alt) * Math.cos(slope) +
        Math.cos(alt) * Math.sin(slope) * Math.cos(az - aspect);
      shadeArr[y * OUT_W + x] = Math.max(0, Math.min(1, shade));
    }
  }
  const blurred = new Float32Array(OUT_W * OUT_H);
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      let sum = 0, n = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const yy = y + j, xx = x + i;
          if (yy < 0 || yy >= OUT_H || xx < 0 || xx >= OUT_W) continue;
          sum += shadeArr[yy * OUT_W + xx];
          n++;
        }
      }
      blurred[y * OUT_W + x] = sum / n;
    }
  }

  const png = new PNG({ width: OUT_W, height: OUT_H });
  const flat = Math.sin(alt);
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const d = blurred[y * OUT_W + x] - flat; // <0 in shadow, >0 sun-lit
      // Shadows carry the relief on a light base; highlights stay gentle.
      const a = d < 0 ? Math.min(0.68, -d * 2.6) : Math.min(0.4, d * 1.1);
      const v = d < 0 ? 26 : 255; // near-black shadow ink / white highlight
      // Coarse alpha steps (16) for PNG compressibility.
      const alpha = Math.round((a * 255) / 16) * 16;
      const idx = (y * OUT_W + x) * 4;
      png.data[idx] = v;
      png.data[idx + 1] = d < 0 ? 32 : 255; // shadow ink leans teal-dark
      png.data[idx + 2] = d < 0 ? 38 : 250;
      png.data[idx + 3] = alpha;
    }
  }

  const out = PNG.sync.write(png); // RGBA — alpha carries the relief
  writeFileSync(OUT_PATH, out);
  console.log(`wrote ${OUT_PATH} (${(out.length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
