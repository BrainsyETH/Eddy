// src/app/plan/[shortCode]/opengraph-image.tsx
// Dynamic OG image for shared float plans — Condition otter + river name in Fredoka coral

import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import { formatFredokaFont, loadConditionOtter } from '@/lib/og/fonts';
import { BRAND_COLORS } from '@/lib/og/colors';
import type { ConditionCode } from '@/lib/og/types';

// new URL() in the route file so webpack bundles the font into this serverless function
const fredokaFont = fetch(
  new URL('../../fonts/Fredoka-SemiBold.ttf', import.meta.url),
).then((res) => res.arrayBuffer());

export const alt = 'Float Plan on eddy.guide';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 300;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '...';
}

function getConditionDisplay(condition: ConditionCode) {
  const displays: Record<ConditionCode, { label: string; textColor: string; bg: string }> = {
    optimal: { label: 'OPTIMAL', textColor: '#1A3D23', bg: '#059669' },
    low: { label: 'OKAY', textColor: '#1A3D23', bg: '#84CC16' },
    very_low: { label: 'LOW', textColor: '#2D2A24', bg: '#EAB308' },
    high: { label: 'HIGH WATER', textColor: '#ffffff', bg: '#F97316' },
    too_low: { label: 'TOO LOW', textColor: '#2D2A24', bg: '#9CA3AF' },
    dangerous: { label: 'FLOOD', textColor: '#ffffff', bg: '#DC2626' },
    unknown: { label: 'UNKNOWN', textColor: '#2D2A24', bg: '#9CA3AF' },
  };
  return displays[condition] || displays.unknown;
}

export default async function Image({ params }: { params: Promise<{ shortCode: string }> }) {
  const resolvedParams = await params;
  const shortCode = resolvedParams?.shortCode;

  // Default fallback data
  let riverName = 'Missouri River';
  let putInName = 'Start';
  let takeOutName = 'End';
  let condition: ConditionCode = 'unknown';
  let gaugeHeight = '';

  if (shortCode) {
    try {
      const supabase = await createClient();

      const { data: savedPlan } = await supabase
        .from('float_plans')
        .select('*')
        .eq('short_code', shortCode)
        .single();

      if (savedPlan) {
        const [riverResult, putInResult, takeOutResult] = await Promise.all([
          supabase.from('rivers').select('name').eq('id', savedPlan.river_id).single(),
          supabase.from('access_points').select('name').eq('id', savedPlan.start_access_id).single(),
          supabase.from('access_points').select('name').eq('id', savedPlan.end_access_id).single(),
        ]);

        riverName = riverResult.data?.name || riverName;
        putInName = putInResult.data?.name || putInName;
        takeOutName = takeOutResult.data?.name || takeOutName;
        condition = (savedPlan.condition_at_creation || 'unknown') as ConditionCode;

        if (savedPlan.gauge_reading_at_creation) {
          gaugeHeight = parseFloat(savedPlan.gauge_reading_at_creation).toFixed(2);
        }
      }
    } catch {
      // Database fetch failed, use defaults
    }
  }

  const condDisplay = getConditionDisplay(condition);

  const [fontData, otterImage] = await Promise.all([
    fredokaFont,
    loadConditionOtter(condition),
  ]);
  const fonts = formatFredokaFont(fontData);

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: '#1A3D40',
          position: 'relative',
        }}
      >
        {/* LEFT — Condition Otter */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 420,
            padding: 40,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={otterImage}
            width={340}
            height={340}
            alt=""
            style={{ objectFit: 'contain' }}
          />
        </div>

        {/* RIGHT — Plan info */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '48px 48px 48px 0',
            justifyContent: 'center',
          }}
        >
          {/* River name in Fredoka coral */}
          <span
            style={{
              fontFamily: 'Fredoka',
              fontSize: riverName.length > 16 ? 52 : 64,
              fontWeight: 600,
              color: BRAND_COLORS.accentCoral,
              lineHeight: 1,
              letterSpacing: -1,
              marginBottom: 20,
            }}
          >
            {truncate(riverName, 24)}
          </span>

          {/* Put-in → Take-out */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 24,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                background: '#4EB86B',
                marginRight: 8,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: 'white',
                marginRight: 20,
              }}
            >
              {truncate(putInName, 15)}
            </span>

            <span
              style={{
                fontSize: 20,
                color: 'rgba(255,255,255,0.5)',
                marginRight: 20,
              }}
            >
              →
            </span>

            <div
              style={{
                width: 16,
                height: 16,
                background: BRAND_COLORS.accentCoral,
                marginRight: 8,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: 'white',
              }}
            >
              {truncate(takeOutName, 15)}
            </span>
          </div>

          {/* Condition banner */}
          <div
            style={{
              display: 'flex',
              padding: '16px 28px',
              background: condDisplay.bg,
              border: '3px solid #000',
              marginBottom: 20,
              alignSelf: 'flex-start',
            }}
          >
            <span
              style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize: 48,
                fontWeight: 700,
                color: condDisplay.textColor,
                letterSpacing: -1,
              }}
            >
              {condDisplay.label}
            </span>
          </div>

          {/* Gauge height */}
          {gaugeHeight && (
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#72B5C4',
                  letterSpacing: 1,
                  marginRight: 12,
                }}
              >
                GAUGE HEIGHT
              </span>
              <span
                style={{
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: 36,
                  fontWeight: 700,
                  color: 'white',
                  letterSpacing: -1,
                }}
              >
                {gaugeHeight}
              </span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#A3D1DB',
                  marginLeft: 6,
                }}
              >
                ft
              </span>
            </div>
          )}
        </div>

        {/* Domain watermark */}
        <span
          style={{
            position: 'absolute',
            bottom: 24,
            right: 40,
            fontFamily: 'Space Grotesk',
            fontSize: 14,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          eddy.guide
        </span>
      </div>
    ),
    {
      ...size,
      fonts,
    }
  );
}
