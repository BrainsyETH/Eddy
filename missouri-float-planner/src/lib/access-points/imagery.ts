// src/lib/access-points/imagery.ts
// Agency-keyed imagery resolver for access points.
//
// Given an access point's managing agency + official site URL + coordinates,
// resolve a hot-linkable photo URL from the authoritative source for that
// agency — WITHOUT any manual upload or self-hosting:
//
//   MDC / Municipal (mdc.mo.gov) → page og:image (real per-access photos)
//   NPS                          → NPS Data API place/campground match by name+coords
//   COE / USFS (recreation.gov)  → RIDB /facilities/{id}/media (cdn.recreation.gov)
//   USFS (fs.usda.gov)           → page og:image
//   State Park / Private / other → page og:image of the official site
//
// All sources return an external URL that is stored verbatim in
// access_points.image_urls and rendered via <AccessPointPhoto> (a plain <img>,
// so arbitrary hosts render without next/image whitelisting). Federal/state
// government imagery is public-record; a credit string is returned for logging.

import { fetchNPSPlaces, fetchNPSCampgrounds } from '@/lib/nps/client';
import { fetchFacilityMedia } from '@/lib/usfs/ridb';

/** Minimal shape shared by NPS place images and campground images. */
interface NpsImage {
  url: string;
  credit?: string | null;
  altText?: string | null;
  caption?: string | null;
}

export interface ResolvableAccessPoint {
  id: string;
  name: string;
  managingAgency: string | null;
  officialSiteUrl: string | null;
  lat: number | null;
  lng: number | null;
}

export interface ResolvedImage {
  url: string;
  /** Which resolver produced it: mdc | nps | ridb | usfs | state-park | private */
  source: string;
  credit: string | null;
  altText: string | null;
}

export type ResolveStatus = 'resolved' | 'no-match' | 'error';

export interface ResolveResult {
  accessPointId: string;
  name: string;
  status: ResolveStatus;
  image: ResolvedImage | null;
  /** Human-readable note on how it was resolved or why it was skipped. */
  detail: string;
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 15_000;

// URLs that are placeholders / chrome rather than real subject photos.
const PLACEHOLDER_PATTERNS =
  /(facebookog|twittercard|placeholder|default[-_.]|no[-_]?image|sprite|favicon|logo|\/assets\/|\/static\/|blank)/i;

// ─────────────────────────────────────────────────────────────
// Low-level fetch + Open Graph extraction
// ─────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        // A real browser UA is required — several sources (notably MDC) sit
        // behind a WAF that 403s non-browser agents and throttles bursts.
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#0?34;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Return the `content` of the first <meta> whose property/name matches a key. */
function metaContent(html: string, keys: string[]): string | null {
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  for (const key of keys) {
    for (const tag of metas) {
      const prop = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
      if (prop !== key) continue;
      const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
      if (content && content.trim()) return decodeEntities(content.trim());
    }
  }
  return null;
}

function isUsableImageUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (PLACEHOLDER_PATTERNS.test(url)) return false;
  if (/\.svg(\?|$)/i.test(url)) return false;
  return true;
}

/** Resolve an og:image (+ alt) from an HTML page. */
async function resolveOgImage(
  pageUrl: string,
  source: string,
  credit: string | null,
): Promise<ResolvedImage | null> {
  const html = await fetchHtml(pageUrl);
  if (!html) return null;

  const raw = metaContent(html, [
    'og:image:secure_url',
    'og:image:url',
    'og:image',
    'twitter:image',
    'twitter:image:src',
  ]);
  if (!raw) return null;

  let abs: string;
  try {
    abs = new URL(raw, pageUrl).toString();
  } catch {
    return null;
  }
  if (!isUsableImageUrl(abs)) return null;

  const altText = metaContent(html, ['og:image:alt', 'twitter:image:alt']);
  return { url: abs, source, credit, altText: altText || null };
}

// ─────────────────────────────────────────────────────────────
// Name / distance matching (for NPS API)
// ─────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'access', 'campground', 'camp', 'recreation', 'area', 'the', 'river', 'creek',
  'ford', 'landing', 'park', 'point', 'lake', 'use', 'day', 'group', 'national',
  'conservation', 'memorial', 'and', 'of', 'at', 'on', 'to', 'boat', 'ramp',
]);

function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
  );
}

/** True when two names share a distinctive (non-stopword) token. */
function nameMatches(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

function haversineMeters(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Max distance to accept a coordinate-only NPS match (no name overlap).
const NPS_COORD_RADIUS_M = 2_000;

// ─────────────────────────────────────────────────────────────
// NPS resolver (cached per park code for the lifetime of the process)
// ─────────────────────────────────────────────────────────────

interface NpsEntry {
  title: string;
  lat: number | null;
  lng: number | null;
  image: NpsImage | null;
}

const npsCache = new Map<string, NpsEntry[]>();

function num(v: string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function loadNpsEntries(parkCode: string): Promise<NpsEntry[]> {
  const cached = npsCache.get(parkCode);
  if (cached) return cached;

  const entries: NpsEntry[] = [];

  const firstUsable = (imgs: NpsImage[] | undefined): NpsImage | null =>
    imgs?.find((i) => i.url && isUsableImageUrl(i.url)) || null;

  try {
    const places = await fetchNPSPlaces(parkCode);
    for (const p of places) {
      entries.push({
        title: p.title,
        lat: num(p.latitude),
        lng: num(p.longitude),
        image: firstUsable(p.images as NpsImage[] | undefined),
      });
    }
  } catch { /* places may be unavailable for a park; campgrounds still tried */ }

  try {
    const camps = await fetchNPSCampgrounds(parkCode);
    for (const c of camps as Array<{ name: string; latitude?: string; longitude?: string; images?: NpsImage[] }>) {
      entries.push({
        title: c.name,
        lat: num(c.latitude),
        lng: num(c.longitude),
        image: firstUsable(c.images),
      });
    }
  } catch { /* ignore */ }

  npsCache.set(parkCode, entries);
  return entries;
}

async function resolveNps(
  ap: ResolvableAccessPoint,
  parkCode: string,
): Promise<ResolvedImage | null> {
  const entries = (await loadNpsEntries(parkCode)).filter((e) => e.image);
  if (entries.length === 0) return null;

  // 1) Prefer a name match.
  const byName = entries.find((e) => nameMatches(ap.name, e.title));
  // 2) Otherwise the nearest entry within the coord radius.
  let best: NpsEntry | null = byName || null;
  if (!best && ap.lat != null && ap.lng != null) {
    let bestDist = NPS_COORD_RADIUS_M;
    for (const e of entries) {
      if (e.lat == null || e.lng == null) continue;
      const d = haversineMeters(ap.lat, ap.lng, e.lat, e.lng);
      if (d <= bestDist) {
        bestDist = d;
        best = e;
      }
    }
  }
  if (!best || !best.image) return null;

  return {
    url: best.image.url,
    source: 'nps',
    credit: best.image.credit || 'NPS',
    altText: best.image.altText || best.image.caption || null,
  };
}

// ─────────────────────────────────────────────────────────────
// RIDB resolver (COE / USFS federal facilities via recreation.gov ID)
// ─────────────────────────────────────────────────────────────

function parseRecGovFacilityId(url: string): string | null {
  const m = /recreation\.gov\/(?:camping\/(?:campgrounds|gateways)|facilities)\/(\d+)/i.exec(url);
  return m ? m[1] : null;
}

async function resolveRidb(url: string): Promise<ResolvedImage | null> {
  const facilityId = parseRecGovFacilityId(url);
  if (!facilityId) return null;

  const media = await fetchFacilityMedia(facilityId);
  const img = media.find(
    (m) => (m.MediaType || '').toLowerCase() === 'image' && m.URL && isUsableImageUrl(m.URL),
  );
  if (!img) return null;

  return {
    url: img.URL,
    source: 'ridb',
    credit: img.Credits || 'Recreation.gov',
    altText: img.Title || img.Description || null,
  };
}

// ─────────────────────────────────────────────────────────────
// Agency routing
// ─────────────────────────────────────────────────────────────

const GENERIC_NPS_PAGE = /(camping\.htm|river-accesses-mileage\.htm|planyourvisit\/?$)/i;

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

export interface ResolveContext {
  /** NPS unit code for this access point's river (rivers.park_code), e.g. 'buff'. */
  parkCode?: string | null;
}

/**
 * Resolve one image for an access point. Returns a result describing the
 * outcome; `image` is null for 'no-match' / 'error'.
 */
export async function resolveAccessPointImage(
  ap: ResolvableAccessPoint,
  ctx: ResolveContext = {},
): Promise<ResolveResult> {
  const agency = (ap.managingAgency || '').trim();
  const url = ap.officialSiteUrl?.trim() || null;
  const host = hostOf(url);

  const done = (image: ResolvedImage | null, detail: string): ResolveResult => ({
    accessPointId: ap.id,
    name: ap.name,
    status: image ? 'resolved' : 'no-match',
    image,
    detail,
  });

  try {
    // NPS — API match by name/coords is far better than the mostly-generic
    // official_site_url pages (many points share camping.htm).
    if (agency === 'NPS') {
      if (ctx.parkCode) {
        const img = await resolveNps(ap, ctx.parkCode);
        if (img) return done(img, `NPS API match (${ctx.parkCode})`);
      }
      // Fall back to og:image only for a specific (non-generic) NPS page.
      if (url && host === 'www.nps.gov' && !GENERIC_NPS_PAGE.test(url)) {
        const img = await resolveOgImage(url, 'nps', 'NPS');
        if (img) return done(img, 'NPS page og:image');
      }
      return done(null, ctx.parkCode ? 'no NPS match' : 'no park_code + generic page');
    }

    // COE — federal, recreation.gov facility media.
    if (agency === 'COE') {
      const facilityId = url ? parseRecGovFacilityId(url) : null;
      if (facilityId) {
        const img = await resolveRidb(url!);
        if (img) return done(img, 'RIDB facility media');
        return done(null, `RIDB: no media for facility ${facilityId} (or RIDB key unset)`);
      }
      return done(null, 'no recreation.gov facility id');
    }

    // USFS — recreation.gov media if available, else fs.usda.gov og:image.
    // (The redesigned fs.usda.gov CMS often only exposes a placeholder og:image,
    // which is rejected below — those points fall through to the Eddy otter.)
    if (agency === 'USFS') {
      const facilityId = url ? parseRecGovFacilityId(url) : null;
      if (facilityId) {
        const img = await resolveRidb(url!);
        if (img) return done(img, 'RIDB facility media');
      }
      if (url) {
        const img = await resolveOgImage(url, 'usfs', 'USDA Forest Service');
        if (img) return done(img, 'USFS page og:image');
      }
      return done(null, 'no USFS image (placeholder or no og:image)');
    }

    // MDC + Municipal (Missouri Dept. of Conservation place pages carry a real
    // per-access hero photo as og:image). Municipal points in this dataset are
    // also hosted on mdc.mo.gov.
    if (agency === 'MDC' || agency === 'Municipal') {
      if (url && host === 'mdc.mo.gov') {
        const img = await resolveOgImage(url, 'mdc', 'Missouri Department of Conservation');
        if (img) return done(img, 'MDC page og:image');
      }
      // Generic fallback below still applies for non-mdc municipal sites.
    }

    // State Park, Private outfitters, and anything else with an official site:
    // scrape the page's og:image. Outfitter photos are copyrighted — included
    // per product decision; credited to the site host.
    if (url) {
      const source =
        agency === 'State Park' ? 'state-park' :
        agency === 'Private' ? 'private' :
        (agency || 'other').toLowerCase().replace(/\s+/g, '-');
      const credit =
        agency === 'State Park' ? 'Missouri State Parks' :
        host || null;
      const img = await resolveOgImage(url, source, credit);
      if (img) return done(img, `${agency || 'site'} og:image`);
      return done(null, 'no og:image on official site');
    }

    return done(null, agency ? `no source for ${agency} (no URL)` : 'no agency/URL');
  } catch (err) {
    return {
      accessPointId: ap.id,
      name: ap.name,
      status: 'error',
      image: null,
      detail: err instanceof Error ? err.message : 'resolver error',
    };
  }
}
