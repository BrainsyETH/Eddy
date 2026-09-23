// Exact-site media stays outside availability so it cannot delay site counts.
// New clients use Recreation.gov's media service; legacy clients retain RIDB
// ENTITYMEDIA (contract: https://ridb.recreation.gov/shared/swagger/ridb.yaml).
export interface CampsitePhoto {
  source?: 'Recreation.gov' | 'Missouri State Parks';
  url: string;
  title: string | null;
  credit: string | null;
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue : null;
const caption = (value: unknown): string | null =>
  typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim().slice(0, 1000) || null : null;

/** Recreation.gov's public website media service, not RIDB's embedded media. */
export function recreationSitePhotos(payload: unknown, siteId: string): CampsitePhoto[] {
  const items = record(payload)?.result;
  if (!Array.isArray(items)) throw new Error('Invalid Recreation.gov media response');
  const seen = new Set<string>();
  const photos: CampsitePhoto[] = [];
  const ordered = [...items].sort((a, b) =>
    Number(record(b)?.is_primary === true) - Number(record(a)?.is_primary === true) ||
    Number(record(a)?.position ?? 0) - Number(record(b)?.position ?? 0));
  for (const item of ordered) {
    const media = record(item);
    if (!media || media.entity_type !== 'campsite' || String(media.entity_id) !== siteId ||
        media.is_public !== true || media.is_deactivated === true || media.is_virtual_tour === true ||
        typeof media.mime_type !== 'string' || !/^image\/(jpeg|png|webp)$/i.test(media.mime_type) ||
        typeof media.url !== 'string') continue;
    let url: URL;
    try { url = new URL(media.url); } catch { continue; }
    if (url.protocol !== 'https:' || url.hostname !== 'cdn.recreation.gov' || url.port ||
        url.username || url.password || seen.has(url.href)) continue;
    seen.add(url.href);
    photos.push({ url: url.href, title: caption(media.title) ?? caption(media.description),
      credit: caption(media.credits), source: 'Recreation.gov' });
    if (photos.length === 8) break;
  }
  return photos;
}

/** One rendered site per request; failures must not become cached empty galleries. */
export async function fetchRecreationSitePhotos(siteId: string, request: typeof fetch = fetch): Promise<CampsitePhoto[]> {
  if (!/^\d+$/.test(siteId)) throw new Error('Invalid Recreation.gov campsite');
  const response = await request(`https://www.recreation.gov/api/media/public/campsite/${siteId}`, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000), next: { revalidate: 86400 },
  });
  if (!response.ok) throw new Error(`Recreation.gov media status ${response.status}`);
  return recreationSitePhotos(await response.json(), siteId);
}

export function campsitePhotos(value: unknown, siteId: string): CampsitePhoto[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const photos: CampsitePhoto[] = [];
  for (const item of [...value].sort((a, b) => Number(record(b)?.IsPrimary === true) - Number(record(a)?.IsPrimary === true))) {
    const media = record(item);
    if (!media || media.MediaType !== 'Image' || media.EntityType !== 'Site' ||
        String(media.EntityID) !== siteId || typeof media.URL !== 'string') continue;
    let url: URL;
    try { url = new URL(media.URL); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || seen.has(url.href)) continue;
    seen.add(url.href);
    photos.push({ url: url.href, title: caption(media.Title), credit: caption(media.Credits) });
    if (photos.length === 8) break;
  }
  return photos;
}

/** Cached provider pages, including empty media. Errors are not an empty success. */
export async function fetchFacilityPhotos(
  facilityId: string,
  apiKey: string,
  request: typeof fetch = fetch,
): Promise<Record<string, CampsitePhoto[]>> {
  if (!/^\d+$/.test(facilityId)) throw new Error('Invalid RIDB facility');
  const result: Record<string, CampsitePhoto[]> = {};
  // Bounded work for a malformed upstream; tracked facilities are much smaller.
  for (let offset = 0; offset < 2000; offset += 100) {
    const response = await request(
      `https://ridb.recreation.gov/api/v1/facilities/${facilityId}/campsites?limit=100&offset=${offset}`,
      { headers: { apikey: apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } },
    );
    if (!response.ok) throw new Error(`RIDB media status ${response.status}`);
    const body = record(await response.json());
    if (!Array.isArray(body?.RECDATA)) throw new Error('Invalid RIDB media response');
    for (const value of body.RECDATA) {
      const site = record(value);
      if (!site || String(site.FacilityID) !== facilityId || typeof site.CampsiteID !== 'string') continue;
      const photos = campsitePhotos(site.ENTITYMEDIA, site.CampsiteID);
      if (photos.length) result[site.CampsiteID] = photos;
    }
    if (body.RECDATA.length < 100) return result;
  }
  throw new Error('RIDB media pagination limit exceeded');
}
