// src/app/api/og/social/route.tsx
// Generates square (1080x1080) or portrait (1080x1920) OG images for social posts.
// Supports:
//   ?type=digest                       — all rivers, daily digest thumbnail
//   ?type=highlight&river=slug         — single river highlight thumbnail
//   ?type=tip&id=uuid                  — custom content snippet thumbnail
//   ?type=forecast                     — weekly forecast: top 3 floatable rivers
//   ?type=section                      — section guide: float of the week
//   ?type=favorite&river=&fromSlug=&toSlug= — Eddy's Favorite Float (evergreen, from guides)
//   ?type=trend                        — 7-day trend: river with biggest gauge move
//   ?type=warning&river=slug&from=...  — condition-change warning (flowing → high/dangerous)

import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFredokaFont, loadConditionOtter, loadImageAsDataUri } from '@/lib/og/fonts';
import {
  hasRainComing,
  weatherChip,
  RAIN_CHANCE_THRESHOLD,
  type WeatherSummary,
  type WeatherChip,
} from '@/lib/weather/openweather';
import { getStatusStyles, getStatusGradient, BRAND_COLORS } from '@/lib/og/colors';
import {
  WEEKEND_FLOATABLE as FORECAST_FLOATABLE,
  WEEKEND_SEVERITY as FORECAST_SEVERITY,
} from '@shared/condition-system';
import { CONDITION_LABELS } from '@/constants';
import type { ConditionCode } from '@/lib/og/types';
import { pickSectionForRivers, findSection, type Section } from '@/lib/social/section-picker';
import { pickFavoriteFloat, findFavoriteFloat, type FavoriteFloat } from '@/lib/social/favorite-floats';
import { canoeHours } from '@/lib/social/post-types';
import { pickNotableTrend } from '@/lib/social/trend-picker';
import { buildLiveConditionsMap, overlayLiveConditions } from '@/lib/social/live-conditions';

export const revalidate = 300;

// Cache headers so Vercel's CDN caches generated images for Meta's crawlers
const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
};

function getSize(platform: string | null): { width: number; height: number } {
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

/** A river's published-guide hero photo as a data URI, for compositing behind a
 *  cover (Satori can't lazy-load remote images). Null when there's no guide
 *  photo, so the caller keeps its solid-gradient background. */
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
 *  background; callers fall back to a guide photo, then the solid gradient. */
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

/** Full-bleed photo + legibility scrim layers for a cover (empty when no photo,
 *  so the card's gradient shows through). Shared by Favorite / Section / Forecast
 *  so the three read as one photo-led series. */
function photoLayers(dataUri: string | null, size: { width: number; height: number }) {
  if (!dataUri) return [];
  return [
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key="bg"
      src={dataUri}
      width={size.width}
      height={size.height}
      alt=""
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />,
    <div
      key="scrim"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background:
          'linear-gradient(160deg, rgba(13,42,44,0.84) 0%, rgba(26,61,64,0.7) 50%, rgba(13,42,44,0.92) 100%)',
      }}
    />,
  ];
}

/** Largest cover title that still fits the safe zone, scaled by name length. */
function heroFontSize(name: string, isPortrait: boolean): number {
  const n = (name || '').length;
  if (isPortrait) return n <= 10 ? 164 : n <= 14 ? 140 : n <= 17 ? 122 : 106;
  return n <= 10 ? 128 : n <= 14 ? 110 : n <= 17 ? 96 : 84;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');
  const size = getSize(platform);

  try {
    const type = searchParams.get('type') || 'digest';
    const riverSlug = searchParams.get('river');
    const contentId = searchParams.get('id');

    if (type === 'highlight' && riverSlug) {
      return await generateHighlightImage(riverSlug, size);
    }

    if (type === 'tip' && contentId) {
      return await generateTipImage(contentId, size);
    }

    if (type === 'forecast') {
      return await generateForecastImage(size);
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
      return await generateTrendImage(size);
    }

    if (type === 'warning' && riverSlug) {
      const fromCondition = searchParams.get('from') || undefined;
      return await generateWarningImage(riverSlug, fromCondition, size);
    }

    return await generateDigestImage(size);
  } catch (err) {
    console.error('[OG/Social] Image generation failed:', err);
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            background: '#1A3D40',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <span style={{ fontSize: 64, fontWeight: 700, color: '#E8734A' }}>
            Eddy Says
          </span>
          <span style={{ fontSize: 32, color: 'rgba(255,255,255,0.6)', marginTop: 16 }}>
            River Conditions
          </span>
          <span style={{ fontSize: 24, color: 'rgba(255,255,255,0.3)', marginTop: 32 }}>
            eddy.guide
          </span>
        </div>
      ),
      { ...size }
    );
  }
}

async function generateDigestImage(size: { width: number; height: number }) {
  const supabase = createAdminClient();
  const fonts = loadFredokaFont();
  const isPortrait = size.height > size.width;

  // Pull live gauge-derived conditions so the digest never lags behind the
  // hourly gauge feed. (eddy_updates.condition_code is frozen daily.)
  const liveMap = await buildLiveConditionsMap(supabase);
  const rivers: Array<[string, { condition_code: string; gauge_height_ft: number | null }]> =
    Array.from(liveMap.entries()).map(([slug, live]) => [
      slug,
      { condition_code: live.condition_code, gauge_height_ft: live.gauge_height_ft },
    ]);
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Load otter
  let otterImage: string | null = null;
  try {
    otterImage = await loadConditionOtter('flowing');
  } catch {
    // Skip otter if fetch fails
  }

  const RIVER_DISPLAY: Record<string, string> = {
    meramec: 'Meramec',
    current: 'Current',
    'eleven-point': 'Eleven Point',
    'jacks-fork': 'Jacks Fork',
    niangua: 'Niangua',
    'big-piney': 'Big Piney',
    huzzah: 'Huzzah',
    courtois: 'Courtois',
  };

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: '#1A3D40',
          padding: '56px',
          justifyContent: isPortrait ? 'center' : 'flex-start',
          position: 'relative',
        }}
      >
        {/* Header */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: 72,
            fontWeight: 600,
            color: BRAND_COLORS.accentCoral,
            lineHeight: 1,
            letterSpacing: -1,
            marginBottom: 8,
          }}
        >
          River Report
        </span>
        <span
          style={{
            fontSize: 32,
            color: 'rgba(255,255,255,0.6)',
            marginBottom: 40,
          }}
        >
          {today}
        </span>

        {/* River grid */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
          }}
        >
          {rivers.map(([slug, data]) => {
            const statusStyles = getStatusStyles(data.condition_code as ConditionCode);
            const name = RIVER_DISPLAY[slug] || slug;
            return (
              <div
                key={slug}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: '48%',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: 16,
                  padding: '28px 32px',
                  borderLeft: `4px solid ${statusStyles.solid}`,
                }}
              >
                <span
                  style={{
                    fontSize: 36,
                    fontWeight: 700,
                    color: 'white',
                    marginBottom: 8,
                  }}
                >
                  {name}
                </span>
                <span
                  style={{
                    fontSize: 28,
                    color: statusStyles.solid,
                    fontWeight: 600,
                  }}
                >
                  {statusStyles.label}
                </span>
                {data.gauge_height_ft !== null && (
                  <span
                    style={{
                      fontSize: 24,
                      color: 'rgba(255,255,255,0.5)',
                    }}
                  >
                    {data.gauge_height_ft.toFixed(1)} ft
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Branding footer */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: 32,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.4)',
            ...(isPortrait
              ? { position: 'absolute' as const, bottom: 56, left: 56 }
              : { marginTop: 24 }),
          }}
        >
          eddy.guide
        </span>

        {/* Otter */}
        {otterImage && (
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: 24,
              right: 32,
              opacity: 0.85,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={otterImage}
              width={200}
              height={200}
              alt=""
              style={{ objectFit: 'contain' }}
            />
          </div>
        )}

        {/* Bottom gradient bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: `linear-gradient(90deg, ${BRAND_COLORS.greenTreeline} 0%, ${BRAND_COLORS.accentCoral} 50%, ${BRAND_COLORS.bluewater} 100%)`,
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts,
      headers: CACHE_HEADERS,
    }
  );
}

async function generateHighlightImage(riverSlug: string, size: { width: number; height: number }) {
  const supabase = createAdminClient();
  const fonts = loadFredokaFont();

  // Fetch latest update for this river
  const { data: rawUpdate } = await supabase
    .from('eddy_updates')
    .select('river_slug, condition_code, gauge_height_ft, summary_text, quote_text')
    .eq('river_slug', riverSlug)
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rawUpdate) {
    return NextResponse.json({ error: 'No update found for river' }, { status: 404 });
  }

  // Overlay live gauge data so the headline + badge match reality, and drop
  // AI prose if the live condition has crossed into a different bucket
  // (otherwise we'd render "sweet spot" copy next to a "High Water" badge).
  const [update] = await overlayLiveConditions(supabase, [rawUpdate]);

  const RIVER_DISPLAY: Record<string, string> = {
    meramec: 'Meramec River',
    current: 'Current River',
    'eleven-point': 'Eleven Point River',
    'jacks-fork': 'Jacks Fork River',
    niangua: 'Niangua River',
    'big-piney': 'Big Piney River',
    huzzah: 'Huzzah Creek',
    courtois: 'Courtois Creek',
  };

  const riverName = RIVER_DISPLAY[riverSlug] || riverSlug;
  const conditionCode = (update.condition_code || 'unknown') as ConditionCode;
  const statusStyles = getStatusStyles(conditionCode);
  const [gradientStart, gradientEnd] = getStatusGradient(conditionCode);
  const conditionLabel = CONDITION_LABELS[conditionCode as keyof typeof CONDITION_LABELS] || 'Unknown';
  const snippet = update.summary_text || update.quote_text || '';
  const isPortrait = size.height > size.width;
  const now = new Date();
  const cstFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const timestamp = cstFormatter.format(now) + ' CST';

  // Load otter
  let otterImage: string | null = null;
  try {
    otterImage = await loadConditionOtter(conditionCode);
  } catch {
    // Skip otter
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: '#1A3D40',
          padding: isPortrait ? '72px' : '64px',
          justifyContent: isPortrait ? 'center' : 'flex-start',
          position: 'relative',
        }}
      >
        {/* "Eddy Says" label */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 36 : 32,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase',
            letterSpacing: 3,
            marginBottom: 8,
          }}
        >
          Eddy Says
        </span>

        {/* Timestamp */}
        <span
          style={{
            fontSize: isPortrait ? 30 : 26,
            color: 'rgba(255,255,255,0.5)',
            marginBottom: 20,
          }}
        >
          {timestamp}
        </span>

        {/* River name */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait
              ? (riverName.length > 18 ? 96 : 112)
              : (riverName.length > 18 ? 88 : 104),
            fontWeight: 600,
            color: BRAND_COLORS.accentCoral,
            lineHeight: 1,
            letterSpacing: -2,
            marginBottom: 40,
          }}
        >
          {riverName}
        </span>

        {/* Condition badge + gauge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              backgroundColor: statusStyles.bg,
              border: `2px solid ${statusStyles.border}`,
              borderRadius: 100,
              padding: isPortrait ? '18px 40px' : '16px 36px',
            }}
          >
            <div
              style={{
                width: isPortrait ? 20 : 18,
                height: isPortrait ? 20 : 18,
                borderRadius: '50%',
                backgroundColor: statusStyles.solid,
              }}
            />
            <span
              style={{
                fontSize: isPortrait ? 40 : 36,
                fontWeight: 700,
                color: statusStyles.text,
              }}
            >
              {conditionLabel}
            </span>
          </div>

          {update.gauge_height_ft !== null && (
            <span
              style={{
                fontSize: isPortrait ? 64 : 56,
                fontWeight: 700,
                color: 'white',
              }}
            >
              {update.gauge_height_ft.toFixed(1)} ft
            </span>
          )}
        </div>

        {/* Quote snippet */}
        {snippet && (
          <span
            style={{
              fontSize: isPortrait ? 44 : 42,
              color: 'rgba(255,255,255,0.8)',
              lineHeight: 1.4,
              maxWidth: isPortrait ? '100%' : (otterImage ? 700 : '100%'),
            }}
          >
            {truncate(snippet, isPortrait ? 400 : 300)}
          </span>
        )}

        {/* CTA — portrait (Instagram Stories) only */}
        {isPortrait && (
          <span
            style={{
              fontFamily: 'Fredoka',
              fontSize: 38,
              fontWeight: 600,
              color: BRAND_COLORS.accentCoral,
              opacity: 0.85,
              position: 'absolute',
              bottom: 120,
              left: 72,
            }}
          >
            Plan your float at eddy.guide
          </span>
        )}

        {/* Footer */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 32 : 28,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.35)',
            position: 'absolute',
            bottom: isPortrait ? 72 : 64,
            left: isPortrait ? 72 : 64,
          }}
        >
          eddy.guide
        </span>

        {/* Otter — absolute positioned */}
        {otterImage && (
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: isPortrait ? 48 : 40,
              right: isPortrait ? 48 : 40,
              opacity: 0.9,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={otterImage}
              width={isPortrait ? 340 : 240}
              height={isPortrait ? 340 : 240}
              alt=""
              style={{ objectFit: 'contain' }}
            />
          </div>
        )}

        {/* Bottom gradient bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: `linear-gradient(90deg, ${gradientStart} 0%, ${BRAND_COLORS.accentCoral} 50%, ${gradientEnd} 100%)`,
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts,
      headers: CACHE_HEADERS,
    }
  );
}

async function generateTipImage(contentId: string, size: { width: number; height: number }) {
  const supabase = createAdminClient();
  const fonts = loadFredokaFont();

  const { data: content } = await supabase
    .from('social_custom_content')
    .select('text, content_type')
    .eq('id', contentId)
    .single();

  if (!content) {
    return NextResponse.json({ error: 'Content not found' }, { status: 404 });
  }

  const isPortrait = size.height > size.width;
  const tipText = truncate(content.text, isPortrait ? 400 : 280);
  const typeLabel = content.content_type === 'seasonal' ? 'Seasonal Note' :
    content.content_type === 'tip' ? 'Float Tip' :
    content.content_type === 'promo' ? 'Announcement' : 'From Eddy';

  // Load otter
  let otterImage: string | null = null;
  try {
    otterImage = await loadConditionOtter('flowing');
  } catch {
    // Skip otter
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: '#1A3D40',
          padding: isPortrait ? '72px' : '64px',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Type label */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 36 : 32,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase',
            letterSpacing: 3,
            marginBottom: isPortrait ? 28 : 24,
          }}
        >
          {typeLabel}
        </span>

        {/* Tip text */}
        <span
          style={{
            fontSize: isPortrait ? 52 : 46,
            color: 'white',
            lineHeight: 1.4,
            maxWidth: otterImage ? (isPortrait ? 700 : 750) : '100%',
          }}
        >
          {tipText}
        </span>

        {/* Branding */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 32 : 28,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.35)',
            position: 'absolute',
            bottom: isPortrait ? 72 : 64,
            left: isPortrait ? 72 : 64,
          }}
        >
          eddy.guide
        </span>

        {/* Otter */}
        {otterImage && (
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: isPortrait ? 48 : 40,
              right: isPortrait ? 48 : 40,
              opacity: 0.9,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={otterImage}
              width={isPortrait ? 280 : 200}
              height={isPortrait ? 280 : 200}
              alt=""
              style={{ objectFit: 'contain' }}
            />
          </div>
        )}

        {/* Bottom gradient bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: `linear-gradient(90deg, ${BRAND_COLORS.greenTreeline} 0%, ${BRAND_COLORS.accentCoral} 50%, ${BRAND_COLORS.bluewater} 100%)`,
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts,
      headers: CACHE_HEADERS,
    }
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

async function generateForecastImage(size: { width: number; height: number }) {
  const supabase = createAdminClient();
  const fonts = loadFredokaFont();
  const isPortrait = size.height > size.width;

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

  const RIVER_DISPLAY: Record<string, string> = {
    meramec: 'Meramec',
    current: 'Current',
    'eleven-point': 'Eleven Point',
    'jacks-fork': 'Jacks Fork',
    niangua: 'Niangua',
    'big-piney': 'Big Piney',
    huzzah: 'Huzzah',
    courtois: 'Courtois',
  };

  // Cover features only the single best bet (best condition, rain-free if any).
  const best = top[0] || null;
  const bestName = best ? (RIVER_DISPLAY[best.river_slug] || best.river_slug) : '';
  const bestStyles = best ? getStatusStyles(best.condition_code as ConditionCode) : null;
  const bestCondLabel = best
    ? (CONDITION_LABELS[best.condition_code as keyof typeof CONDITION_LABELS] || bestStyles!.label)
    : '';
  const bestWeather = best ? ogWeatherLabel(weatherChip(best.weather)) : '';
  const bestGauge = best && best.gauge_height_ft !== null
    ? `${bestWeather ? ' · ' : ''}${best.gauge_height_ft.toFixed(1)} ft`
    : '';
  const photoDataUri = best
    ? ((await loadBackgroundDataUri(supabase, 'forecast')) ??
       (await loadRiverPhotoDataUri(supabase, best.river_slug)))
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: `linear-gradient(160deg, #0d2a2c 0%, #1A3D40 55%, #0d2a2c 100%)`,
          padding: isPortrait ? '120px 72px' : '72px 64px',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {photoLayers(photoDataUri, size)}

        {/* Eyebrow */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 38 : 30,
            fontWeight: 600,
            color: BRAND_COLORS.accentCoral,
            textTransform: 'uppercase',
            letterSpacing: 6,
            marginBottom: 16,
          }}
        >
          Best Bets Right Now
        </span>

        {best && bestStyles ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            {/* Hero: the single best river */}
            <span
              style={{
                fontFamily: 'Fredoka',
                fontSize: heroFontSize(bestName, isPortrait),
                fontWeight: 700,
                color: '#fff',
                lineHeight: 0.92,
                letterSpacing: -3,
                textShadow: '0 2px 16px rgba(0,0,0,0.5)',
                marginBottom: isPortrait ? 36 : 24,
              }}
            >
              {bestName}
            </span>

            {/* Fact 1 — condition */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                backgroundColor: bestStyles.bg,
                border: `2px solid ${bestStyles.border}`,
                borderRadius: 100,
                padding: isPortrait ? '18px 40px' : '14px 32px',
                marginBottom: isPortrait ? 28 : 18,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: isPortrait ? 22 : 18,
                  height: isPortrait ? 22 : 18,
                  borderRadius: '50%',
                  backgroundColor: bestStyles.solid,
                }}
              />
              <span style={{ fontFamily: 'Fredoka', fontSize: isPortrait ? 44 : 34, fontWeight: 700, color: bestStyles.text }}>
                {bestCondLabel}
              </span>
            </div>

            {/* Fact 2 — weather + gauge */}
            {(bestWeather || bestGauge) && (
              <span style={{ fontFamily: 'Fredoka', fontSize: isPortrait ? 36 : 28, color: 'rgba(255,255,255,0.75)' }}>
                {bestWeather}{bestGauge}
              </span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: isPortrait ? 44 : 32, color: 'rgba(255,255,255,0.55)' }}>
            No floatable rivers right now.
          </span>
        )}

        {/* Footer */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 32 : 26,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.35)',
            position: 'absolute',
            bottom: isPortrait ? 120 : 48,
            left: isPortrait ? 72 : 64,
          }}
        >
          eddy.guide
        </span>

        {/* Bottom gradient bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: `linear-gradient(90deg, ${BRAND_COLORS.bluewater}, ${BRAND_COLORS.accentCoral}, ${BRAND_COLORS.greenTreeline})`,
          }}
        />
      </div>
    ),
    { ...size, fonts, headers: CACHE_HEADERS }
  );
}

// ---------------------------------------------------------------------------
// Section Guide thumbnail
// ---------------------------------------------------------------------------
async function generateSectionImage(
  size: { width: number; height: number },
  params?: { river?: string | null; putInMile?: number | null; takeOutMile?: number | null; condition?: string | null },
) {
  const supabase = createAdminClient();
  const fonts = loadFredokaFont();
  const isPortrait = size.height > size.width;

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

  const styles = getStatusStyles(condition as ConditionCode);
  const photoDataUri =
    (await loadBackgroundDataUri(supabase, section.riverSlug)) ??
    (await loadRiverPhotoDataUri(supabase, section.riverSlug));

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: `linear-gradient(160deg, #0d2a2c 0%, #1A3D40 50%, #0d2a2c 100%)`,
          padding: isPortrait ? '120px 72px' : '72px 64px',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {photoLayers(photoDataUri, size)}

        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 38 : 30,
            fontWeight: 600,
            color: BRAND_COLORS.accentCoral,
            textTransform: 'uppercase',
            letterSpacing: 6,
            marginBottom: 12,
          }}
        >
          Float of the Day
        </span>

        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: heroFontSize(section.riverName, isPortrait),
            fontWeight: 700,
            color: '#fff',
            lineHeight: 0.92,
            letterSpacing: -3,
            textShadow: '0 2px 16px rgba(0,0,0,0.5)',
            marginBottom: isPortrait ? 44 : 30,
          }}
        >
          {section.riverName}
        </span>

        {/* Put-in only — "Starts at …" replaces the full route card */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: isPortrait ? 48 : 32 }}>
          <div
            style={{
              display: 'flex',
              width: isPortrait ? 20 : 16,
              height: isPortrait ? 20 : 16,
              borderRadius: '50%',
              backgroundColor: BRAND_COLORS.accentCoral,
              boxShadow: `0 0 16px ${BRAND_COLORS.accentCoral}`,
              flexShrink: 0,
            }}
          />
          <span style={{ fontFamily: 'Fredoka', fontSize: isPortrait ? 44 : 34, fontWeight: 600, color: '#fff' }}>
            Starts at {section.putInName}
          </span>
        </div>

        {/* Two facts */}
        <div style={{ display: 'flex', gap: isPortrait ? 64 : 44 }}>
          <StatCell value={`${section.distanceMi.toFixed(1)} mi`} label="Distance" isPortrait={isPortrait} />
          <StatCell value={CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS] || '—'} label="Conditions" color={styles.solid} isPortrait={isPortrait} />
        </div>

        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 32 : 26,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.35)',
            position: 'absolute',
            bottom: isPortrait ? 120 : 48,
            left: 0,
            right: 0,
            textAlign: 'center',
          }}
        >
          eddy.guide
        </span>

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: `linear-gradient(90deg, ${BRAND_COLORS.accentCoral}, ${styles.solid})`,
          }}
        />
      </div>
    ),
    { ...size, fonts, headers: CACHE_HEADERS }
  );
}

// ---------------------------------------------------------------------------
// Eddy's Favorite Float thumbnail — the evergreen, editorial cousin of the
// Section Guide cover. Same route card, neutral water-teal accent, the guide's
// section name as a tagline, and difficulty in place of the live condition.
// ---------------------------------------------------------------------------
async function generateFavoriteImage(
  size: { width: number; height: number },
  params: { river?: string | null; fromSlug?: string | null; toSlug?: string | null },
) {
  const supabase = createAdminClient();
  const fonts = loadFredokaFont();
  const isPortrait = size.height > size.width;

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

  const accent = BRAND_COLORS.bluewater;
  const hours = canoeHours(fav.distanceMi, 'flowing' as ConditionCode);

  // Real guide photography behind the card (matches the reel). Inlined as a data
  // URI because Satori can't lazy-load remote images; a dead/slow URL degrades
  // to the solid-gradient card below rather than failing the cover.
  // Prefer the cached AI cover background; then the guide section's own photo;
  // then the river's guide hero photo. (Solid gradient if all absent.)
  let photoDataUri = await loadBackgroundDataUri(supabase, fav.riverSlug);
  if (!photoDataUri && fav.photoUrl) {
    try {
      photoDataUri = await loadImageAsDataUri(fav.photoUrl);
    } catch {
      // fall through to the river hero / gradient
    }
  }
  if (!photoDataUri) photoDataUri = await loadRiverPhotoDataUri(supabase, fav.riverSlug);

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: `linear-gradient(160deg, #0d2a2c 0%, #1A3D40 50%, #0d2a2c 100%)`,
          padding: isPortrait ? '120px 72px' : '72px 64px',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {photoLayers(photoDataUri, size)}

        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 38 : 30,
            fontWeight: 600,
            color: accent,
            textTransform: 'uppercase',
            letterSpacing: 6,
            marginBottom: 12,
          }}
        >
          Eddy&apos;s Favorite Float
        </span>

        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: heroFontSize(fav.riverName, isPortrait),
            fontWeight: 700,
            color: '#fff',
            lineHeight: 0.92,
            letterSpacing: -3,
            textShadow: '0 2px 16px rgba(0,0,0,0.5)',
            marginBottom: isPortrait ? 44 : 30,
          }}
        >
          {fav.riverName}
        </span>

        {/* Put-in only — "Starts at …" replaces the full route card */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: isPortrait ? 48 : 32 }}>
          <div
            style={{
              display: 'flex',
              width: isPortrait ? 20 : 16,
              height: isPortrait ? 20 : 16,
              borderRadius: '50%',
              backgroundColor: BRAND_COLORS.accentCoral,
              boxShadow: `0 0 16px ${BRAND_COLORS.accentCoral}`,
              flexShrink: 0,
            }}
          />
          <span style={{ fontFamily: 'Fredoka', fontSize: isPortrait ? 44 : 34, fontWeight: 600, color: '#fff' }}>
            Starts at {fav.putInName}
          </span>
        </div>

        {/* Two facts */}
        <div style={{ display: 'flex', gap: isPortrait ? 64 : 44 }}>
          <StatCell value={`${fav.distanceMi.toFixed(1)} mi`} label="Distance" isPortrait={isPortrait} />
          {fav.difficulty ? (
            <StatCell value={`Class ${fav.difficulty}`} label="Difficulty" color={accent} isPortrait={isPortrait} />
          ) : (
            <StatCell value={`${hours.toFixed(1)} hrs`} label="Canoe" isPortrait={isPortrait} />
          )}
        </div>

        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 32 : 26,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.35)',
            position: 'absolute',
            bottom: isPortrait ? 120 : 48,
            left: 0,
            right: 0,
            textAlign: 'center',
          }}
        >
          eddy.guide
        </span>

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: `linear-gradient(90deg, ${BRAND_COLORS.accentCoral}, ${accent})`,
          }}
        />
      </div>
    ),
    { ...size, fonts, headers: CACHE_HEADERS }
  );
}

// ---------------------------------------------------------------------------
// Clip cover — the still shown as a river_highlight Reel's grid thumbnail. Clips
// have no OG cover otherwise, so Instagram falls back to the video's first frame
// (which fades in → black). Mirrors the ClipReel framing: "On the Water" eyebrow
// + river name over the river's AI background. Tier-2 (no river) → "Ozark Paddling".
// ---------------------------------------------------------------------------
async function generateClipImage(
  size: { width: number; height: number },
  params: { river?: string | null; creator?: string | null },
) {
  const supabase = createAdminClient();
  const fonts = loadFredokaFont();
  const isPortrait = size.height > size.width;

  const riverSlug = params.river || null;
  let riverName = 'Ozark Paddling';
  if (riverSlug) {
    const { data: river } = await supabase.from('rivers').select('name').eq('slug', riverSlug).maybeSingle();
    riverName = river?.name || riverSlug;
  }
  const creator = (params.creator || '').trim();

  const photoDataUri =
    (await loadBackgroundDataUri(supabase, riverSlug)) ??
    (await loadRiverPhotoDataUri(supabase, riverSlug));

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: `linear-gradient(160deg, #0d2a2c 0%, #1A3D40 50%, #0d2a2c 100%)`,
          padding: isPortrait ? '120px 72px' : '72px 64px',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {photoLayers(photoDataUri, size)}

        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 38 : 30,
            fontWeight: 600,
            color: BRAND_COLORS.accentCoral,
            textTransform: 'uppercase',
            letterSpacing: 6,
            marginBottom: 12,
          }}
        >
          On the Water
        </span>

        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: heroFontSize(riverName, isPortrait),
            fontWeight: 700,
            color: '#fff',
            lineHeight: 0.92,
            letterSpacing: -3,
            textShadow: '0 2px 16px rgba(0,0,0,0.5)',
            marginBottom: isPortrait ? 28 : 18,
          }}
        >
          {riverName}
        </span>

        {creator !== '' && (
          <span
            style={{
              fontFamily: 'Fredoka',
              fontSize: isPortrait ? 34 : 26,
              color: 'rgba(255,255,255,0.78)',
            }}
          >
            Clip via {creator}
          </span>
        )}

        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 32 : 26,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.35)',
            position: 'absolute',
            bottom: isPortrait ? 120 : 48,
            left: 0,
            right: 0,
            textAlign: 'center',
          }}
        >
          eddy.guide
        </span>

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: `linear-gradient(90deg, ${BRAND_COLORS.greenTreeline}, ${BRAND_COLORS.accentCoral}, ${BRAND_COLORS.bluewater})`,
          }}
        />
      </div>
    ),
    { ...size, fonts, headers: CACHE_HEADERS }
  );
}

function StatCell({
  value,
  label,
  color,
  isPortrait,
}: {
  value: string;
  label: string;
  color?: string;
  isPortrait: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span
        style={{
          fontFamily: 'Fredoka',
          fontSize: isPortrait ? 64 : 48,
          fontWeight: 700,
          color: color || '#fff',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily: 'Fredoka',
          fontSize: isPortrait ? 22 : 18,
          color: 'rgba(255,255,255,0.45)',
          textTransform: 'uppercase',
          letterSpacing: 2,
          marginTop: 6,
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7-Day Trend thumbnail
// ---------------------------------------------------------------------------
async function generateTrendImage(size: { width: number; height: number }) {
  const supabase = createAdminClient();
  const fonts = loadFredokaFont();
  const isPortrait = size.height > size.width;

  const { data: updates } = await supabase
    .from('eddy_updates')
    .select('river_slug, condition_code, weather')
    .neq('river_slug', 'global')
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString());

  type Row = { river_slug: string; condition_code: string; weather?: WeatherSummary | null };
  const rows = (updates || []) as Row[];
  const slugs = Array.from(new Set(rows.map((u) => u.river_slug)));
  const trend = await pickNotableTrend(supabase, { restrictTo: slugs });
  if (!trend) {
    return NextResponse.json({ error: 'No notable trend' }, { status: 404 });
  }
  const wx = ogWeatherLabel(weatherChip(rows.find((u) => u.river_slug === trend.riverSlug)?.weather ?? null));

  const meta =
    trend.direction === 'rising'
      ? { arrow: '▲', label: 'Rising', color: '#10b981' }
      : trend.direction === 'falling'
      ? { arrow: '▼', label: 'Falling', color: '#f97316' }
      : { arrow: '—', label: 'Steady', color: '#84cc16' };
  const deltaSign = trend.deltaFt > 0 ? '+' : trend.deltaFt < 0 ? '−' : '';
  const deltaAbs = Math.abs(trend.deltaFt).toFixed(1);

  // Normalize sparkline coords to an SVG viewBox.
  const CHART_W = isPortrait ? 900 : 820;
  const CHART_H = isPortrait ? 380 : 260;
  const PAD = 30;
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

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: `linear-gradient(160deg, #0d2a2c 0%, #1A3D40 50%, #0d2a2c 100%)`,
          padding: isPortrait ? '120px 72px' : '72px 64px',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 38 : 30,
            fontWeight: 600,
            color: meta.color,
            textTransform: 'uppercase',
            letterSpacing: 6,
            marginBottom: 12,
          }}
        >
          7-Day Trend
        </span>
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 104 : 80,
            fontWeight: 700,
            color: '#fff',
            lineHeight: 0.95,
            letterSpacing: -3,
            marginBottom: isPortrait ? 40 : 28,
          }}
        >
          {trend.riverName}
        </span>

        {wx !== '' && (
          <span
            style={{
              fontFamily: 'Fredoka',
              fontSize: isPortrait ? 30 : 22,
              color: 'rgba(255,255,255,0.6)',
              marginTop: isPortrait ? -28 : -16,
              marginBottom: isPortrait ? 36 : 22,
            }}
          >
            {wx}
          </span>
        )}

        {/* Sparkline */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 24,
            padding: '16px 12px',
            marginBottom: isPortrait ? 40 : 24,
          }}
        >
          <svg width={CHART_W} height={CHART_H} style={{ display: 'block' }}>
            <line
              x1={PAD}
              y1={CHART_H - PAD}
              x2={CHART_W - PAD}
              y2={CHART_H - PAD}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={1}
            />
            {areaD && <path d={areaD} fill={meta.color} fillOpacity={0.18} />}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke={meta.color}
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {points.length > 0 && (
              <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r={12}
                fill={meta.color}
              />
            )}
          </svg>
        </div>

        {/* Delta + range */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isPortrait ? 40 : 32,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              backgroundColor: `${meta.color}22`,
              border: `2px solid ${meta.color}`,
              borderRadius: 999,
              padding: isPortrait ? '18px 36px' : '14px 28px',
            }}
          >
            <span
              style={{
                fontFamily: 'Fredoka',
                fontSize: isPortrait ? 52 : 40,
                fontWeight: 700,
                color: meta.color,
              }}
            >
              {meta.arrow} {meta.label}
            </span>
            <span
              style={{
                fontSize: isPortrait ? 44 : 34,
                fontWeight: 700,
                color: '#fff',
              }}
            >
              {deltaSign}{deltaAbs} ft
            </span>
          </div>
          {trend.sevenDayMinFt !== null && trend.sevenDayMaxFt !== null && (
            <span
              style={{
                fontSize: isPortrait ? 28 : 22,
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              Week range {trend.sevenDayMinFt.toFixed(1)}–{trend.sevenDayMaxFt.toFixed(1)} ft
            </span>
          )}
        </div>

        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 32 : 26,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.35)',
            position: 'absolute',
            bottom: isPortrait ? 120 : 48,
            left: isPortrait ? 72 : 64,
          }}
        >
          eddy.guide
        </span>
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: `linear-gradient(90deg, ${meta.color}, ${BRAND_COLORS.accentCoral})`,
          }}
        />
      </div>
    ),
    { ...size, fonts, headers: CACHE_HEADERS }
  );
}

// ---------------------------------------------------------------------------
// Condition-change Warning thumbnail — fired when a river crosses from
// flowing into high / dangerous water. Designed to stop the scroll: bold red
// or orange accent, WARNING eyebrow, river name, transition arrow, gauge.
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
  size: { width: number; height: number },
) {
  const supabase = createAdminClient();
  const fonts = loadFredokaFont();
  const isPortrait = size.height > size.width;

  const { data: rawUpdate } = await supabase
    .from('eddy_updates')
    .select('river_slug, condition_code, gauge_height_ft')
    .eq('river_slug', riverSlug)
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rawUpdate) {
    return NextResponse.json({ error: 'No update found for river' }, { status: 404 });
  }

  // Overlay live conditions: a warning image must always reflect the current
  // gauge — the whole point of the warning is "right now".
  const [update] = await overlayLiveConditions(supabase, [rawUpdate]);

  const RIVER_DISPLAY: Record<string, string> = {
    meramec: 'Meramec River',
    current: 'Current River',
    'eleven-point': 'Eleven Point River',
    'jacks-fork': 'Jacks Fork River',
    niangua: 'Niangua River',
    'big-piney': 'Big Piney River',
    huzzah: 'Huzzah Creek',
    courtois: 'Courtois Creek',
  };
  const riverName = RIVER_DISPLAY[riverSlug] || riverSlug;
  const newCondition = (update.condition_code || 'high') as ConditionCode;
  const styles = getStatusStyles(newCondition);
  const severityLabel =
    newCondition === 'dangerous' ? 'DANGEROUS' :
    newCondition === 'high' ? 'HIGH WATER' :
    'CAUTION';
  const actionCta =
    newCondition === 'dangerous'
      ? 'Do not float until levels drop'
      : 'Experienced paddlers only';
  const photoDataUri = await loadBackgroundDataUri(supabase, 'danger');

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: `linear-gradient(160deg, #2a0d0d 0%, #1A3D40 60%, #0d2a2c 100%)`,
          padding: isPortrait ? '120px 72px' : '72px 64px',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {photoLayers(photoDataUri, size)}

        {/* Warning eyebrow banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            backgroundColor: styles.bg,
            border: `3px solid ${styles.solid}`,
            borderRadius: 999,
            padding: isPortrait ? '18px 42px' : '14px 32px',
            boxShadow: `0 0 40px ${styles.solid}`,
            alignSelf: 'flex-start',
            marginBottom: isPortrait ? 40 : 28,
          }}
        >
          <span style={{ fontSize: isPortrait ? 56 : 40 }}>⚠️</span>
          <span
            style={{
              fontFamily: 'Fredoka',
              fontSize: isPortrait ? 56 : 42,
              fontWeight: 700,
              letterSpacing: 5,
              color: styles.solid,
            }}
          >
            {severityLabel}
          </span>
        </div>

        {/* River name */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? (riverName.length > 18 ? 104 : 120) : (riverName.length > 18 ? 80 : 96),
            fontWeight: 700,
            color: '#fff',
            lineHeight: 0.95,
            letterSpacing: -3,
            marginBottom: isPortrait ? 32 : 20,
          }}
        >
          {riverName}
        </span>

        {/* Transition line: from → now */}
        {fromCondition && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              marginBottom: isPortrait ? 48 : 32,
            }}
          >
            <span
              style={{
                fontFamily: 'Fredoka',
                fontSize: isPortrait ? 44 : 34,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              {CONDITION_DISPLAY[fromCondition] || fromCondition}
            </span>
            <span
              style={{
                fontSize: isPortrait ? 52 : 40,
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              →
            </span>
            <span
              style={{
                fontFamily: 'Fredoka',
                fontSize: isPortrait ? 48 : 36,
                fontWeight: 700,
                color: styles.solid,
              }}
            >
              {CONDITION_DISPLAY[newCondition] || newCondition}
            </span>
          </div>
        )}

        {/* Current gauge reading */}
        {update.gauge_height_ft !== null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 16,
              marginBottom: isPortrait ? 56 : 40,
            }}
          >
            <span
              style={{
                fontFamily: 'Fredoka',
                fontSize: isPortrait ? 140 : 96,
                fontWeight: 700,
                color: styles.solid,
                lineHeight: 1,
                textShadow: `0 0 30px ${styles.solid}`,
              }}
            >
              {update.gauge_height_ft.toFixed(1)}
            </span>
            <span
              style={{
                fontFamily: 'Fredoka',
                fontSize: isPortrait ? 48 : 36,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              ft right now
            </span>
          </div>
        )}

        {/* Action CTA */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 44 : 32,
            fontWeight: 600,
            color: '#fff',
            backgroundColor: `${styles.solid}33`,
            border: `2px solid ${styles.solid}`,
            padding: isPortrait ? '18px 32px' : '14px 24px',
            borderRadius: 16,
            alignSelf: 'flex-start',
          }}
        >
          {actionCta}
        </span>

        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 32 : 26,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.35)',
            position: 'absolute',
            bottom: isPortrait ? 120 : 48,
            left: isPortrait ? 72 : 64,
          }}
        >
          eddy.guide/{riverSlug}
        </span>
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 8,
            background: `linear-gradient(90deg, ${styles.solid}, ${BRAND_COLORS.accentCoral}, ${styles.solid})`,
          }}
        />
      </div>
    ),
    { ...size, fonts, headers: CACHE_HEADERS }
  );
}
