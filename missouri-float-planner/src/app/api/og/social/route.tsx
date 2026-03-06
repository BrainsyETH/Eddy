// src/app/api/og/social/route.tsx
// Generates 1080x1080 square images for Instagram/Facebook posts
// Supports: ?type=digest (all rivers) and ?type=highlight&river=slug (single river)

import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFredokaFont, loadConditionOtter } from '@/lib/og/fonts';
import { getStatusStyles, getStatusGradient, BRAND_COLORS } from '@/lib/og/colors';
import { CONDITION_LABELS } from '@/constants';
import type { ConditionCode } from '@/lib/og/types';

export const dynamic = 'force-dynamic';

const SIZE = { width: 1080, height: 1080 };

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '...';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'digest';
    const riverSlug = searchParams.get('river');

    if (type === 'highlight' && riverSlug) {
      return generateHighlightImage(riverSlug);
    }

    return generateDigestImage();
  } catch (err) {
    console.error('[OG/Social] Image generation failed:', err);
    // Return a simple fallback image so consumers always get an image
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
            Missouri River Conditions
          </span>
          <span style={{ fontSize: 24, color: 'rgba(255,255,255,0.3)', marginTop: 32 }}>
            eddyfloat.com
          </span>
        </div>
      ),
      { ...SIZE }
    );
  }
}

async function generateDigestImage() {
  const supabase = createAdminClient();
  const fonts = loadFredokaFont();

  // Fetch latest updates for all rivers
  const { data: updates, error: queryError } = await supabase
    .from('eddy_updates')
    .select('river_slug, condition_code, gauge_height_ft, summary_text, generated_at')
    .neq('river_slug', 'global')
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false });

  if (queryError) {
    console.error('[OG/Social] Supabase query failed:', queryError.message);
  }

  // Deduplicate by river
  const riverMap = new Map<string, { condition_code: string; gauge_height_ft: number | null }>();
  for (const u of updates || []) {
    if (!riverMap.has(u.river_slug)) {
      riverMap.set(u.river_slug, {
        condition_code: u.condition_code,
        gauge_height_ft: u.gauge_height_ft,
      });
    }
  }

  const rivers = Array.from(riverMap.entries());
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Load otter
  let otterImage: string | null = null;
  try {
    otterImage = await loadConditionOtter('optimal');
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
          position: 'relative',
        }}
      >
        {/* Header */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: 64,
            fontWeight: 600,
            color: BRAND_COLORS.accentCoral,
            lineHeight: 1,
            letterSpacing: -1,
            marginBottom: 8,
          }}
        >
          Ozarks River Report
        </span>
        <span
          style={{
            fontSize: 28,
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
            gap: 16,
            flex: 1,
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
                  width: 'calc(50% - 8px)',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: 16,
                  padding: '20px 24px',
                  borderLeft: `4px solid ${statusStyles.solid}`,
                }}
              >
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: 'white',
                    marginBottom: 4,
                  }}
                >
                  {name}
                </span>
                <span
                  style={{
                    fontSize: 22,
                    color: statusStyles.solid,
                    fontWeight: 600,
                  }}
                >
                  {statusStyles.label}
                </span>
                {data.gauge_height_ft !== null && (
                  <span
                    style={{
                      fontSize: 20,
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 24,
          }}
        >
          <span
            style={{
              fontFamily: 'Fredoka',
              fontSize: 32,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            eddyfloat.com
          </span>
        </div>

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
              width={160}
              height={160}
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
      ...SIZE,
      fonts,
    }
  );
}

async function generateHighlightImage(riverSlug: string) {
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
          padding: '64px',
          position: 'relative',
        }}
      >
        {/* "Eddy Says" label */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: 28,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase',
            letterSpacing: 3,
            marginBottom: 16,
          }}
        >
          Eddy Says
        </span>

        {/* River name */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: riverName.length > 18 ? 72 : 88,
            fontWeight: 600,
            color: BRAND_COLORS.accentCoral,
            lineHeight: 1,
            letterSpacing: -2,
            marginBottom: 32,
          }}
        >
          {riverName}
        </span>

        {/* Condition badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              backgroundColor: statusStyles.bg,
              border: `2px solid ${statusStyles.border}`,
              borderRadius: 100,
              padding: '14px 32px',
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                backgroundColor: statusStyles.solid,
              }}
            />
            <span
              style={{
                fontSize: 32,
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
                fontSize: 48,
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
              fontSize: 34,
              color: 'rgba(255,255,255,0.8)',
              lineHeight: 1.4,
              maxWidth: otterImage ? 700 : '100%',
            }}
          >
            {truncate(snippet, 200)}
          </span>
        )}

        {/* Spacer */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* Footer */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: 28,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.35)',
          }}
        >
          eddyfloat.com
        </span>

        {/* Otter */}
        {otterImage && (
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: 40,
              right: 40,
              opacity: 0.9,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={otterImage}
              width={240}
              height={240}
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
      ...SIZE,
      fonts,
    }
  );
}
