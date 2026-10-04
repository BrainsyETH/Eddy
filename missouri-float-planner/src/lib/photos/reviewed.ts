import catalog from '../../data/reviewed-place-photos.json';
import { parseJsonish, parseNpsImages } from '../services/npsCampground';

export type PhotoTable = 'access_points' | 'points_of_interest' | 'nearby_services';
export interface ReviewedPhoto {
  table: PhotoTable;
  id: string;
  name: string;
  image: {
    url: string; title: string; altText: string; caption: string; credit: string;
    sourceUrl: string; license: string; licenseUrl: string;
  };
}
export const reviewedPhotos = catalog as ReviewedPhoto[];
export interface PhotoRow {
  id: string;
  name: string;
  updated_at: string | null;
  image_urls?: string[] | null;
  images?: unknown;
  details?: unknown;
}

/** Exact identities only; an existing photo is never replaced by a backfill. */
export function reviewedPhotoPatch(entry: ReviewedPhoto, row: PhotoRow): Record<string, unknown> | null {
  if (row.id !== entry.id || row.name !== entry.name) throw new Error(`Photo identity changed: ${entry.name}`);
  for (const value of [entry.image.url, entry.image.sourceUrl, entry.image.licenseUrl]) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error(`Unsafe photo URL: ${entry.name}`);
  }
  if (!entry.image.credit || !entry.image.license) throw new Error(`Missing attribution: ${entry.name}`);
  if (entry.table === 'access_points') {
    return row.image_urls?.length ? null : { image_urls: [entry.image.url] };
  }
  if (entry.table === 'points_of_interest') {
    const current = parseJsonish<unknown>(row.images);
    if (row.images != null && !Array.isArray(current)) throw new Error(`Invalid image record: ${entry.name}`);
    return Array.isArray(current) && current.length ? null : { images: [entry.image] };
  }
  const parsedDetails = parseJsonish<Record<string, unknown>>(row.details);
  if (row.details != null && parsedDetails == null) throw new Error(`Invalid service details: ${entry.name}`);
  const details = parsedDetails ?? {};
  if (typeof details !== 'object' || Array.isArray(details)) throw new Error(`Invalid service details: ${entry.name}`);
  if (details.images != null) {
    const images = parseJsonish<unknown>(details.images);
    if (!Array.isArray(images)) throw new Error(`Invalid service images: ${entry.name}`);
    if (images.length) return null;
  }
  return { details: { ...details, images: [entry.image] } };
}

export function rowHasReviewedPhoto(entry: ReviewedPhoto, row: PhotoRow): boolean {
  if (entry.table === 'access_points') return row.image_urls?.includes(entry.image.url) ?? false;
  const raw = entry.table === 'points_of_interest'
    ? row.images : parseJsonish<Record<string, unknown>>(row.details)?.images;
  return parseNpsImages(raw).some(image => image.url === entry.image.url);
}
