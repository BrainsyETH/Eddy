// src/app/rivers/[slug]/opengraph-image.tsx
// Dynamic OG image for river pages — Condition otter + river name in Fredoka coral

import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import { loadFredokaFont, loadConditionOtter } from '@/lib/og/fonts';
import { getStatusStyles, getStatusGradient, BRAND_COLORS } from '@/lib/og/colors';
import type { ConditionCode } from '@/lib/og/types';

export const alt = 'River conditions on eddy.guide';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 300;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '...';
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const slug = resolvedParams?.slug;

  // Default fallback data
  let riverName = 'Missouri River';
  let accessPointCount = 0;
  let gaugeReading: number | null = null;
  const gaugeUnit = 'ft';
  let status: ConditionCode = 'unknown';

  if (slug) {
    try {
      const supabase = await createClient();

      const { data: river } = await supabase
        .from('rivers')
        .select('id, name')
        .eq('slug', slug)
        .single();

      if (river) {
        riverName = river.name;

        const { count } = await supabase
          .from('access_points')
          .select('*', { count: 'exact', head: true })
          .eq('river_id', river.id)
          .eq('is_approved', true);

        accessPointCount = count || 0;

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: conditionData } = await (supabase.rpc as any)('get_river_condition', {
            p_river_id: river.id,
          });

          if (conditionData && conditionData.length > 0) {
            const cond = conditionData[0];
            status = (cond.condition_code || 'unknown') as ConditionCode;
            if (cond.gauge_height_ft) {
              gaugeReading = parseFloat(cond.gauge_height_ft);
            }
          }
        } catch {
          // Conditions fetch failed, use defaults
        }
      }
    } catch {
      // Database fetch failed, use defaults
    }
  }

  const statusStyles = getStatusStyles(status);
  const [gradientStart, gradientEnd] = getStatusGradient(status);

  const fonts = loadFredokaFont();
  const otterImage = await loadConditionOtter(status);

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: 'linear-gradient(135deg, #161748 0%, #1a1f5c 50%, #1B4965 100%)',
          position: 'relative',
        }}
      >
        {/* LEFT — Condition Otter */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 480,
            padding: 40,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={otterImage}
            width={380}
            height={380}
            alt=""
            style={{ objectFit: 'contain' }}
          />
        </div>

        {/* RIGHT — River info */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '60px 60px 60px 0',
            justifyContent: 'center',
          }}
        >
          {/* River name in Fredoka coral */}
          <span
            style={{
              fontFamily: 'Fredoka',
              fontSize: riverName.length > 16 ? 72 : 96,
              fontWeight: 600,
              color: BRAND_COLORS.accentCoral,
              lineHeight: 1,
              letterSpacing: -2,
              marginBottom: 28,
            }}
          >
            {truncate(riverName, 24)}
          </span>

          {/* Metadata Row */}
          <div
            style={{
              display: 'flex',
              gap: 32,
              marginBottom: 24,
            }}
          >
            {/* Access Points */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                ACCESS POINTS
              </span>
              <span
                style={{
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: 32,
                  fontWeight: 700,
                  color: 'white',
                }}
              >
                {accessPointCount}
              </span>
            </div>

            {/* Gauge Level */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                GAUGE LEVEL
              </span>
              <span
                style={{
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: 32,
                  fontWeight: 700,
                  color: 'white',
                }}
              >
                {gaugeReading !== null ? `${gaugeReading.toFixed(1)} ${gaugeUnit}` : 'N/A'}
              </span>
            </div>
          </div>

          {/* Status Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              backgroundColor: statusStyles.bg,
              border: `1px solid ${statusStyles.border}`,
              borderRadius: 100,
              padding: '12px 24px',
              alignSelf: 'flex-start',
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: statusStyles.solid,
              }}
            />
            <span
              style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize: 20,
                fontWeight: 700,
                color: statusStyles.text,
              }}
            >
              {statusStyles.label}
            </span>
          </div>
        </div>

        {/* Domain watermark */}
        <span
          style={{
            position: 'absolute',
            bottom: 24,
            right: 40,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 18,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          eddy.guide
        </span>

        {/* Bottom accent bar with condition gradient */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background: `linear-gradient(90deg, ${gradientStart} 0%, ${gradientEnd} 100%)`,
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts,
    }
  );
}
