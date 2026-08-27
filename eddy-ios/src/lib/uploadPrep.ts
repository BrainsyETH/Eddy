export const UPLOAD_SAFE_BYTES = Math.floor(3.5 * 1024 * 1024);

export type UploadMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface UploadPreparation {
  /**
   * True when the photo needs the shrinking ladder — oversize, unmeasurable,
   * or an unsupported format. False no longer means the original bytes are
   * uploaded: EVERY photo is re-drawn before upload so the camera's own EXIF
   * (a GPS tag, on most phones) never crosses the wire; false only means the
   * re-draw keeps the original dimensions and format. See prepareUpload in
   * PhotoSubmitSheet.
   */
  reencode: boolean;
  name: string;
  type: UploadMime;
}

function supportedMime(value: string | null | undefined): UploadMime | null {
  const normalized = value?.toLowerCase();
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp') {
    return normalized;
  }
  return null;
}

export function uploadPreparation(asset: {
  fileSize?: number | null;
  mimeType?: string | null;
}): UploadPreparation {
  const mime = supportedMime(asset.mimeType);
  const sizeKnownAndSafe = typeof asset.fileSize === 'number' && asset.fileSize <= UPLOAD_SAFE_BYTES;

  if (!mime || !sizeKnownAndSafe) {
    return { reencode: true, name: 'river-photo.jpg', type: 'image/jpeg' };
  }

  const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return { reencode: false, name: `river-photo.${extension}`, type: mime };
}
