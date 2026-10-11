#!/usr/bin/env node
// Run after ./bootstrap.sh web; sharp is already pinned by the web app.
// Keep native image dimensions in points by exporting matching @2x/@3x files.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../../missouri-float-planner/node_modules/sharp');

const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'design/eddy-canoe-tab/source.png');
const output = path.join(root, 'eddy-ios/assets/tab-icons');
const iconSize = 28;
const artworkSize = 26;

async function main() {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left) throw new Error('The canoe source has no visible artwork');
  const aspect = (right - left + 1) / (bottom - top + 1);
  if (aspect > 1.2 || aspect < 0.85) {
    throw new Error('Use compact, near-square canoe artwork for the tab; do not stretch a wide illustration to fit');
  }
  const art = await sharp(source)
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png().toBuffer();
  await fs.mkdir(output, { recursive: true });
  for (const scale of [1, 2, 3]) {
    const name = `eddy-canoe${scale === 1 ? '' : `@${scale}x`}.png`;
    // The smile and glasses stay transparent: template tinting must never
    // flatten them against a particular theme's background.
    const glyph = await sharp(art)
      .resize(artworkSize * scale, artworkSize * scale, { fit: 'contain', background: '#00000000' })
      .toBuffer();
    await sharp({ create: { width: iconSize * scale, height: iconSize * scale, channels: 4, background: '#00000000' } })
      .composite([{ input: glyph, gravity: 'centre' }])
      .png({ compressionLevel: 9 }).toFile(path.join(output, name));
    console.log(`${name}: ${iconSize * scale} x ${iconSize * scale}`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
