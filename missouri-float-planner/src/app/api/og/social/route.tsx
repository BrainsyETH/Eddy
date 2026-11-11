// src/app/api/og/social/route.tsx
// Generates square (1080x1080) or portrait (1080x1920) covers for social posts.
//
// The cover IS the reel's thumbnail — on Instagram the OG image is passed as
// the Reel's cover_url, so it sits in the same grid tile the video plays in.
// Covers are built to earn the tap in the profile grid (docs/social-design-
// system.md, "Covers"): one grounded headline, one visual, river + location and
// a small Eddy mark, inside the centered 3:4 grid crop. Three treatments —
// photo (public-domain river photography), illustration (Eddy's otter) and
// conditions (the dark severity surface) — drawn by EditorialCover in
// src/lib/og/social-cover.tsx from the rules in src/lib/social/cover-plan.ts.
// The trend and clip covers keep their earlier layouts.
//
// `art=` (photo.<id> | eddy.<n>) pins the cover's artwork; post-context
// chooses it from the recent grid. Absent (legacy URLs) → derived here.
//
// Parameters that state a fact (a condition, a height, weather, any text) are
// honoured only on a URL Eddy signed, or one already stored as a published
// post's image_url. See src/lib/social/cover-signature.ts. Build cover URLs
// with signCoverUrl; a hand-written pinned URL is refused with a 403.
//
// Supports:
//   ?type=digest                       — all rivers, daily digest thumbnail
//   ?type=highlight&river=slug&id=&ft=&condition=&at=
//                                      — single-river "Eddy Says" report thumbnail; the
//                                        post pins its eddy_update row, reading, condition
//                                        and timestamp so the cover can't drift from the reel
//   ?type=eddy_says&river=slug         — legacy alias for ?type=highlight (merged format)
//   ?type=tip&id=uuid                  — custom content snippet thumbnail
//   ?type=forecast&river=&condition=&ft=&bets=&rain=&wx=
//                                      — weekly forecast: the pinned best bet (absent → live pick)
//   ?type=section                      — Float Pick: live condition-aware section
//   ?type=favorite&river=&fromSlug=&toSlug= — Float Pick evergreen fallback (from guides)
//   ?type=clip&id=&river=&creator=     — branded clip cover; id supplies the
//                                        representative source-frame image
//   ?type=trend&river=&asOf=&condition=&wx=
//                                      — 7-day trend as of the post's own instant (absent →
//                                        live pick of the river with the biggest gauge move)
//   ?type=warning&river=slug&from=...  — condition-change warning (flowing → high/dangerous)
//   ?type=storm&rivers=slug:cond,...   — batch "rivers rising" alert
//   ?type=weekend-read&rivers=slug:cond:ft,...&at=
//                                      — weekly multi-river Eddy’s Read cover (2–3 pinned rivers)

import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { coverTrust, storedCoverCandidates } from '@/lib/social/cover-signature';
import { loadOgFonts, loadConditionOtter, loadImageAsDataUri, loadOtterImage, OTTER_URLS } from '@/lib/og/fonts';
import {
  hasRainComing,
  weatherChip,
  RAIN_CHANCE_THRESHOLD,
  type WeatherSummary,
  type WeatherChip,
} from '@/lib/weather/openweather';
import {
  WEEKEND_FLOATABLE as FORECAST_FLOATABLE,
  WEEKEND_SEVERITY as FORECAST_SEVERITY,
} from '@shared/condition-system';
import type { ConditionCode } from '@/lib/og/types';
import { pickSectionForRivers, findSection, type Section } from '@/lib/social/section-picker';
import { pickFavoriteFloat, findFavoriteFloat, type FavoriteFloat } from '@/lib/social/favorite-floats';
import { pickNotableTrend } from '@/lib/social/trend-picker';
import { buildLiveConditionsMap, overlayLiveConditions } from '@/lib/social/live-conditions';
import { warningCopy, recoveryCopy } from '@shared/condition-copy';
// riverDisplayLong/Short degrade unmapped slugs to readable title-cased names —
// never the raw slug ("big-river"), which briefly shipped on live covers.
import { riverDisplayCasual, riverDisplayLong, riverDisplayShort } from '@/lib/social/river-display';
import {
  capitalizeFirst,
  chooseCoverArt,
  conditionHeadline,
  coverNotes,
  coverPhotosFor,
  endpointsSubline,
  floatPickHeadline,
  illustrationArt,
  isRenderableImageType,
  noteHeadline,
  parseArtParam,
  type CoverArt,
  type CoverPhoto,
  type FloatPickFacts,
} from '@/lib/social/cover-plan';
import { trendMeta } from '@shared/trend-meta';
import { reportStamp } from '@shared/social-editorial';
import { CTA, LABELS, SURFACES, colors, conditionInk, hexAlpha } from '@shared/social-brand';
import {
  CoverCard,
  CoverDock,
  CoverMasthead,
  CoverPage,
  CoverPhotoCard,
  CoverPill,
  CoverSpacer,
  DISPLAY,
  EditorialCover,
  MONO,
  cond,
  condLabel,
  coverGeometry,
  type Size,
} from '@/lib/og/social-cover';

export const revalidate = 300;

// Cache headers so Vercel's CDN caches generated images for Meta's crawlers
const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
};

function getSize(platform: string | null): Size {
  // Instagram accepts this as a custom Reel cover. TikTok chooses a frame by
  // timestamp, but keeping its stored preview artifact portrait makes its 3:4
  // profile crop testable with the same cover geometry.
  if (platform === 'instagram' || platform === 'tiktok') return { width: 1080, height: 1920 };
  // Facebook's current Page video publisher does not accept Instagram's
  // cover_url parameter, so its stored preview/default remain square.
  return { width: 1080, height: 1080 };
}

function numParam(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A pinned weather chip, `high|low|precip|condition` as post-context bakes it
 *  (weatherCoverParam). Any field may be empty. Null when absent/unparseable. */
function parseWeatherParam(raw: string | null): WeatherChip | null {
  if (!raw) return null;
  const [high, low, precip, condition = ''] = raw.split('|');
  const highF = numParam(high || null);
  const lowF = numParam(low || null);
  const precipChance = numParam(precip || null) ?? 0;
  if (highF === null && lowF === null && !condition) return null;
  return { highF, lowF, precipChance, condition };
}

/** A pinned ISO instant, or now when absent/invalid. */
function instantParam(raw: string | null): Date {
  const ms = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? new Date(ms) : new Date();
}

/** A river's published-guide hero photo as a data URI, for the photo card
 *  (Satori can't lazy-load remote images). Null when there's no guide photo,
 *  so the caller renders no photo card. */
async function loadRiverPhotoDataUri(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  riverSlug: string | null | undefined,
): Promise<string | null> {
  if (!riverSlug) return null;
  const { data } = await supabase
    .from('blog_posts')
    .select('featured_image_url, og_image_url')
    .eq('category', 'River Guides')
    .eq('status', 'published')
    .eq('river_slug', riverSlug)
    .limit(1)
    .maybeSingle();
  const url = data?.featured_image_url || data?.og_image_url;
  if (!url) return null;
  try {
    return await loadImageAsDataUri(url);
  } catch {
    return null;
  }
}

/** A cached AI background (og_backgrounds) as a data URI, by key. Only the clip
 *  cover still falls back to it; the editorial covers use catalogued
 *  public-domain photos or Eddy's illustrations instead (cover-plan.ts). */
async function loadBackgroundDataUri(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  key: string | null | undefined,
): Promise<string | null> {
  if (!key) return null;
  const { data } = await supabase
    .from('og_backgrounds')
    .select('url')
    .eq('key', key)
    .maybeSingle();
  if (!data?.url) return null;
  try {
    return await loadImageAsDataUri(data.url);
  } catch {
    return null;
  }
}

/** The series-identity otter for a cover's masthead; null when the fetch
 *  fails (the masthead simply shows the wordmark alone). */
async function loadOtter(condition: string): Promise<string | null> {
  try {
    return await loadConditionOtter(condition);
  } catch {
    return null;
  }
}

function render(node: React.ReactElement, size: Size) {
  return new ImageResponse(node, { ...size, fonts: loadOgFonts(), headers: CACHE_HEADERS });
}

// ─── Editorial covers ───────────────────────────────────────────────────────

/** A pinned cover URL always renders the same image, so the CDN can keep it —
 *  Meta re-requests covers, and each miss would re-fetch the source photo. */
const PINNED_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
};

/** Wikimedia asks automated clients to identify themselves. */
const PHOTO_FETCH_HEADERS = { 'User-Agent': 'EddyGuide-SocialCovers/1.0 (+https://eddy.guide)' };

const STATE_NAMES: Record<string, string> = { MO: 'Missouri', AR: 'Arkansas' };

/** "Current River · Missouri" — the river and where it is. */
async function riverPlace(
  supabase: ReturnType<typeof createAdminClient>,
  slug: string,
): Promise<string> {
  const { data } = await supabase.from('rivers').select('state').eq('slug', slug).maybeSingle();
  const state = (data as { state?: string | null } | null)?.state ?? null;
  const name = riverDisplayLong(slug);
  // "Spring River (Missouri)" already carries its state; don't say it twice.
  return state ? `${name.replace(/\s*\([^)]*\)$/, '')} · ${STATE_NAMES[state] ?? state}` : name;
}

/** A catalogued photo as a data URI, or null (→ the illustration fallback).
 *  Catalog URLs are immutable, so the fetch is cached. */
async function loadCoverPhoto(photo: CoverPhoto): Promise<string | null> {
  try {
    const res = await fetch(photo.url, {
      headers: PHOTO_FETCH_HEADERS,
      cache: 'force-cache',
      signal: AbortSignal.timeout(6000),
    });
    const type = res.headers.get('content-type');
    if (!res.ok || !isRenderableImageType(type)) return null;
    return `data:${type!.split(';')[0]};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }
}

/** Stable small number from a string, to seed a legacy URL's derived choices. */
function seedOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

type ResolvedArt = {
  art: CoverArt;
  photo: string | null;
  fallback: 'no-catalogued-photo' | 'photo-unavailable' | null;
};

/** The photo treatment's art: the pinned photo when it loads; otherwise the
 *  illustration, with the reason recorded for the reviewer. */
async function resolvePhotoArt(riverSlug: string, artRaw: string | null, seedKey: string): Promise<ResolvedArt> {
  const seed = seedOf(seedKey);
  const art = parseArtParam(artRaw, riverSlug) ?? chooseCoverArt(riverSlug, [], seed);
  if (art.kind === 'photo') {
    const photo = await loadCoverPhoto(art.photo);
    if (photo) return { art, photo, fallback: null };
    return { art: illustrationArt(seed), photo: null, fallback: 'photo-unavailable' };
  }
  return { art, photo: null, fallback: coverPhotosFor(riverSlug).length === 0 ? 'no-catalogued-photo' : null };
}

/** Illustration compositions → their otter artwork. */
const ILLUSTRATION_OTTERS = [OTTER_URLS.canoe, OTTER_URLS.standard, OTTER_URLS.flag];

async function loadIllustration(variant: number): Promise<string | null> {
  try {
    return await loadOtterImage(ILLUSTRATION_OTTERS[variant % ILLUSTRATION_OTTERS.length]);
  } catch {
    return null;
  }
}

function illustrationVariant(artRaw: string | null, seedKey: string): number {
  const art = parseArtParam(artRaw);
  if (art?.kind === 'eddy') return art.variant;
  const derived = illustrationArt(seedOf(seedKey));
  return derived.kind === 'eddy' ? derived.variant : 0;
}

type EditorialProps = Omit<React.ComponentProps<typeof EditorialCover>, 'cover'>;

/** Render an editorial cover. Advisory reviewer notes travel in a header the
 *  admin preview reads (URI-encoded: header values must be ASCII). */
function renderEditorial(
  size: Size,
  props: EditorialProps,
  notes: string[],
  pinned: boolean,
) {
  const cover = coverGeometry(size, props.treatment === 'conditions' ? 'dark' : 'light', 'instagram');
  return new ImageResponse(<EditorialCover cover={cover} {...props} />, {
    ...size,
    fonts: loadOgFonts(),
    headers: {
      ...(pinned ? PINNED_CACHE_HEADERS : CACHE_HEADERS),
      'X-Cover-Notes': encodeURIComponent(notes.join('\n')),
      'Access-Control-Expose-Headers': 'X-Cover-Notes',
    },
  });
}

/** Float Pick headline + the two lines under it. */
function floatPickText(facts: FloatPickFacts, place: string) {
  const { text, kind } = floatPickHeadline(facts);
  const endpoints = endpointsSubline(facts, kind);
  return endpoints
    ? { headline: text, subline: endpoints, detail: place }
    : { headline: text, subline: place, detail: undefined };
}

// ─── Router ─────────────────────────────────────────────────────────────────

/**
 * Whether this exact URL is the cover of a post already in social_posts.
 *
 * The only thing that vouches for pins nobody signed: covers published before
 * signing existed, and ones signed with a secret since rotated. The match is
 * on the whole stored string, so a stored cover vouches for itself and for
 * nothing a caller edits. One indexed-by-nothing read per candidate host is
 * why the caller rate-limits before asking.
 */
async function isStoredCover(request: NextRequest): Promise<boolean> {
  const url = new URL(request.url);
  const candidates = storedCoverCandidates(url.pathname, url.search, request.nextUrl.origin);
  if (candidates.length === 0) return false;
  try {
    const supabase = createAdminClient();
    const matches = await Promise.all(
      candidates.map((candidate) =>
        supabase.from('social_posts').select('id').eq('image_url', candidate).limit(1),
      ),
    );
    return matches.some(({ data }) => (data?.length ?? 0) > 0);
  } catch (err) {
    console.error('[OG/Social] Stored-cover lookup failed:', err);
    return false;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Pins are honoured only on a URL Eddy wrote (lib/social/cover-signature.ts).
  // Signed and unpinned requests never reach the limiter or the lookup, so
  // Meta fetching a real cover costs nothing extra.
  if (coverTrust(searchParams) === 'unsigned') {
    const limited = await rateLimit(`og-social-unsigned:${getClientIp(request)}`, 30, 60_000);
    if (limited) return limited;
    if (!(await isStoredCover(request))) {
      return new NextResponse('This cover link is not one Eddy published.', {
        status: 403,
        headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }

  const platform = searchParams.get('platform');
  const size = getSize(platform);

  try {
    const type = searchParams.get('type') || 'digest';
    const riverSlug = searchParams.get('river');
    const contentId = searchParams.get('id');

    // The post pins what its reel showed (see post-context) so the cover Meta
    // renders at crawl time is the same report, not a later one.
    const highlightPins = {
      id: contentId,
      ft: numParam(searchParams.get('ft')),
      condition: searchParams.get('condition'),
      at: searchParams.get('at'),
    };

    if (type === 'highlight' && riverSlug) {
      return await generateHighlightImage(riverSlug, size, highlightPins, searchParams.get('art'));
    }

    // Legacy alias: eddy_says merged into the highlight report. Old posts'
    // image_urls keep resolving (Meta re-crawls by URL), rendered as the
    // current highlight cover.
    if (type === 'eddy_says' && riverSlug) {
      return await generateHighlightImage(riverSlug, size, highlightPins);
    }

    if (type === 'weekend-read') {
      const at = new Date(searchParams.get('at') || '');
      if (!Number.isFinite(at.getTime()) || parsePinnedDigestRivers(searchParams.get('rivers')).length < 2) {
        return new Response('A weekend Read requires pinned rivers and a date', { status: 400 });
      }
      return await generateDigestImage(size, searchParams.get('rivers'), at, searchParams.get('art'));
    }

    if (type === 'tip' && contentId) {
      return await generateTipImage(contentId, size);
    }

    if (type === 'forecast') {
      return await generateForecastImage(size, {
        river: riverSlug,
        condition: searchParams.get('condition'),
        ft: numParam(searchParams.get('ft')),
        bets: numParam(searchParams.get('bets')),
        rain: searchParams.get('rain') === '1',
        weather: parseWeatherParam(searchParams.get('wx')),
        art: searchParams.get('art'),
      });
    }

    if (type === 'section') {
      return await generateSectionImage(size, {
        river: riverSlug,
        putInMile: numParam(searchParams.get('putInMile')),
        takeOutMile: numParam(searchParams.get('takeOutMile')),
        timeRangeLabel: searchParams.get('time')?.slice(0, 80),
        condition: searchParams.get('condition'),
        art: searchParams.get('art'),
      });
    }

    if (type === 'favorite') {
      return await generateFavoriteImage(size, {
        river: riverSlug,
        fromSlug: searchParams.get('fromSlug'),
        timeRangeLabel: searchParams.get('time')?.slice(0, 80),
        toSlug: searchParams.get('toSlug'),
        art: searchParams.get('art'),
      });
    }

    if (type === 'clip') {
      return await generateClipImage(size, {
        id: contentId,
        river: riverSlug,
        creator: searchParams.get('creator'),
      });
    }

    if (type === 'trend') {
      return await generateTrendImage(size, searchParams.get('river'), {
        asOf: searchParams.get('asOf'),
        condition: searchParams.get('condition'),
        weather: parseWeatherParam(searchParams.get('wx')),
      });
    }

    if (type === 'storm') {
      return await generateStormImage(size, searchParams.get('rivers'));
    }

    if (type === 'warning' && riverSlug) {
      const fromCondition = searchParams.get('from') || undefined;
      const toCondition = searchParams.get('to') || undefined;
      const pinnedFt = numParam(searchParams.get('ft'));
      const kind = searchParams.get('kind') || undefined;
      const rise = searchParams.get('rise') || undefined;
      return await generateWarningImage(riverSlug, fromCondition, size, toCondition, pinnedFt, kind, rise);
    }

    return await generateDigestImage(size, searchParams.get('rivers'), undefined, searchParams.get('art'));
  } catch (err) {
    console.error('[OG/Social] Image generation failed:', err);
    const cover = coverGeometry(size);
    return render(
      <CoverPage cover={cover}>
        <CoverMasthead cover={cover} label={LABELS.eddySays} title="River conditions" subtitle="Live Ozark river levels" />
      </CoverPage>,
      size,
    );
  }
}

/** Parse the digest's pinned `rivers` param — comma-separated `slug:condition:ft`
 *  triples (ft may be empty), e.g. `current:flowing:3.2,meramec:good:`. Malformed
 *  triples (no slug or no condition) are dropped. Returns [] when nothing usable,
 *  so the caller can fall back to the live map. */
function parsePinnedDigestRivers(
  raw: string | null,
): Array<[string, { condition_code: string; gauge_height_ft: number | null }]> {
  if (!raw) return [];
  return raw
    .split(',')
    .map((triple) => {
      const [slug, condition, ft] = triple.split(':');
      const s = (slug || '').trim();
      const c = (condition || '').trim();
      if (s === '' || c === '') return null;
      const ftNum = Number((ft || '').trim());
      return {
        slug: s,
        condition_code: c,
        gauge_height_ft: (ft || '').trim() !== '' && Number.isFinite(ftNum) ? ftNum : null,
      };
    })
    .filter((r): r is { slug: string; condition_code: string; gauge_height_ft: number | null } => r !== null)
    .map((r) => [r.slug, { condition_code: r.condition_code, gauge_height_ft: r.gauge_height_ft }]);
}

/** Conditions the digest headline counts as floatable (matches the reel). */
const FLOATABLE = new Set(['flowing', 'good']);

function digestHeadline(codes: string[]): string {
  const floatable = codes.filter((code) => FLOATABLE.has(code)).length;
  if (codes.length === 0) return 'No river data';
  if (floatable === 0) return 'No float picks today';
  if (floatable === codes.length) return `All ${codes.length} in float range`;
  return `${floatable} of ${codes.length} in float range`;
}

// ─── Digest / weekend Read — illustration ───────────────────────────────────

async function generateDigestImage(size: Size, pinned?: string | null, weekendReadAt?: Date, artRaw?: string | null) {
  const supabase = createAdminClient();

  // Preferred path: the caller baked a pinned river list into the URL so the
  // cover matches the reel's pinned data exactly (no live drift). Absent/empty
  // → fall back to the live gauge-derived conditions below.
  const pinnedRivers = parsePinnedDigestRivers(pinned ?? null);
  let rivers: Array<[string, { condition_code: string; gauge_height_ft: number | null }]>;
  if (pinnedRivers.length > 0) {
    rivers = pinnedRivers;
  } else {
    // Pull live gauge-derived conditions so the digest never lags behind the
    // hourly gauge feed. (eddy_updates.condition_code is frozen daily.)
    const liveMap = await buildLiveConditionsMap(supabase);
    rivers = Array.from(liveMap.entries()).map(([slug, live]) => [
      slug,
      { condition_code: live.condition_code, gauge_height_ft: live.gauge_height_ft },
    ]);
  }
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const variant = illustrationVariant(artRaw ?? null, `digest:${pinned ?? today}`);
  const [mark, art] = await Promise.all([loadOtter('flowing'), loadIllustration(variant)]);
  const headline = weekendReadAt ? 'Eddy’s weekend read' : digestHeadline(rivers.map(([, r]) => r.condition_code));
  const subline = weekendReadAt
    ? rivers.map(([slug]) => riverDisplayShort(slug)).join(' · ')
    : today;

  return renderEditorial(
    size,
    {
      treatment: 'illustration',
      eyebrow: weekendReadAt ? LABELS.eddyRead : LABELS.riverReport,
      headline,
      subline,
      detail: weekendReadAt ? `Current water · ${reportStamp(weekendReadAt)}` : undefined,
      mark,
      art,
      variant,
    },
    coverNotes({ headline }),
    pinnedRivers.length > 0,
  );
}

// ─── Eddy Says report ───────────────────────────────────────────────────────

async function generateHighlightImage(
  riverSlug: string,
  size: Size,
  pins: { id?: string | null; ft?: number | null; condition?: string | null; at?: string | null } = {},
  artRaw: string | null = null,
) {
  const supabase = createAdminClient();

  // Pinned path: the post named its exact eddy_update row, so fetch THAT (no
  // expiry filter — Meta may re-crawl days later and the row is still the one
  // the reel was rendered from). Absent → the latest update for the river.
  const select = 'river_slug, condition_code, gauge_height_ft, summary_text';
  const { data: rawUpdate } = pins.id
    ? await supabase.from('eddy_updates').select(select).eq('id', pins.id).maybeSingle()
    : await supabase
        .from('eddy_updates')
        .select(select)
        .eq('river_slug', riverSlug)
        .is('section_slug', null)
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

  if (!rawUpdate) {
    return NextResponse.json({ error: 'No update found for river' }, { status: 404 });
  }

  // The reel already applied the live-conditions overlay when the post was
  // built and pinned the result (ft + condition). Honour the pins verbatim;
  // only an un-pinned (legacy) URL overlays live data at crawl time — which
  // is the drift the pins exist to prevent.
  const pinnedReading = pins.ft != null || !!pins.condition;
  const [update] = pinnedReading
    ? [{
        ...rawUpdate,
        gauge_height_ft: pins.ft ?? rawUpdate.gauge_height_ft,
        condition_code: pins.condition ?? rawUpdate.condition_code,
      }]
    : await overlayLiveConditions(supabase, [rawUpdate]);

  const conditionCode = (update.condition_code || 'unknown') as ConditionCode;
  // The subtitle is the post's timestamp, not the crawl's.
  const stamp = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(instantParam(pins.at ?? null));
  const variant = illustrationVariant(artRaw, `highlight:${riverSlug}:${pins.at ?? ''}`);
  // The condition-mood otter is both the mark and the artwork here.
  const otter = await loadOtter(conditionCode);
  const headline = `Eddy’s read on ${riverDisplayCasual(riverSlug)}`;

  return renderEditorial(
    size,
    {
      treatment: 'illustration',
      eyebrow: LABELS.eddyRead,
      headline,
      subline: `${condLabel(conditionCode)} · ${stamp}`,
      mark: otter,
      art: otter,
      variant,
    },
    coverNotes({ headline }),
    pinnedReading,
  );
}

// ─── Tip / seasonal note ────────────────────────────────────────────────────

async function generateTipImage(contentId: string, size: Size) {
  const supabase = createAdminClient();

  const { data: content } = await supabase
    .from('social_custom_content')
    .select('text, content_type')
    .eq('id', contentId)
    .single();

  if (!content) {
    return NextResponse.json({ error: 'Content not found' }, { status: 404 });
  }

  const typeLabel = content.content_type === 'seasonal' ? LABELS.seasonalNote :
    content.content_type === 'tip' ? LABELS.floatTip :
    content.content_type === 'promo' ? LABELS.announcement : LABELS.fromEddy;
  const variant = illustrationVariant(null, `tip:${contentId}`);
  const [mark, art] = await Promise.all([loadOtter('flowing'), loadIllustration(variant)]);
  // One headline; the full note is the caption.
  const headline = noteHeadline(content.text, content.content_type);

  return renderEditorial(
    size,
    { treatment: 'illustration', eyebrow: typeLabel, headline, mark, art, variant },
    coverNotes({ headline }),
    true,
  );
}

// ---------------------------------------------------------------------------
// Weekly Forecast thumbnail
// ---------------------------------------------------------------------------
/** Satori-safe weather label — no degree glyph (Fredoka may lack it), so temps
 *  read "Hi 78 / Lo 55". e.g. "Hi 78 / Lo 55 · Clear · 40% rain". */
function ogWeatherLabel(chip: WeatherChip | null): string {
  if (!chip) return '';
  const temp =
    chip.highF !== null && chip.lowF !== null
      ? `Hi ${chip.highF} / Lo ${chip.lowF}`
      : chip.highF !== null
        ? `${chip.highF}`
        : '';
  const parts = [temp, chip.condition].filter(Boolean);
  if (chip.precipChance >= RAIN_CHANCE_THRESHOLD) parts.push(`${chip.precipChance}% rain`);
  return parts.join(' · ');
}

/** What the forecast cover shows. Built from the post's pins, or — for an
 *  un-pinned legacy URL — from a live pick at crawl time. */
type ForecastBest = {
  river_slug: string;
  condition_code: string;
  gauge_height_ft: number | null;
  /** The weather chip label already resolved (pins carry the chip, not the raw summary). */
  weatherLabel: string;
  betCount: number;
  usingFallback: boolean;
};

async function liveForecastBest(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<ForecastBest | null> {
  const { data: updates } = await supabase
    .from('eddy_updates')
    .select('river_slug, condition_code, gauge_height_ft, weather')
    .neq('river_slug', 'global')
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false });

  const seen = new Set<string>();
  type Row = {
    river_slug: string;
    condition_code: string;
    gauge_height_ft: number | null;
    weather?: WeatherSummary | null;
  };
  const dedupedRaw = ((updates || []) as Row[]).filter((u) => {
    if (seen.has(u.river_slug)) return false;
    seen.add(u.river_slug);
    return true;
  });
  // Overlay live conditions before filtering — a river that flipped from
  // 'flowing' into 'high' since the AI snapshot should be rated on its live
  // bucket, not yesterday's.
  const deduped = await overlayLiveConditions(supabase, dedupedRaw);
  const floatable = deduped
    .filter((u) => FORECAST_FLOATABLE.has(u.condition_code))
    .sort((a, b) => (FORECAST_SEVERITY[a.condition_code] ?? 99) - (FORECAST_SEVERITY[b.condition_code] ?? 99));
  // Prefer rivers with no rain coming; fall back to best-available with a note.
  const dry = floatable.filter((u) => !hasRainComing(u.weather));
  const usingFallback = dry.length === 0;
  const top = (usingFallback ? floatable : dry).slice(0, 3);
  const best = top[0];
  if (!best) return null;
  return {
    river_slug: best.river_slug,
    condition_code: best.condition_code,
    gauge_height_ft: best.gauge_height_ft,
    weatherLabel: ogWeatherLabel(weatherChip(best.weather)),
    betCount: top.length,
    usingFallback,
  };
}

async function generateForecastImage(
  size: Size,
  pins: {
    river?: string | null;
    condition?: string | null;
    ft?: number | null;
    bets?: number | null;
    rain?: boolean;
    weather?: WeatherChip | null;
    art?: string | null;
  } = {},
) {
  const supabase = createAdminClient();

  // Pinned path: post-context baked the best bet it showed in the reel —
  // river, condition, reading, weather chip, bets count, rain note — so this
  // render cannot re-pick a different river when Meta fetches it later.
  const pinned = !!(pins.river && pins.condition);
  const best: ForecastBest | null = pinned
    ? {
        river_slug: pins.river!,
        condition_code: pins.condition!,
        gauge_height_ft: pins.ft ?? null,
        weatherLabel: ogWeatherLabel(pins.weather ?? null),
        betCount: Math.max(1, pins.bets ?? 1),
        usingFallback: !!pins.rain,
      }
    : await liveForecastBest(supabase);

  const mark = await loadOtter(best?.condition_code ?? 'flowing');

  if (!best) {
    const variant = illustrationVariant(null, 'forecast:none');
    const headline = 'No floatable rivers right now';
    return renderEditorial(
      size,
      { treatment: 'illustration', eyebrow: LABELS.weekendForecast, headline, subline: 'Check back after the rain', mark, art: await loadIllustration(variant), variant },
      coverNotes({ headline }),
      false,
    );
  }

  const resolved = await resolvePhotoArt(best.river_slug, pins.art ?? null, `forecast:${best.river_slug}`);
  const art = resolved.art.kind === 'eddy' ? await loadIllustration(resolved.art.variant) : null;
  const headline = `Weekend pick: ${riverDisplayCasual(best.river_slug)}`;
  const place = await riverPlace(supabase, best.river_slug);

  return renderEditorial(
    size,
    {
      treatment: resolved.photo ? 'photo' : 'illustration',
      eyebrow: LABELS.weekendForecast,
      headline,
      subline: place,
      detail: best.usingFallback ? 'Rain possible this weekend' : undefined,
      photo: resolved.photo,
      textZone: resolved.art.kind === 'photo' ? resolved.art.photo.textZone : 'lower',
      mark,
      art,
      variant: resolved.art.kind === 'eddy' ? resolved.art.variant : 0,
    },
    coverNotes({ headline, art: resolved.photo ? resolved.art : null, fallback: resolved.fallback }),
    pinned && !!pins.art,
  );
}

// ---------------------------------------------------------------------------
// Float Pick — photo treatment (illustration when the river has no catalogued
// public-domain photo or it fails to load). The live pick and the evergreen
// Trip Idea share the layout; only the eyebrow differs.
// ---------------------------------------------------------------------------

async function renderFloatPick(
  size: Size,
  supabase: ReturnType<typeof createAdminClient>,
  facts: FloatPickFacts,
  eyebrow: string,
  artRaw: string | null,
  pinned: boolean,
) {
  const resolved = await resolvePhotoArt(facts.riverSlug, artRaw, `float:${facts.riverSlug}:${facts.putInMile}:${facts.takeOutMile}`);
  const [mark, art, place] = await Promise.all([
    loadOtter('flowing'),
    resolved.art.kind === 'eddy' ? loadIllustration(resolved.art.variant) : Promise.resolve(null),
    riverPlace(supabase, facts.riverSlug),
  ]);
  const text = floatPickText(facts, place);
  return renderEditorial(
    size,
    {
      treatment: resolved.photo ? 'photo' : 'illustration',
      eyebrow,
      ...text,
      photo: resolved.photo,
      textZone: resolved.art.kind === 'photo' ? resolved.art.photo.textZone : 'lower',
      mark,
      art,
      variant: resolved.art.kind === 'eddy' ? resolved.art.variant : 0,
    },
    coverNotes({ headline: text.headline, art: resolved.photo ? resolved.art : null, fallback: resolved.fallback }),
    pinned,
  );
}

async function generateSectionImage(
  size: Size,
  params?: { timeRangeLabel?: string; river?: string | null; putInMile?: number | null; takeOutMile?: number | null; condition?: string | null; art?: string | null },
) {
  const supabase = createAdminClient();

  let section: Section | null = null;

  // Preferred path: the post baked the exact section into the URL, so render
  // THAT float (matching the reel) instead of re-picking. The unique URL also
  // defeats Meta's by-URL OG-image cache, which previously served a stale
  // cover from an earlier post.
  if (params?.river && params.putInMile != null && params.takeOutMile != null) {
    section = await findSection(supabase, params.river, params.putInMile, params.takeOutMile);
  }
  const pinned = !!section;

  // Fallback (legacy / param-less URL): re-pick today's section live.
  if (!section) {
    const { data: updates } = await supabase
      .from('eddy_updates')
      .select('river_slug, condition_code, gauge_height_ft')
      .neq('river_slug', 'global')
      .is('section_slug', null)
      .gt('expires_at', new Date().toISOString());
    type Row = { river_slug: string; condition_code: string; gauge_height_ft: number | null };
    const overlaid = await overlayLiveConditions(supabase, (updates || []) as Row[]);
    const floatableSlugs = overlaid
      .filter((u) => u.condition_code === 'flowing' || u.condition_code === 'good')
      .map((u) => u.river_slug);
    section = await pickSectionForRivers(supabase, floatableSlugs, { minMi: 5, maxMi: 9 });
    if (!section) {
      return NextResponse.json({ error: 'No section available' }, { status: 404 });
    }
  }

  return renderFloatPick(size, supabase, section, LABELS.todayFloatPick, params?.art ?? null, pinned);
}

// The evergreen favourite: the guide's own section name may headline it.
async function generateFavoriteImage(
  size: Size,
  params: { timeRangeLabel?: string; river?: string | null; fromSlug?: string | null; toSlug?: string | null; art?: string | null },
) {
  const supabase = createAdminClient();

  // Preferred path: the post baked the exact endpoints into the URL, so render
  // THAT float (matching the reel). Fall back to today's rotation if absent.
  let fav: FavoriteFloat | null = null;
  if (params.river && params.fromSlug && params.toSlug) {
    fav = await findFavoriteFloat(supabase, params.river, params.fromSlug, params.toSlug);
  }
  const pinned = !!fav;
  if (!fav) fav = await pickFavoriteFloat(supabase);
  if (!fav) {
    return NextResponse.json({ error: 'No favorite float available' }, { status: 404 });
  }

  return renderFloatPick(size, supabase, fav, LABELS.tripIdea, params.art ?? null, pinned);
}

// ---------------------------------------------------------------------------
// Clip cover — the still shown as a clip Reel's grid thumbnail. Clips have no
// OG cover otherwise, so Instagram falls back to the video's first frame.
// Mirrors the ClipReel framing: "On the Water" pill + river name, the river's
// art in the photo card. Tier-2 (no river) → "Ozark Paddling". There is no
// fake CTA button on a non-interactive cover; the real link lives in caption
// and platform chrome.
// ---------------------------------------------------------------------------
async function generateClipImage(
  size: Size,
  params: { id?: string | null; river?: string | null; creator?: string | null },
) {
  const supabase = createAdminClient();
  const cover = coverGeometry(size);

  const riverSlug = params.river || null;
  let riverName = 'Ozark Paddling';
  if (riverSlug) {
    const { data: river } = await supabase.from('rivers').select('name').eq('slug', riverSlug).maybeSingle();
    riverName = river?.name || riverDisplayLong(riverSlug);
  }
  // The cover is visual-first; provenance stays readable in the Reel dock and
  // caption instead of becoming tiny grid text. `creator` remains accepted so
  // old cover URLs keep resolving without changing their cache identity.
  void params.creator;

  let clipThumbnail: string | null = null;
  if (params.id) {
    const { data: clip } = await supabase
      .from('clip_library')
      .select('thumbnail_url')
      .eq('id', params.id)
      .maybeSingle();
    if (clip?.thumbnail_url) {
      try {
        clipThumbnail = await loadImageAsDataUri(clip.thumbnail_url);
      } catch {
        clipThumbnail = null;
      }
    }
  }

  const photo =
    clipThumbnail ??
    (await loadBackgroundDataUri(supabase, riverSlug)) ??
    (await loadRiverPhotoDataUri(supabase, riverSlug));
  const otter = await loadOtter('flowing');

  return render(
    <CoverPage cover={cover}>
      <CoverMasthead cover={cover} label={LABELS.clip} title={riverName} otter={otter} />
      {photo ? <CoverPhotoCard cover={cover} dataUri={photo} height={cover.portrait ? 700 : 460} /> : null}
      <CoverSpacer />
    </CoverPage>,
    size,
  );
}

// ---------------------------------------------------------------------------
// 7-Day Trend thumbnail
// ---------------------------------------------------------------------------
async function generateTrendImage(
  size: Size,
  pinnedRiver?: string | null,
  pins: { asOf?: string | null; condition?: string | null; weather?: WeatherChip | null } = {},
) {
  const supabase = createAdminClient();
  const cover = coverGeometry(size, 'light', 'instagram', true);
  const s = SURFACES[cover.tone];

  const { data: updates } = await supabase
    .from('eddy_updates')
    .select('river_slug, condition_code, weather')
    .neq('river_slug', 'global')
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString());

  type Row = { river_slug: string; condition_code: string; weather?: WeatherSummary | null };
  const rows = (updates || []) as Row[];
  const slugs = Array.from(new Set(rows.map((u) => u.river_slug)));
  // Pinned path: the caller baked the exact river AND the instant into the URL
  // so the cover matches the reel it accompanies. pickNotableTrend restricts
  // the candidate set to that slug and evaluates the seven days as of that
  // instant, so the delta, range and sparkline are the reel's — not whatever
  // the gauge did between posting and Meta's crawl. Absent → keep the live
  // "most notable across all rivers" pick (legacy URLs).
  const restrictTo = pinnedRiver ? [pinnedRiver] : slugs;
  const trend = await pickNotableTrend(supabase, { restrictTo, asOf: pins.asOf ?? null });
  if (!trend) {
    return NextResponse.json({ error: 'No notable trend' }, { status: 404 });
  }
  const liveRow = rows.find((u) => u.river_slug === trend.riverSlug);
  const wx = ogWeatherLabel(pins.weather ?? weatherChip(liveRow?.weather ?? null));

  const meta = trendMeta(trend.direction);
  const trendCondition = pins.condition || liveRow?.condition_code || 'unknown';
  const deltaSign = trend.deltaFt > 0 ? '+' : trend.deltaFt < 0 ? '-' : '';
  const deltaAbs = Math.abs(trend.deltaFt).toFixed(1);
  const otter = await loadOtter(trendCondition);

  // Normalize sparkline coords to an SVG viewBox inside the chart card.
  const CHART_W = cover.width - 2 * 5 - 2 * Math.round(24 * cover.k);
  const CHART_H = cover.portrait ? 360 : 260;
  const PAD = 34;
  const valid = trend.series.filter((p) => p.gaugeHeightFt !== null) as Array<{
    hoursAgo: number;
    gaugeHeightFt: number;
  }>;
  const minFt = trend.sevenDayMinFt ?? 0;
  const maxFt = trend.sevenDayMaxFt ?? minFt + 1;
  const ftRange = maxFt - minFt || 1;
  const firstH = valid[0]?.hoursAgo ?? -168;
  const hoursRange = valid.length > 0 ? 0 - firstH || 168 : 168;
  const points = valid.map((p) => ({
    x: ((p.hoursAgo - firstH) / hoursRange) * (CHART_W - PAD * 2) + PAD,
    y:
      CHART_H -
      PAD -
      ((p.gaugeHeightFt - minFt) / ftRange) * (CHART_H - PAD * 2),
  }));
  const pathD =
    points.length > 0
      ? points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ')
      : '';
  const areaD =
    points.length > 0
      ? `${pathD} L ${points[points.length - 1].x} ${CHART_H - PAD} L ${points[0].x} ${CHART_H - PAD} Z`
      : '';

  return render(
    <CoverPage cover={cover}>
      <CoverMasthead cover={cover} label={LABELS.trend} title={trend.riverName} subtitle={['This week', wx].filter(Boolean).join(' · ')} otter={otter} />
      <CoverCard cover={cover}>
        <svg width={CHART_W} height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
          <line x1={PAD} y1={CHART_H - PAD} x2={CHART_W - PAD} y2={CHART_H - PAD} stroke={s.divider} strokeWidth={3} />
          {areaD && <path d={areaD} fill={hexAlpha(meta.color, 0.18)} />}
          {pathD && (
            <path d={pathD} fill="none" stroke={conditionInk(meta.color)} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {points.length > 0 && (
            <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={13} fill={meta.color} stroke={colors.neutral[900]} strokeWidth={4} />
          )}
        </svg>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 12, padding: '0 6px' }}>
          <CoverPill cover={cover} fill={meta.color} size={Math.round(26 * cover.k)}>
            <span style={{ fontFamily: MONO }}>{meta.arrow}</span>
            <span style={{ marginLeft: 10 }}>{meta.label}</span>
          </CoverPill>
          <span style={{ fontFamily: MONO, fontSize: Math.round(36 * cover.k), fontWeight: 700, color: s.ink }}>
            {deltaSign}{deltaAbs} ft
          </span>
          <span style={{ fontFamily: DISPLAY, fontSize: Math.round(24 * cover.k), fontWeight: 600, color: s.inkMuted }}>over 7 days</span>
        </div>
      </CoverCard>
      <CoverSpacer />
      <CoverDock
        cover={cover}
        cta={CTA.chart}
      />
    </CoverPage>,
    size,
  );
}

// ---------------------------------------------------------------------------
// Condition alerts — the conditions treatment. Fired when a river crosses into
// high / dangerous water (or eases, or recovers). The dark severity surface,
// one big observation (the pinned gauge reading), and a headline that states
// only the observed transition. Calm enough that an update doesn't read as an
// emergency; distinct enough that it never looks like a Float Pick.
// ---------------------------------------------------------------------------
async function generateWarningImage(
  riverSlug: string,
  fromCondition: string | undefined,
  size: Size,
  toCondition?: string,
  pinnedFt?: number | null,
  kind?: string,
  riseText?: string,
) {
  const supabase = createAdminClient();

  const { data: rawUpdate } = await supabase
    .from('eddy_updates')
    .select('river_slug, condition_code, gauge_height_ft')
    .eq('river_slug', riverSlug)
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Prefer the PINNED event (baked into the URL by the alert as &to=&ft=) so the
  // cover always agrees with the caption + reel — a re-fetched "live" value can
  // move between dispatch and Meta's crawl of the cover. Legacy param-less URLs
  // fall back to the live overlay ("right now").
  let newCondition: ConditionCode;
  let gaugeFt: number | null;
  if (toCondition) {
    newCondition = toCondition as ConditionCode;
    gaugeFt = pinnedFt ?? rawUpdate?.gauge_height_ft ?? null;
  } else {
    if (!rawUpdate) {
      return NextResponse.json({ error: 'No update found for river' }, { status: 404 });
    }
    const [update] = await overlayLiveConditions(supabase, [rawUpdate]);
    newCondition = (update.condition_code || 'high') as ConditionCode;
    gaugeFt = update.gauge_height_ft;
  }

  const isRecovery = kind === 'recovery';
  const c = cond(newCondition);
  const riverName = riverDisplayLong(riverSlug);
  const { severityLabel, cta: actionCta } = isRecovery
    ? recoveryCopy(newCondition, riverName)
    : warningCopy(newCondition, riverName);
  const [mark, place] = await Promise.all([loadOtter(newCondition), riverPlace(supabase, riverSlug)]);
  const headline = conditionHeadline({ riverSlug, to: newCondition, from: fromCondition, recovery: isRecovery });

  return renderEditorial(
    size,
    {
      treatment: 'conditions',
      eyebrow: severityLabel,
      eyebrowFill: c.solid,
      severity: c.solid,
      observation: gaugeFt !== null ? { value: gaugeFt.toFixed(1), unit: 'FT' } : null,
      headline,
      subline: place,
      detail: riseText ? `${capitalizeFirst(riseText)} · ${actionCta}` : actionCta,
      mark,
    },
    coverNotes({ headline }),
    !!toCondition,
  );
}

// ---------------------------------------------------------------------------
// Storm-digest cover — fired when several rivers rise at once (batch alert).
// `riversParam` is a comma-separated list of `slug:condition` pairs, e.g.
//   current:dangerous,meramec:high,niangua:high
// ---------------------------------------------------------------------------
async function generateStormImage(size: Size, riversParam: string | null) {
  const rivers = (riversParam || '')
    .split(',')
    .map((pair) => {
      const [slug, condition] = pair.split(':');
      return { slug: (slug || '').trim(), condition: (condition || '').trim() };
    })
    .filter((r) => r.slug !== '');
  const worst = rivers.some((r) => r.condition === 'dangerous') ? cond('dangerous') : cond('high');
  const mark = await loadOtter(rivers.some((r) => r.condition === 'dangerous') ? 'dangerous' : 'high');
  const headline = rivers.length > 1 ? `${rivers.length} rivers are rising` : 'Rivers are rising';
  const names = rivers.slice(0, 4).map((r) => riverDisplayShort(r.slug)).join(' · ');

  return renderEditorial(
    size,
    {
      treatment: 'conditions',
      eyebrow: LABELS.riversRising,
      eyebrowFill: worst.solid,
      severity: worst.solid,
      headline,
      subline: rivers.length > 4 ? `${names} + ${rivers.length - 4} more` : names,
      detail: 'Do not float until levels drop',
      mark,
    },
    coverNotes({ headline }),
    rivers.length > 0,
  );
}
