import type { FloatSearchOption } from '@shared/float-search';
import { loadCampgroundEnrichment } from '@/lib/access-points/campground-enrichment';
import { withReviewedPlacePhoto } from '@/lib/photos/reviewed';
import { checked, type Access, type Db } from './data';

type Photo = NonNullable<FloatSearchOption['photo']>;
type AccessPhotos = Map<string, Photo[]>;

/** Use the same access-point photos as the map, with optional verified reports. */
export async function loadRoutePhotos(db: Db, endpoints: Access[], signal: AbortSignal): Promise<AccessPhotos> {
  const points = [...new Map(endpoints.map(point => [point.id, point])).values()];
  const photos: AccessPhotos = new Map(points.map(point => [
    point.id,
    (withReviewedPlacePhoto('access_points', point).image_urls ?? [])
      .filter(url => /^https:\/\//.test(url))
      .map(url => ({ url, caption: point.name })),
  ]));
  if (!points.length || signal.aborted) return photos;

  const campgroundIds = [...new Set(points.flatMap(point =>
    !photos.get(point.id)?.length && point.nps_campground_id ? [point.nps_campground_id] : [],
  ))];
  // Each source is optional. A failed report lookup must not discard a place's
  // own photos, and a missing campground must not hide verified reports.
  const [campgrounds, reports] = await Promise.all([
    loadCampgroundEnrichment(db, campgroundIds, true),
    (async () => {
      try {
        return checked(await db.from('community_reports')
          .select('access_point_id, image_url, captured_at')
          .in('access_point_id', points.map(point => point.id))
          .eq('type', 'river_visual').eq('status', 'verified')
          .not('image_url', 'is', null)
          .order('created_at', { ascending: false }).limit(100), 'route photos') ?? [];
      } catch {
        return [];
      }
    })(),
  ]);
  for (const point of points) {
    const direct = photos.get(point.id) ?? [];
    const images = point.nps_campground_id ? campgrounds.get(point.nps_campground_id)?.images : [];
    const campground = Array.isArray(images) ? images
      .filter(image => typeof image?.url === 'string' && /^https:\/\//.test(image.url))
      .map(image => ({ url: image.url, caption: point.name })) : [];
    const community = reports.flatMap(report => {
      if (report.access_point_id !== point.id || !report.image_url || !/^https:\/\//.test(report.image_url)) return [];
      const captured = report.captured_at ? new Date(report.captured_at) : null;
      const label = captured && Number.isFinite(captured.getTime())
        ? `Photo ${captured.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}`
        : 'Community photo';
      return [{ url: report.image_url, caption: `${point.name} · ${label}` }];
    });
    photos.set(point.id, [...(direct.length ? direct : campground), ...community]);
  }
  return photos;
}

/** Vary cards where possible, using only photos of that float's own endpoints. */
export function assignRoutePhotos(options: FloatSearchOption[], photos: AccessPhotos): void {
  const used = new Set<string>();
  for (const option of options) {
    const choices = [...(photos.get(option.putIn.id) ?? []), ...(photos.get(option.takeOut.id) ?? [])];
    const photo = choices.find(choice => !used.has(choice.url)) ?? choices[0];
    if (photo) {
      option.photo = photo;
      used.add(photo.url);
    }
  }
}
