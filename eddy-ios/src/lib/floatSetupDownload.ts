import type { LngLat } from '@eddy/geo';
import type { TripPackage } from './tripDownload';
import type { FloatSetup } from './floatStart';
import { startPointDistance } from './floatOrigin';

export const PENDING_FLOAT_DOWNLOAD_KEY = 'eddy:pending-float-download:v1';

/** Tiles belong to these endpoints. Allow ordinary GPS drift at the same launch. */
export function matchesSetupDownload(pkg: TripPackage, draft: FloatSetup, origin?: LngLat | null): boolean {
  if (pkg.route.riverSlug !== draft.riverSlug || pkg.toId !== draft.takeOutId || pkg.fromId !== (draft.putInId ?? '')) return false;
  return draft.putInId ? true : Boolean(pkg.fromLngLat && origin && startPointDistance(pkg.fromLngLat, origin) <= 75);
}


/** Reopen only a durable package, including when the ordinary river cache is gone. */
export async function restoreSetupDownload(raw: string | null, read: (key: string) => Promise<TripPackage | null>) {
  try {
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (typeof saved?.tripKey !== 'string') return null;
    const pkg = await read(saved.tripKey);
    if (!pkg || pkg.tripKey !== saved.tripKey) return null;
    return { pkg, boatType: typeof saved.boatType === 'string' ? saved.boatType : undefined };
  } catch { return null; }
}
