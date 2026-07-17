// src/lib/social/favorite-floats.ts
//
// "Eddy's Favorite Floats" — the editorial cousin of the Float of the Day.
// Where the Float of the Day picks an algorithmic put-in→take-out pair gated on
// live conditions, a Favorite Float is a HAND-CURATED section lifted straight
// from the river-guide blogs (blog_posts.guide_data.sections). Every guide
// section is editor-written, so the whole set is the candidate pool; if any
// section is explicitly flagged `eddy_favorite`, the pool narrows to those.
//
// Favorites are evergreen — they post year-round regardless of the gauge — so
// this module never touches eddy_updates / live conditions. It resolves each
// section's from_slug / to_slug to real access points (for mile markers, the
// same source the planner + Float of the Day use) and returns the exact same
// `Section` shape the RouteDraw reel already consumes, plus the editorial extras
// (tagline, "best for", difficulty) that make it read as a recommendation.

import type { GuideData } from '@/types/blog';
import { dayIndex, springsForRun, type Section } from './section-picker';
import { toNum } from '@/lib/utils/num';
import { riverDisplayLong } from './river-display';

/** A curated favorite float: the route geometry RouteDraw needs + editorial copy. */
export interface FavoriteFloat extends Section {
  /** Guide section's catchy name, e.g. "The bluff-and-cave middle". */
  tagline: string;
  /** Guide "Best for" audience line, e.g. "Everyone — the best of the Meramec". */
  bestFor: string;
  /** Difficulty class from the guide (raw, e.g. "I–II"). */
  difficulty: string;
  /** best_for_tags from the guide (lowercase slugs). */
  bestForTags: string[];
  /** Access-point slugs for the endpoints — let the cover image rebuild the
   *  EXACT same float (mirrors how Float of the Day bakes the section into the
   *  OG URL so the reel and its poster never diverge). */
  fromSlug: string;
  toSlug: string;
  /** Source guide's blog slug (deep-link target for the caption). */
  postSlug: string;
  /** Guide section's hero photo (public URL), composited behind the reel + OG
   *  cover. Optional — sections without a photo fall back to the solid bg. */
  photoUrl?: string;
}

interface GuideRow {
  slug: string;
  river_slug: string | null;
  guide_data: GuideData | null;
}

interface ApRow {
  slug: string;
  name: string;
  river_mile_downstream: number | null;
  type: string | null;
  types: string[] | null;
  river_id: string;
}

const cleanName = (s: string): string => (s || '').trim().replace(/\s+/g, ' ');
const isCampground = (ap: ApRow): boolean =>
  ap.type === 'campground' || (Array.isArray(ap.types) && ap.types.includes('campground'));

/**
 * Load every published river guide and flatten its sections into a pool of
 * resolvable FavoriteFloats. A section qualifies only when both endpoints have
 * an access-point slug we can resolve to a downstream mile (so the route + float
 * time are real). Stable order (river slug, then section id) keeps the daily
 * rotation deterministic regardless of DB row order.
 */
async function loadFavoritePool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<FavoriteFloat[]> {
  const { data: guides, error: guidesError } = await supabase
    .from('blog_posts')
    .select('slug, river_slug, guide_data')
    .eq('category', 'River Guides')
    .eq('status', 'published')
    .not('guide_data', 'is', null);

  if (guidesError || !guides) {
    if (guidesError) console.error('[FavoriteFloats] guide query failed:', guidesError.message);
    return [];
  }

  // Map river slug → id (access_points key off river_id, guides off river_slug).
  const riverSlugs = Array.from(
    new Set((guides as GuideRow[]).map((g) => g.river_slug).filter((s): s is string => !!s)),
  );
  if (riverSlugs.length === 0) return [];

  const { data: riverRows } = await supabase
    .from('rivers')
    .select('id, slug, name')
    .in('slug', riverSlugs);
  const riverIdBySlug = new Map<string, string>();
  const riverNameBySlug = new Map<string, string>();
  for (const r of (riverRows || []) as { id: string; slug: string; name: string }[]) {
    riverIdBySlug.set(r.slug, r.id);
    riverNameBySlug.set(r.slug, r.name);
  }

  // Resolve every endpoint slug across all guides in one access_points query.
  const riverIds = Array.from(riverIdBySlug.values());
  if (riverIds.length === 0) return [];
  const wantedSlugs = new Set<string>();
  for (const g of guides as GuideRow[]) {
    for (const s of g.guide_data?.sections || []) {
      if (s.from_slug) wantedSlugs.add(s.from_slug);
      if (s.to_slug) wantedSlugs.add(s.to_slug);
    }
  }
  if (wantedSlugs.size === 0) return [];

  const { data: apRows } = await supabase
    .from('access_points')
    .select('slug, name, river_mile_downstream, type, types, river_id')
    .in('river_id', riverIds)
    .in('slug', Array.from(wantedSlugs))
    .not('river_mile_downstream', 'is', null);

  // Key by river_id + slug (slugs aren't guaranteed unique across rivers).
  const apByKey = new Map<string, ApRow>();
  for (const ap of (apRows || []) as ApRow[]) {
    apByKey.set(`${ap.river_id}::${ap.slug}`, ap);
  }

  const anyFlagged = (guides as GuideRow[]).some((g) =>
    (g.guide_data?.sections || []).some((s) => s.eddy_favorite === true),
  );

  const pool: FavoriteFloat[] = [];
  for (const guide of guides as GuideRow[]) {
    const riverSlug = guide.river_slug;
    if (!riverSlug) continue;
    const riverId = riverIdBySlug.get(riverSlug);
    if (!riverId) continue;
    const riverName = riverNameBySlug.get(riverSlug) || riverDisplayLong(riverSlug);

    for (const section of guide.guide_data?.sections || []) {
      // When favorites are flagged anywhere, only flagged sections qualify.
      if (anyFlagged && section.eddy_favorite !== true) continue;
      if (!section.from_slug || !section.to_slug) continue;
      const a = apByKey.get(`${riverId}::${section.from_slug}`);
      const b = apByKey.get(`${riverId}::${section.to_slug}`);
      if (!a || !b) continue;
      const aMile = toNum(a.river_mile_downstream);
      const bMile = toNum(b.river_mile_downstream);
      if (aMile == null || bMile == null) continue;

      // Put-in is upstream (smaller downstream mile); keep geometry correct even
      // if a guide lists the endpoints out of order.
      const putInFirst = aMile <= bMile;
      const putIn = putInFirst ? a : b;
      const takeOut = putInFirst ? b : a;
      const putInMile = putInFirst ? aMile : bMile;
      const takeOutMile = putInFirst ? bMile : aMile;
      const distanceMi = Math.round((takeOutMile - putInMile) * 10) / 10;
      if (distanceMi < 0.5) continue;

      pool.push({
        riverSlug,
        riverName,
        putInName: cleanName(putIn.name),
        putInMile,
        takeOutName: cleanName(takeOut.name),
        takeOutMile,
        distanceMi,
        hoursCanoe: Math.round((distanceMi / 2) * 10) / 10,
        putInDescription: '',
        takeOutDescription: '',
        putInCamping: isCampground(putIn),
        takeOutCamping: isCampground(takeOut),
        springs: springsForRun(riverSlug, putInMile, takeOutMile),
        tagline: cleanName(section.name),
        bestFor: cleanName(section.best),
        difficulty: section.diff,
        bestForTags: section.best_for_tags || [],
        fromSlug: putIn.slug,
        toSlug: takeOut.slug,
        postSlug: guide.slug,
        photoUrl: section.photo ?? undefined,
      });
    }
  }

  pool.sort((x, y) =>
    x.riverSlug === y.riverSlug
      ? x.putInMile - y.putInMile
      : x.riverSlug.localeCompare(y.riverSlug),
  );
  return pool;
}

/**
 * Pick the favorite float to feature, rotating deterministically by day (same
 * answer all day, same clock as Float of the Day). Returns null when no guide
 * section resolves to a real route.
 */
export async function pickFavoriteFloat(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  date = new Date(),
): Promise<FavoriteFloat | null> {
  const pool = await loadFavoritePool(supabase);
  if (pool.length === 0) return null;
  return pool[dayIndex(date) % pool.length];
}

/**
 * Resolve a specific favorite by its river + endpoint slugs — used by the OG
 * cover so the poster renders the EXACT float the reel did (the URL bakes the
 * identity; we don't re-pick, which could diverge across a midnight rollover).
 */
export async function findFavoriteFloat(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  riverSlug: string,
  fromSlug: string,
  toSlug: string,
): Promise<FavoriteFloat | null> {
  const pool = await loadFavoritePool(supabase);
  return (
    pool.find(
      (f) =>
        f.riverSlug === riverSlug &&
        ((f.fromSlug === fromSlug && f.toSlug === toSlug) ||
          (f.fromSlug === toSlug && f.toSlug === fromSlug)),
    ) || null
  );
}
