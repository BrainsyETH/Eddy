// RIDB's campsite schema embeds ENTITYMEDIA, keyed to the exact Site.
// Contract: https://ridb.recreation.gov/shared/swagger/ridb.yaml
// Kept outside availability: slow/missing media must never delay site counts.
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
