#!/usr/bin/env node
// Run after ./bootstrap.sh web; sharp is already pinned by the web app.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../../missouri-float-planner/node_modules/sharp');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'eddy-ios/assets/float-action-icons');
const iconSize = 40;
const icons = [
  ['start-float', 38],
  ['build-route', 38],
  // The simple ring has more visual weight than the detailed Eddy artwork.
  ['find-route', 32],
];

async function main() {
  await fs.mkdir(output, { recursive: true });
  for (const [name, artworkSize] of icons) {
    const source = path.join(root, `design/float-action-icons/${name}-source.png`);
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, top = info.height, right = -1, bottom = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * 4;
        if (data[offset + 3] > 8) {
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
        // Only alpha is used at runtime. Never flatten the smile, glasses,
        // map, or lens against a light/dark background.
        data[offset] = data[offset + 1] = data[offset + 2] = 0;
      }
    }
    if (right < left) throw new Error(`${name}: source has no visible artwork`);
    const art = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
      .png().toBuffer();
    for (const scale of [1, 2, 3]) {
      const filename = `${name}${scale === 1 ? '' : `@${scale}x`}.png`;
      const glyph = await sharp(art)
        .resize(artworkSize * scale, artworkSize * scale, { fit: 'contain', background: '#00000000' })
        .toBuffer();
      await sharp({ create: { width: iconSize * scale, height: iconSize * scale, channels: 4, background: '#00000000' } })
        .composite([{ input: glyph, gravity: 'centre' }])
        .png({ compressionLevel: 9 }).toFile(path.join(output, filename));
      console.log(`${filename}: ${iconSize * scale} x ${iconSize * scale}`);
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
