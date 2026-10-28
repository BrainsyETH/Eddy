/** Web projection of the same /api/favorite-floats?v=2 response used by iOS.
 * Keep shippable web code inside the Vercel root; parity is checked in tests. */
export interface FeaturedFloat {
  id: string;
  riverSlug: string;
  riverName: string;
  putInId: string;
  putInName: string;
  takeOutId: string;
  takeOutName: string;
  distanceMiles: number;
  durationFormatted?: string | null;
  durationUnavailableReason?: string | null;
  difficulty: string;
  tagline: string;
  photoUrl: string | null;
  photoFallbackUrls?: string[];
}

/** Same local-calendar daily rotation as eddy-ios/src/lib/todayFloats.ts. */
export function featuredFloatsForDay<T extends { id: string }>(floats: T[], date = new Date()): T[] {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const rank = (id: string) => {
    let hash = 2166136261;
    const value = `${day}:${id}`;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  return [...floats].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

export function featuredFloatPath(float: Pick<FeaturedFloat, 'riverSlug' | 'putInId' | 'takeOutId'>): string {
  const query = new URLSearchParams({ river: float.riverSlug, putIn: float.putInId, takeOut: float.takeOutId });
  return `/plan?${query}`;
}
