#!/usr/bin/env node
// Run after ./bootstrap.sh web; sharp is already pinned by the web app.
// Keep native image dimensions in points by exporting matching @2x/@3x files.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../../missouri-float-planner/node_modules/sharp');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'eddy-ios/assets/tab-icons');
const iconSize = 28;
const artworkSize = 26;
const icons = [
  { name: 'eddy-canoe', source: 'design/eddy-canoe-tab/source.png' },
  // The shared full-color master supplies the silhouette; native tabs tint it.
  { name: 'eddy-today', source: 'design/eddy-emoji/eddy-today.png', alphaOnly: true },
];

async function buildIcon({ name, source: sourcePath, alphaOnly = false }) {
  const source = path.join(root, sourcePath);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * 4;
      if (data[offset + 3] > 8) {
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      if (alphaOnly) data[offset] = data[offset + 1] = data[offset + 2] = 0;
    }
  }
  if (right < left) throw new Error(`${name}: source has no visible artwork`);
  const aspect = (right - left + 1) / (bottom - top + 1);
  if (aspect > 1.2 || aspect < 0.85) {
    throw new Error(`${name}: use compact, near-square artwork for the tab; do not stretch an illustration to fit`);
  }
  const image = alphaOnly
    ? sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    : sharp(source);
  const art = await image
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png().toBuffer();
  for (const scale of [1, 2, 3]) {
    const filename = `${name}${scale === 1 ? '' : `@${scale}x`}.png`;
    // Preserve facial details and gaps between the sun, rays, and river bands
    // as transparent cutouts, so template tinting works in every appearance.
    const glyph = await sharp(art)
      .resize(artworkSize * scale, artworkSize * scale, { fit: 'contain', background: '#00000000' })
      .toBuffer();
    await sharp({ create: { width: iconSize * scale, height: iconSize * scale, channels: 4, background: '#00000000' } })
      .composite([{ input: glyph, gravity: 'centre' }])
      .png({ compressionLevel: 9 }).toFile(path.join(output, filename));
    console.log(`${filename}: ${iconSize * scale} x ${iconSize * scale}`);
  }
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  for (const icon of icons) await buildIcon(icon);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
