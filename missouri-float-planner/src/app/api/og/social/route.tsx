// src/app/api/og/social/route.tsx
// Generates square (1080x1080) or portrait (1080x1920) OG images for social posts.
// Supports:
//   ?type=digest                 — all rivers, daily digest thumbnail
//   ?type=highlight&river=slug   — single river highlight thumbnail
//   ?type=tip&id=uuid            — custom content snippet thumbnail
//   ?type=forecast               — weekly forecast: top 3 floatable rivers
//   ?type=section                — section guide: float of the week
//   ?type=trend                  — 7-day trend: river with biggest gauge move

import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFredokaFont, loadConditionOtter } from '@/lib/og/fonts';
import { getStatusStyles, getStatusGradient, BRAND_COLORS } from '@/lib/og/colors';
import { CONDITION_LABELS } from '@/constants';
import { computeCondition, type ConditionThresholds } from '@/lib/conditions';
import type { ConditionCode } from '@/lib/og/types';
import { pickSectionForRivers } from '@/lib/social/section-picker';
import { pickNotableTrend } from '@/lib/social/trend-picker';

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
      return await generateSectionImage(size);
    }

    if (type === 'trend') {
      return await generateTrendImage(size);
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

  // Fetch latest gauge readings + thresholds for live condition computation
  // This avoids stale condition codes from eddy_updates that may lag behind gauge changes
  const { data: riverGauges, error: rgError } = await supabase
    .from('river_gauges')
    .select(`
      river_id,
      level_too_low, level_low, level_optimal_min, level_optimal_max,
      level_high, level_dangerous, threshold_unit,
      rivers!inner(slug),
      gauge_stations!inner(id)
    `)
    .eq('is_primary', true);

  if (rgError) {
    console.error('[OG/Social] river_gauges query failed:', rgError.message);
  }

  // Build a map of river slug → thresholds + gauge station ID
  const thresholdMap = new Map<string, { thresholds: ConditionThresholds; gaugeStationId: string }>();
  for (const rg of riverGauges || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slug = (rg as any).rivers?.slug;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stationId = (rg as any).gauge_stations?.id;
    if (slug && stationId) {
      thresholdMap.set(slug, {
        thresholds: {
          levelTooLow: rg.level_too_low,
          levelLow: rg.level_low,
          levelOptimalMin: rg.level_optimal_min,
          levelOptimalMax: rg.level_optimal_max,
          levelHigh: rg.level_high,
          levelDangerous: rg.level_dangerous,
          thresholdUnit: (rg.threshold_unit || 'ft') as 'ft' | 'cfs',
        },
        gaugeStationId: stationId,
      });
    }
  }

  // Fetch latest gauge readings for all primary stations
  const stationIds = Array.from(thresholdMap.values()).map(t => t.gaugeStationId);
  const { data: latestReadings } = stationIds.length > 0
    ? await supabase
        .from('gauge_readings')
        .select('gauge_station_id, gauge_height_ft, discharge_cfs')
        .in('gauge_station_id', stationIds)
        .order('reading_timestamp', { ascending: false })
    : { data: [] };

  // Deduplicate readings by station (latest first from the ORDER BY)
  const readingMap = new Map<string, { gauge_height_ft: number | null; discharge_cfs: number | null }>();
  for (const r of latestReadings || []) {
    if (!readingMap.has(r.gauge_station_id)) {
      readingMap.set(r.gauge_station_id, {
        gauge_height_ft: r.gauge_height_ft,
        discharge_cfs: r.discharge_cfs,
      });
    }
  }

  // Build river condition map from live gauge data
  const riverMap = new Map<string, { condition_code: string; gauge_height_ft: number | null }>();
  thresholdMap.forEach(({ thresholds, gaugeStationId }, slug) => {
    const reading = readingMap.get(gaugeStationId);
    const heightFt = reading?.gauge_height_ft ?? null;
    const dischargeCfs = reading?.discharge_cfs ?? null;
    const liveCondition = computeCondition(heightFt, thresholds, dischargeCfs);
    riverMap.set(slug, {
      condition_code: liveCondition.code,
      gauge_height_ft: heightFt,
    });
  });

  const rivers = Array.from(riverMap.entries());
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
  const { data: update } = await supabase
    .from('eddy_updates')
    .select('river_slug, condition_code, gauge_height_ft, summary_text, quote_text')
    .eq('river_slug', riverSlug)
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!update) {
    return NextResponse.json({ error: 'No update found for river' }, { status: 404 });
  }

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
const FORECAST_FLOATABLE = new Set(['flowing', 'good', 'high']);
const FORECAST_SEVERITY: Record<string, number> = {
  flowing: 0, good: 1, high: 2, low: 3, dangerous: 4, too_low: 5, unknown: 6,
};

async function generateForecastImage(size: { width: number; height: number }) {
  const supabase = createAdminClient();
  const fonts = loadFredokaFont();
  const isPortrait = size.height > size.width;

  const { data: updates } = await supabase
    .from('eddy_updates')
    .select('river_slug, condition_code, gauge_height_ft')
    .neq('river_slug', 'global')
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false });

  const seen = new Set<string>();
  type Row = { river_slug: string; condition_code: string; gauge_height_ft: number | null };
  const deduped = ((updates || []) as Row[]).filter((u) => {
    if (seen.has(u.river_slug)) return false;
    seen.add(u.river_slug);
    return true;
  });
  const top = deduped
    .filter((u) => FORECAST_FLOATABLE.has(u.condition_code))
    .sort((a, b) => (FORECAST_SEVERITY[a.condition_code] ?? 99) - (FORECAST_SEVERITY[b.condition_code] ?? 99))
    .slice(0, 3);

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

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

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
        {/* Eyebrow */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 38 : 30,
            fontWeight: 600,
            color: BRAND_COLORS.accentCoral,
            textTransform: 'uppercase',
            letterSpacing: 6,
            marginBottom: 8,
          }}
        >
          This Weekend
        </span>
        <span
          style={{
            fontSize: isPortrait ? 28 : 22,
            color: 'rgba(255,255,255,0.5)',
            marginBottom: 48,
          }}
        >
          Weekend Forecast · {dateLabel}
        </span>

        {/* Title */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 120 : 96,
            fontWeight: 700,
            color: '#fff',
            lineHeight: 0.95,
            letterSpacing: -3,
            marginBottom: isPortrait ? 56 : 40,
          }}
        >
          Best Bets
        </span>

        {/* River list — each row: condition dot + name + gauge */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isPortrait ? 24 : 16 }}>
          {top.length === 0 ? (
            <span style={{ fontSize: isPortrait ? 36 : 28, color: 'rgba(255,255,255,0.5)' }}>
              No floatable rivers right now.
            </span>
          ) : (
            top.map((u) => {
              const styles = getStatusStyles(u.condition_code as ConditionCode);
              const name = RIVER_DISPLAY[u.river_slug] || u.river_slug;
              return (
                <div
                  key={u.river_slug}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: isPortrait ? 28 : 20,
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    border: `1px solid rgba(255,255,255,0.08)`,
                    borderRadius: 24,
                    padding: isPortrait ? '24px 36px' : '20px 28px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      width: isPortrait ? 28 : 22,
                      height: isPortrait ? 28 : 22,
                      borderRadius: '50%',
                      backgroundColor: styles.solid,
                      boxShadow: `0 0 20px ${styles.solid}`,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'Fredoka',
                      fontSize: isPortrait ? 56 : 42,
                      fontWeight: 600,
                      color: '#fff',
                      flex: 1,
                    }}
                  >
                    {name}
                  </span>
                  {u.gauge_height_ft !== null && (
                    <span
                      style={{
                        fontSize: isPortrait ? 40 : 30,
                        fontWeight: 700,
                        color: styles.solid,
                      }}
                    >
                      {u.gauge_height_ft.toFixed(1)} ft
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

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
async function generateSectionImage(size: { width: number; height: number }) {
  const supabase = createAdminClient();
  const fonts = loadFredokaFont();
  const isPortrait = size.height > size.width;

  const { data: updates } = await supabase
    .from('eddy_updates')
    .select('river_slug, condition_code')
    .neq('river_slug', 'global')
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString());

  type Row = { river_slug: string; condition_code: string };
  const slugs = Array.from(new Set(((updates || []) as Row[]).map((u) => u.river_slug)));
  const section = pickSectionForRivers(slugs);
  if (!section) {
    return NextResponse.json({ error: 'No section available' }, { status: 404 });
  }
  const condition = ((updates || []) as Row[]).find((u) => u.river_slug === section.riverSlug)?.condition_code || 'unknown';
  const styles = getStatusStyles(condition as ConditionCode);

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
            color: BRAND_COLORS.accentCoral,
            textTransform: 'uppercase',
            letterSpacing: 6,
            marginBottom: 12,
          }}
        >
          Float of the Week
        </span>

        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 104 : 80,
            fontWeight: 700,
            color: '#fff',
            lineHeight: 0.95,
            letterSpacing: -3,
            marginBottom: isPortrait ? 56 : 40,
          }}
        >
          {section.riverName}
        </span>

        {/* Route card: put-in → take-out */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 28,
            padding: isPortrait ? '36px 40px' : '28px 32px',
            marginBottom: isPortrait ? 48 : 32,
          }}
        >
          <RouteLabel
            label="Put-in"
            name={section.putInName}
            mile={section.putInMile}
            color={BRAND_COLORS.accentCoral}
            isPortrait={isPortrait}
          />
          <div
            style={{
              height: 1,
              margin: isPortrait ? '24px 0' : '18px 0',
              background: 'rgba(255,255,255,0.12)',
            }}
          />
          <RouteLabel
            label="Take-out"
            name={section.takeOutName}
            mile={section.takeOutMile}
            color={styles.solid}
            isPortrait={isPortrait}
          />
        </div>

        {/* Stats strip */}
        <div
          style={{
            display: 'flex',
            gap: isPortrait ? 56 : 40,
          }}
        >
          <StatCell value={`${section.distanceMi.toFixed(1)} mi`} label="Distance" isPortrait={isPortrait} />
          <StatCell value={`${section.hoursCanoe.toFixed(1)} hrs`} label="Canoe" isPortrait={isPortrait} />
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
            background: `linear-gradient(90deg, ${BRAND_COLORS.accentCoral}, ${styles.solid})`,
          }}
        />
      </div>
    ),
    { ...size, fonts, headers: CACHE_HEADERS }
  );
}

function RouteLabel({
  label,
  name,
  mile,
  color,
  isPortrait,
}: {
  label: string;
  name: string;
  mile: number;
  color: string;
  isPortrait: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div
        style={{
          display: 'flex',
          width: isPortrait ? 20 : 16,
          height: isPortrait ? 20 : 16,
          borderRadius: '50%',
          backgroundColor: color,
          boxShadow: `0 0 16px ${color}`,
          flexShrink: 0,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 22 : 18,
            color: 'rgba(255,255,255,0.45)',
            textTransform: 'uppercase',
            letterSpacing: 2,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: isPortrait ? 48 : 36,
            fontWeight: 600,
            color: '#fff',
            lineHeight: 1.1,
          }}
        >
          {name}
        </span>
      </div>
      <span
        style={{
          fontSize: isPortrait ? 28 : 22,
          color: 'rgba(255,255,255,0.5)',
          flexShrink: 0,
        }}
      >
        MM {mile.toFixed(1)}
      </span>
    </div>
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
          fontSize: isPortrait ? 54 : 40,
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
    .select('river_slug, condition_code')
    .neq('river_slug', 'global')
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString());

  type Row = { river_slug: string; condition_code: string };
  const slugs = Array.from(new Set(((updates || []) as Row[]).map((u) => u.river_slug)));
  const trend = await pickNotableTrend(supabase, { restrictTo: slugs });
  if (!trend) {
    return NextResponse.json({ error: 'No notable trend' }, { status: 404 });
  }

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
