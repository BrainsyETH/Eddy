// src/app/api/og/social/route.tsx
// Generates square (1080x1080) or portrait (1080x1920) covers for social posts.
//
// The cover IS the reel's thumbnail — on Instagram the OG image is passed as
// the Reel's cover_url, so it sits in the same grid tile the video plays in.
// Every cover here is therefore drawn with the SAME social design system the
// Remotion reels use (shared/social-brand.ts, via src/lib/og/social-cover.tsx):
// the series-label masthead, the ruled cards and tiles, the coral button, the
// light page — or the dark severity surface for the alert family.
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
//   ?type=clip&river=&creator=         — branded clip cover
//   ?type=trend&river=&asOf=&condition=&wx=
//                                      — 7-day trend as of the post's own instant (absent →
//                                        live pick of the river with the biggest gauge move)
//   ?type=warning&river=slug&from=...  — condition-change warning (flowing → high/dangerous)
//   ?type=storm&rivers=slug:cond,...   — batch "rivers rising" alert

import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadOgFonts, loadConditionOtter, loadImageAsDataUri } from '@/lib/og/fonts';
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
import { riverDisplayLong, riverDisplayShort } from '@/lib/social/river-display';
import { trendMeta } from '@shared/trend-meta';
import { canoeHours } from '@/lib/social/post-types';
import { CTA, LABELS, MEDIA_SCRIM, SURFACES, colors, conditionInk, hexAlpha } from '@shared/social-brand';
import {
  CoverCard,
  CoverDock,
  CoverMasthead,
  CoverPage,
  CoverPhotoCard,
  CoverPill,
  CoverQuote,
  CoverRiverRow,
  CoverSpacer,
  DISPLAY,
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
  // Instagram gets 9:16 portrait for Stories format
  if (platform === 'instagram') return { width: 1080, height: 1920 };
  // Facebook and default: 1:1 square
  return { width: 1080, height: 1080 };
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '...';
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

/** A cached AI cover background (og_backgrounds) as a data URI, by key — a river
 *  slug, or 'forecast' / 'danger'. This model-made art is the PREFERRED cover
 *  art; callers fall back to a guide photo, then to no photo card at all. */
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

// ─── Router ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
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
      return await generateHighlightImage(riverSlug, size, highlightPins);
    }

    // Legacy alias: eddy_says merged into the highlight report. Old posts'
    // image_urls keep resolving (Meta re-crawls by URL), rendered as the
    // current highlight cover.
    if (type === 'eddy_says' && riverSlug) {
      return await generateHighlightImage(riverSlug, size, highlightPins);
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
      });
    }

    if (type === 'section') {
      return await generateSectionImage(size, {
        river: riverSlug,
        putInMile: numParam(searchParams.get('putInMile')),
        takeOutMile: numParam(searchParams.get('takeOutMile')),
        condition: searchParams.get('condition'),
      });
    }

    if (type === 'favorite') {
      return await generateFavoriteImage(size, {
        river: riverSlug,
        fromSlug: searchParams.get('fromSlug'),
        toSlug: searchParams.get('toSlug'),
      });
    }

    if (type === 'clip') {
      return await generateClipImage(size, {
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

    return await generateDigestImage(size, searchParams.get('rivers'));
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
  if (floatable === 0) return 'No rivers floatable';
  if (floatable === codes.length) return `All ${codes.length} rivers floatable`;
  return `${floatable} of ${codes.length} rivers floatable`;
}

// ─── Digest ─────────────────────────────────────────────────────────────────

async function generateDigestImage(size: Size, pinned?: string | null) {
  const supabase = createAdminClient();
  const cover = coverGeometry(size);

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
  // Most notable first, like the reel.
  rivers.sort((a, b) => cond(a[1].condition_code).severity - cond(b[1].condition_code).severity);
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const otter = await loadOtter('flowing');
  const headline = digestHeadline(rivers.map(([, r]) => r.condition_code));

  // Rows shrink to fit up to ten rivers under the masthead.
  const mastheadH = Math.round(320 * cover.k);
  const gap = rivers.length > 8 ? 10 : rivers.length > 6 ? 12 : 16;
  const avail = cover.height - mastheadH;
  const rowH = Math.max(56, Math.min(Math.round(104 * cover.k), (avail - gap * Math.max(0, rivers.length - 1)) / Math.max(1, rivers.length)));

  return render(
    <CoverPage cover={cover}>
      <CoverMasthead cover={cover} label={LABELS.riverReport} title={headline} subtitle={today} otter={otter} />
      <div style={{ display: 'flex', flexDirection: 'column', gap, width: '100%' }}>
        {rivers.map(([slug, data]) => (
          <CoverRiverRow
            key={slug}
            cover={cover}
            name={riverDisplayShort(slug)}
            conditionCode={data.condition_code}
            gaugeFt={data.gauge_height_ft}
            height={rowH}
          />
        ))}
      </div>
    </CoverPage>,
    size,
  );
}

// ─── Eddy Says report ───────────────────────────────────────────────────────

async function generateHighlightImage(
  riverSlug: string,
  size: Size,
  pins: { id?: string | null; ft?: number | null; condition?: string | null; at?: string | null } = {},
) {
  const supabase = createAdminClient();
  const cover = coverGeometry(size);

  // Pinned path: the post named its exact eddy_update row, so fetch THAT (no
  // expiry filter — Meta may re-crawl days later and the row is still the one
  // the reel was rendered from). Absent → the latest update for the river.
  const select = 'river_slug, condition_code, gauge_height_ft, summary_text, quote_text';
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

  const riverName = riverDisplayLong(riverSlug);
  const conditionCode = (update.condition_code || 'unknown') as ConditionCode;
  const c = cond(conditionCode);
  const snippet = update.summary_text || update.quote_text || '';
  // The subtitle is the post's timestamp, not the crawl's.
  const now = instantParam(pins.at ?? null);
  const cstFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const timestamp = cstFormatter.format(now) + ' CST';
  const otter = await loadOtter(conditionCode);

  return render(
    <CoverPage cover={cover}>
      <CoverMasthead cover={cover} label={LABELS.eddySays} title={riverName} subtitle={timestamp} otter={otter} />
      {snippet ? (
        <CoverQuote cover={cover} text={truncate(snippet, cover.portrait ? 260 : 190)} size={Math.round(40 * cover.k)} caption="Eddy's read" />
      ) : null}
      <CoverSpacer />
      <CoverDock
        cover={cover}
        tiles={[
          ...(update.gauge_height_ft !== null
            ? [{ value: update.gauge_height_ft.toFixed(1), unit: 'FT', label: 'Gauge' }]
            : []),
          { value: condLabel(conditionCode), label: 'Conditions', color: c.solid, compact: true },
        ]}
        cta={CTA.reportBelow}
        ctaAsText
      />
    </CoverPage>,
    size,
  );
}

// ─── Tip / seasonal note ────────────────────────────────────────────────────

async function generateTipImage(contentId: string, size: Size) {
  const supabase = createAdminClient();
  const cover = coverGeometry(size);

  const { data: content } = await supabase
    .from('social_custom_content')
    .select('text, content_type')
    .eq('id', contentId)
    .single();

  if (!content) {
    return NextResponse.json({ error: 'Content not found' }, { status: 404 });
  }

  const tipText = truncate(content.text, cover.portrait ? 360 : 240);
  const typeLabel = content.content_type === 'seasonal' ? LABELS.seasonalNote :
    content.content_type === 'tip' ? LABELS.floatTip :
    content.content_type === 'promo' ? LABELS.announcement : LABELS.fromEddy;
  const otter = await loadOtter('flowing');

  return render(
    <CoverPage cover={cover}>
      <CoverMasthead cover={cover} label={typeLabel} title="A note from Eddy" otter={otter} />
      <CoverQuote cover={cover} text={tipText} size={Math.round((tipText.length > 200 ? 40 : 48) * cover.k)} />
      <CoverSpacer />
      <CoverDock cover={cover} detail="Live levels for every Ozark river" cta={CTA.levels} />
    </CoverPage>,
    size,
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
  } = {},
) {
  const supabase = createAdminClient();
  const cover = coverGeometry(size);

  // Pinned path: post-context baked the best bet it showed in the reel —
  // river, condition, reading, weather chip, bets count, rain note — so this
  // render cannot re-pick a different river when Meta fetches it later.
  const best: ForecastBest | null =
    pins.river && pins.condition
      ? {
          river_slug: pins.river,
          condition_code: pins.condition,
          gauge_height_ft: pins.ft ?? null,
          weatherLabel: ogWeatherLabel(pins.weather ?? null),
          betCount: Math.max(1, pins.bets ?? 1),
          usingFallback: !!pins.rain,
        }
      : await liveForecastBest(supabase);

  const bestName = best ? riverDisplayShort(best.river_slug) : '';
  const bestWeather = best ? best.weatherLabel : '';
  const usingFallback = best?.usingFallback ?? false;
  const photo = best
    ? ((await loadBackgroundDataUri(supabase, 'forecast')) ??
       (await loadRiverPhotoDataUri(supabase, best.river_slug)))
    : null;
  const otter = await loadOtter(best?.condition_code ?? 'flowing');

  if (!best) {
    return render(
      <CoverPage cover={cover}>
        <CoverMasthead cover={cover} label={LABELS.weekendForecast} title="No floatable rivers" subtitle="Right now — check back after the rain" otter={otter} />
      </CoverPage>,
      size,
    );
  }

  const c = cond(best.condition_code);
  return render(
    <CoverPage cover={cover}>
      <CoverMasthead
        cover={cover}
        label={LABELS.weekendForecast}
        title={bestName}
        subtitle={usingFallback ? 'Best bet this weekend — rain likely' : 'Best bet this weekend'}
        otter={otter}
      />
      {photo ? <CoverPhotoCard cover={cover} dataUri={photo} height={cover.portrait ? 440 : 300} /> : null}
      <CoverSpacer />
      <CoverDock
        cover={cover}
        tiles={[
          { value: condLabel(best.condition_code), label: 'Conditions', color: c.solid, compact: true },
          ...(best.gauge_height_ft !== null ? [{ value: best.gauge_height_ft.toFixed(1), unit: 'FT', label: 'Gauge' }] : []),
          ...(best.betCount > 1 ? [{ value: String(best.betCount), label: 'Best bets' }] : []),
        ]}
        detail={bestWeather || undefined}
        cta={CTA.levels}
      />
    </CoverPage>,
    size,
  );
}

// ---------------------------------------------------------------------------
// Float Pick thumbnail — the live, condition-aware section
// ---------------------------------------------------------------------------
async function generateSectionImage(
  size: Size,
  params?: { river?: string | null; putInMile?: number | null; takeOutMile?: number | null; condition?: string | null },
) {
  const supabase = createAdminClient();
  const cover = coverGeometry(size);

  let section: Section | null = null;
  let condition = 'flowing';

  // Preferred path: the post baked the exact section + condition into the URL,
  // so render THAT float (matching the reel) instead of re-picking. The unique
  // URL also defeats Meta's by-URL OG-image cache, which previously served a
  // stale cover from an earlier post.
  if (params?.river && params.putInMile != null && params.takeOutMile != null) {
    section = await findSection(supabase, params.river, params.putInMile, params.takeOutMile);
    if (section) condition = params.condition || 'flowing';
  }

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
    condition = overlaid.find((u) => u.river_slug === section!.riverSlug)?.condition_code || 'flowing';
  }

  const c = cond(condition);
  const photo =
    (await loadBackgroundDataUri(supabase, section.riverSlug)) ??
    (await loadRiverPhotoDataUri(supabase, section.riverSlug));
  const otter = await loadOtter(condition);
  // Same float-time model as the reel (canoeHours — the planner's speeds).
  const hoursToday = canoeHours(section.distanceMi, condition as ConditionCode);

  return render(
    <CoverPage cover={cover}>
      <CoverMasthead
        cover={cover}
        label={LABELS.floatPick}
        title={section.riverName}
        subtitle={`${section.putInName} to ${section.takeOutName}`}
        otter={otter}
      />
      {photo ? <CoverPhotoCard cover={cover} dataUri={photo} height={cover.portrait ? 440 : 300} /> : null}
      <CoverSpacer />
      <CoverDock
        cover={cover}
        tiles={[
          ...(hoursToday > 0 ? [{ value: `~${hoursToday.toFixed(1)}`, unit: 'HRS', label: 'Float time' }] : []),
          { value: section.distanceMi.toFixed(1), unit: 'MI', label: 'Distance' },
          { value: condLabel(condition), label: 'Conditions', color: c.solid, compact: true },
        ]}
        cta={CTA.plan}
      />
    </CoverPage>,
    size,
  );
}

// ---------------------------------------------------------------------------
// Float Pick thumbnail — the evergreen favourite. SAME series label as the
// live pick (the caption says "Float Pick", so must the art); the guide's
// section name as the tagline, difficulty in place of the live condition.
// ---------------------------------------------------------------------------
async function generateFavoriteImage(
  size: Size,
  params: { river?: string | null; fromSlug?: string | null; toSlug?: string | null },
) {
  const supabase = createAdminClient();
  const cover = coverGeometry(size);

  // Preferred path: the post baked the exact endpoints into the URL, so render
  // THAT float (matching the reel). Fall back to today's rotation if absent.
  let fav: FavoriteFloat | null = null;
  if (params.river && params.fromSlug && params.toSlug) {
    fav = await findFavoriteFloat(supabase, params.river, params.fromSlug, params.toSlug);
  }
  if (!fav) fav = await pickFavoriteFloat(supabase);
  if (!fav) {
    return NextResponse.json({ error: 'No favorite float available' }, { status: 404 });
  }

  // Real guide photography in the photo card (matches the reel). Inlined as a
  // data URI because Satori can't lazy-load remote images; a dead/slow URL
  // degrades to no photo card rather than failing the cover.
  // Prefer the cached AI cover background; then the guide section's own photo;
  // then the river's guide hero photo.
  let photo = await loadBackgroundDataUri(supabase, fav.riverSlug);
  if (!photo && fav.photoUrl) {
    try {
      photo = await loadImageAsDataUri(fav.photoUrl);
    } catch {
      // fall through to the river hero
    }
  }
  if (!photo) photo = await loadRiverPhotoDataUri(supabase, fav.riverSlug);
  const otter = await loadOtter('flowing');
  const hoursTypical = canoeHours(fav.distanceMi, 'flowing');

  return render(
    <CoverPage cover={cover}>
      <CoverMasthead cover={cover} label={LABELS.floatPick} title={fav.riverName} subtitle={fav.tagline || `${fav.putInName} to ${fav.takeOutName}`} otter={otter} />
      {photo ? <CoverPhotoCard cover={cover} dataUri={photo} height={cover.portrait ? 440 : 300} /> : null}
      <CoverSpacer />
      <CoverDock
        cover={cover}
        tiles={[
          ...(hoursTypical > 0 ? [{ value: `~${hoursTypical.toFixed(1)}`, unit: 'HRS', label: 'Float time' }] : []),
          { value: fav.distanceMi.toFixed(1), unit: 'MI', label: 'Distance' },
          { value: fav.difficulty ? `Class ${fav.difficulty}` : 'Favorite', label: fav.difficulty ? 'Difficulty' : 'Conditions', color: colors.secondary[600], compact: true },
        ]}
        detail={fav.tagline ? `${fav.putInName} to ${fav.takeOutName}` : undefined}
        cta={CTA.plan}
      />
    </CoverPage>,
    size,
  );
}

// ---------------------------------------------------------------------------
// Clip cover — the still shown as a clip Reel's grid thumbnail. Clips have no
// OG cover otherwise, so Instagram falls back to the video's first frame.
// Mirrors the ClipReel framing: "On the Water" pill + river name, the river's
// art in the photo card. Tier-2 (no river) → "Ozark Paddling".
// ---------------------------------------------------------------------------
async function generateClipImage(
  size: Size,
  params: { river?: string | null; creator?: string | null },
) {
  const supabase = createAdminClient();
  const cover = coverGeometry(size);

  const riverSlug = params.river || null;
  let riverName = 'Ozark Paddling';
  if (riverSlug) {
    const { data: river } = await supabase.from('rivers').select('name').eq('slug', riverSlug).maybeSingle();
    riverName = river?.name || riverDisplayLong(riverSlug);
  }
  const creator = (params.creator || '').trim();

  const photo =
    (await loadBackgroundDataUri(supabase, riverSlug)) ??
    (await loadRiverPhotoDataUri(supabase, riverSlug));
  const otter = await loadOtter('flowing');

  return render(
    <CoverPage cover={cover}>
      <CoverMasthead cover={cover} label={LABELS.clip} title={riverName} subtitle={creator !== '' ? `Clip via ${creator}` : undefined} otter={otter} />
      {photo ? <CoverPhotoCard cover={cover} dataUri={photo} height={cover.portrait ? 520 : 340} /> : null}
      <CoverSpacer />
      <CoverDock cover={cover} detail="Real water, real paddlers" cta={riverSlug ? CTA.plan : CTA.find} />
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
  const cover = coverGeometry(size);
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
  const range =
    trend.sevenDayMinFt !== null && trend.sevenDayMaxFt !== null
      ? `${trend.sevenDayMinFt.toFixed(1)}-${trend.sevenDayMaxFt.toFixed(1)}`
      : null;

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
        tiles={[
          { value: trend.currentHeightFt !== null ? trend.currentHeightFt.toFixed(1) : '—', unit: 'FT', label: 'Right now' },
          { value: `${deltaSign}${deltaAbs}`, unit: 'FT', label: '7-day change', color: meta.color },
          { value: range ?? '—', unit: range ? 'FT' : undefined, label: 'Week range', compact: true },
        ]}
        cta={CTA.chart}
      />
    </CoverPage>,
    size,
  );
}

// ---------------------------------------------------------------------------
// Condition-change Warning thumbnail — fired when a river crosses from
// flowing into high / dangerous water. The SEVERITY SURFACE: the dark tone
// washed toward the condition colour, the danger art under a scrim, the
// numeral in Geist Mono — the same look as the alert reel.
// ---------------------------------------------------------------------------
const CONDITION_DISPLAY: Record<string, string> = {
  flowing: 'Flowing',
  good: 'Good',
  low: 'Low',
  too_low: 'Too low',
  high: 'High',
  dangerous: 'Dangerous',
  unknown: 'Unknown',
};

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
  const cover = coverGeometry(size, 'dark');
  const s = SURFACES.dark;

  const { data: rawUpdate } = await supabase
    .from('eddy_updates')
    .select('river_slug, condition_code, gauge_height_ft')
    .eq('river_slug', riverSlug)
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const riverName = riverDisplayLong(riverSlug);

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
  const { severityLabel, cta: actionCta } = isRecovery
    ? recoveryCopy(newCondition, riverName)
    : warningCopy(newCondition, riverName);
  // Warning covers use the generic 'danger' art; recovery ("all clear") covers
  // use the river's own calm art — mirrors the reel's background selection in
  // condition-alerts.ts so the cover/reel pair reads as one piece.
  const photo = await loadBackgroundDataUri(supabase, isRecovery ? riverSlug : 'danger');
  const otter = await loadOtter(newCondition);

  // Rate-of-rise/fall pill (e.g. "▲ up 2.4 ft in 6h"). Direction inferred from
  // the phrase; drawn in the condition colour.
  const riseArrow = riseText ? (/down/i.test(riseText) ? '▼' : '▲') : '';
  const prev = fromCondition ? cond(fromCondition) : null;

  return render(
    <CoverPage cover={cover} severity={c.solid} photo={photo} scrim={isRecovery ? MEDIA_SCRIM.neutral : MEDIA_SCRIM.warning}>
      <CoverMasthead
        cover={cover}
        label={severityLabel}
        labelFill={c.solid}
        title={riverName}
        otter={otter}
        subtitleNode={
          fromCondition && prev ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontFamily: DISPLAY, fontWeight: 600, color: prev.solid }}>{CONDITION_DISPLAY[fromCondition] || fromCondition}</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: s.inkMuted }}>→</span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 600, color: c.solid }}>{CONDITION_DISPLAY[newCondition] || newCondition}</span>
            </div>
          ) : undefined
        }
      />

      {/* The reading — instrument numerals, condition-coloured */}
      {gaugeFt !== null ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span style={{ fontFamily: MONO, fontSize: Math.round(150 * cover.k), fontWeight: 700, color: c.solid, lineHeight: 1, letterSpacing: -4 }}>
            {gaugeFt.toFixed(1)}
          </span>
          <span style={{ fontFamily: MONO, fontSize: Math.round(48 * cover.k), fontWeight: 700, color: s.inkMuted }}>ft right now</span>
        </div>
      ) : null}

      {riseText ? (
        <div style={{ display: 'flex' }}>
          <CoverPill cover={cover} fill={c.solid} size={Math.round(30 * cover.k)}>
            <span style={{ fontFamily: MONO }}>{riseArrow}</span>
            <span style={{ marginLeft: 12, textTransform: 'none', letterSpacing: 0 }}>{riseText}</span>
          </CoverPill>
        </div>
      ) : null}

      <CoverSpacer />
      <CoverDock
        cover={cover}
        accent={c.solid}
        tiles={[
          ...(gaugeFt !== null ? [{ value: gaugeFt.toFixed(1), unit: 'FT', label: 'Gauge' }] : []),
          { value: condLabel(newCondition), label: 'Conditions', color: c.solid, compact: true },
        ]}
        detail={actionCta}
        detailColor={c.solid}
        cta={CTA.gauge}
        ctaFill={c.solid}
      />
    </CoverPage>,
    size,
  );
}

// ---------------------------------------------------------------------------
// Storm-digest cover — fired when several rivers rise at once (batch alert).
// A compact list of the affected rivers, each with its live condition pill,
// on the same severity surface as the single-river warning cover.
// `riversParam` is a comma-separated list of `slug:condition` pairs, e.g.
//   current:dangerous,meramec:high,niangua:high
// ---------------------------------------------------------------------------
async function generateStormImage(size: Size, riversParam: string | null) {
  const cover = coverGeometry(size, 'dark');
  const high = cond('high');

  // Parse `slug:condition` pairs; keep up to 5 so the list stays legible.
  const rivers = (riversParam || '')
    .split(',')
    .map((pair) => {
      const [slug, condition] = pair.split(':');
      return { slug: (slug || '').trim(), condition: (condition || '').trim() };
    })
    .filter((r) => r.slug !== '')
    .slice(0, 5);
  const worst = rivers.some((r) => r.condition === 'dangerous') ? cond('dangerous') : high;
  const otter = await loadOtter(worst === high ? 'high' : 'dangerous');
  const rowH = cover.portrait ? 104 : 84;

  return render(
    <CoverPage cover={cover} severity={worst.solid}>
      <CoverMasthead
        cover={cover}
        label={LABELS.riversRising}
        labelFill={worst.solid}
        title="Multiple rivers rising"
        subtitle="Levels are climbing across the Ozarks"
        otter={otter}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        {rivers.map((r) => (
          <CoverRiverRow key={r.slug} cover={cover} name={riverDisplayLong(r.slug)} conditionCode={r.condition} gaugeFt={null} height={rowH} accent={cond(r.condition).solid} />
        ))}
      </div>
      <CoverSpacer />
      <CoverDock cover={cover} accent={worst.solid} detail="Do not float until levels drop" detailColor={worst.solid} cta={CTA.levels} ctaFill={worst.solid} />
    </CoverPage>,
    size,
  );
}
