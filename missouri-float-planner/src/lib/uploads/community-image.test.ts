import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { normalizeCommunityImage } from './community-image';

test('community photos are re-encoded without EXIF metadata', async () => {
  const input = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: '#2D7889',
    },
  })
    .withExif({ IFD0: { Copyright: 'private-device-metadata' } })
    .jpeg()
    .toBuffer();

  assert.ok((await sharp(input).metadata()).exif);

  const output = await normalizeCommunityImage(input);
  const metadata = await sharp(output).metadata();

  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.width, 32);
  assert.equal(metadata.height, 24);
});

test('community photos are bounded to the public display dimension', async () => {
  const input = await sharp({
    create: {
      width: 3000,
      height: 1500,
      channels: 3,
      background: '#F07052',
    },
  }).png().toBuffer();

  const metadata = await sharp(await normalizeCommunityImage(input)).metadata();
  assert.equal(metadata.width, 2400);
  assert.equal(metadata.height, 1200);
});
