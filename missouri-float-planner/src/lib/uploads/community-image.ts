import sharp from 'sharp';

export const MAX_COMMUNITY_IMAGE_PIXELS = 40_000_000;
export const MAX_COMMUNITY_IMAGE_DIMENSION = 2400;

/**
 * Decode and re-encode community media before it reaches public storage.
 * Sharp strips EXIF/XMP/IPTC metadata unless `withMetadata()` is requested;
 * rotation is applied first so orientation is preserved without the EXIF tag.
 */
export async function normalizeCommunityImage(input: Buffer): Promise<Buffer> {
  const image = sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_COMMUNITY_IMAGE_PIXELS,
    animated: false,
  });

  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Image dimensions are unavailable');
  }
  if (metadata.width * metadata.height > MAX_COMMUNITY_IMAGE_PIXELS) {
    throw new Error('Image dimensions exceed the safety limit');
  }

  return image
    .rotate()
    .resize({
      width: MAX_COMMUNITY_IMAGE_DIMENSION,
      height: MAX_COMMUNITY_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85, effort: 4 })
    .toBuffer();
}
