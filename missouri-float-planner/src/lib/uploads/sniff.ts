// src/lib/uploads/sniff.ts
// What a file IS, read from its first bytes.
//
// The browser-supplied `file.type` and the filename are both chosen by the
// uploader. Trusting them let `page.html` claimed as image/png land in public
// storage under a .html name. The stored extension and Content-Type now come
// from the bytes, and a file whose bytes are not an allowed format is refused.

export interface SniffedType {
  mime: string;
  ext: string;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, i) => bytes[i] === byte);
}

/** JPEG, PNG, GIF or WebP — nothing else (notably not SVG, which is script-capable). */
export function sniffImage(bytes: Uint8Array): SniffedType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png' };
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** MP4 / QuickTime (ISO base media `ftyp` box) or WebM / Matroska (EBML). */
export function sniffVideo(bytes: Uint8Array): SniffedType | null {
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    return ascii(bytes, 8, 4).startsWith('qt')
      ? { mime: 'video/quicktime', ext: 'mov' }
      : { mime: 'video/mp4', ext: 'mp4' };
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: 'video/webm', ext: 'webm' };
  return null;
}

/** A filename stem with nothing but letters, digits, dash and underscore. */
export function safeStem(filename: string): string {
  const stem = filename.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return stem.slice(0, 60) || 'file';
}
