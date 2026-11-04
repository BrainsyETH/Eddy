#!/usr/bin/env npx tsx
/**
 * Build public/display/<board>/relief.jpg — the shaded-relief base under a
 * home-base river board's map (/embed/board/<id>).
 *
 * Same source and method as scripts/build-mo-hillshade.ts: AWS Terrain Tiles
 * (terrarium encoding, SRTM-derived, public domain), fetched once here so the
 * board never downloads elevation at runtime. The raster is rendered in the
 * board's own map frame (HOME_BASES[id].map in src/lib/display/home-base.ts),
 * so it drops under the SVG at 0,0 and lines up with the river geometry.
 *
 * Unlike the statewide hillshade, the board's map is always drawn on the same
 * paper, so the relief is composited onto that paper here and shipped as a
 * small opaque JPEG instead of a large alpha PNG.
 *
 * Run:   npx tsx scripts/build-board-relief.ts pine-valley
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { HOME_BASES, unproject } from '../src/lib/display/home-base';

const Z = 10;
const SCALE = 1.5; // render above the 978px frame so it stays crisp on 4K panels
const TILE_BASE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const CACHE_DIR = join(process.cwd(), '.terrain-tile-cache');
const SUN_AZIMUTH_DEG = 315;
const SUN_ALTITUDE_DEG = 45;
const Z_FACTOR = 6;
const PAPER = [0xf4, 0xef, 0xe7]; // Secondary-100, the board's map paper
const SHADOW = [0x2d, 0x2a, 0x24]; // Neutral-900

const id = process.argv[2] ?? 'pine-valley';
const board = HOME_BASES[id];
if (!board) throw new Error(`Unknown board "${id}". Known: ${Object.keys(HOME_BASES).join(', ')}`);

const N = 2 ** Z;
const tileX = (lng: number) => ((lng + 180) / 360) * N;
const tileY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N;
};

async function tile(x: number, y: number): Promise<Float64Array> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, `${Z}_${x}_${y}.png`);
  if (!existsSync(path)) {
    const res = await fetch(`${TILE_BASE}/${Z}/${x}/${y}.png`);
    if (!res.ok) throw new Error(`Tile ${Z}/${x}/${y}: HTTP ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const { data, info } = await sharp(readFileSync(path)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = new Float64Array(info.width * info.height);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 3] * 256 + data[i * 3 + 1] + data[i * 3 + 2] / 256 - 32768;
  return out;
}

async function main() {
  const { map } = board;
  const nw = unproject(map, 0, 0);
  const se = unproject(map, map.width, map.height);
  const x0 = Math.floor(tileX(nw.lng)), x1 = Math.floor(tileX(se.lng));
  const y0 = Math.floor(tileY(nw.lat)), y1 = Math.floor(tileY(se.lat));
  const cols = x1 - x0 + 1, rows = y1 - y0 + 1, mw = cols * 256;
  const mosaic = new Float64Array(mw * rows * 256);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = await tile(tx, ty);
      for (let r = 0; r < 256; r++) mosaic.set(t.subarray(r * 256, r * 256 + 256), ((ty - y0) * 256 + r) * mw + (tx - x0) * 256);
    }
  }
  const mh = rows * 256;
  const sample = (px: number, py: number) => {
    const ix = Math.min(Math.max(Math.floor(px), 0), mw - 2), iy = Math.min(Math.max(Math.floor(py), 0), mh - 2);
    const fx = px - ix, fy = py - iy;
    const v = mosaic[iy * mw + ix] * (1 - fx) * (1 - fy) + mosaic[iy * mw + ix + 1] * fx * (1 - fy)
      + mosaic[(iy + 1) * mw + ix] * (1 - fx) * fy + mosaic[(iy + 1) * mw + ix + 1] * fx * fy;
    return Math.min(Math.max(v, 60), 600); // clip voids and outliers; Ozark relief sits inside this band
  };

  const ow = Math.round(map.width * SCALE), oh = Math.round(map.height * SCALE);
  const dem = new Float64Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const { lng, lat } = unproject(map, (x + 0.5) / SCALE, (y + 0.5) / SCALE);
      dem[y * ow + x] = sample((tileX(lng) - x0) * 256, (tileY(lat) - y0) * 256);
    }
  }
  const metresPerPixel = (1 / (map.scale * SCALE)) * 111_320;
  const az = (SUN_AZIMUTH_DEG * Math.PI) / 180, alt = (SUN_ALTITUDE_DEG * Math.PI) / 180, flat = Math.sin(alt);
  const rgb = Buffer.alloc(ow * oh * 3);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const at = (xx: number, yy: number) => dem[Math.min(Math.max(yy, 0), oh - 1) * ow + Math.min(Math.max(xx, 0), ow - 1)];
      const dzdx = ((at(x + 1, y) - at(x - 1, y)) / (2 * metresPerPixel)) * Z_FACTOR;
      const dzdy = ((at(x, y + 1) - at(x, y - 1)) / (2 * metresPerPixel)) * Z_FACTOR;
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(-dzdx, dzdy);
      const d = Math.sin(alt) * Math.cos(slope) + Math.cos(alt) * Math.sin(slope) * Math.cos(az - aspect) - flat;
      const [tone, a] = d < 0 ? [SHADOW, Math.min(1, -d * 1.6) * 0.55] : [[255, 255, 255], Math.min(1, d * 1.6) * 0.5];
      for (let c = 0; c < 3; c++) rgb[(y * ow + x) * 3 + c] = Math.round(PAPER[c] * (1 - a) + tone[c] * a);
    }
  }
  const outDir = join(process.cwd(), 'public', 'display', id);
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, 'relief.jpg');
  await sharp(rgb, { raw: { width: ow, height: oh, channels: 3 } }).jpeg({ quality: 78, mozjpeg: true }).toFile(out);
  console.log(`Wrote ${out} (${ow}x${oh}) from ${cols * rows} terrain tiles`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
