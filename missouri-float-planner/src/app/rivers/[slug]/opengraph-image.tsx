// src/app/rivers/[slug]/opengraph-image.tsx
// Dynamic OG image for river pages — big river name, summary, condition
// Designed for reliable Facebook/social previews with graceful fallbacks

import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import { loadFredokaFont, loadConditionOtter } from '@/lib/og/fonts';
import { getStatusStyles, getStatusGradient, BRAND_COLORS } from '@/lib/og/colors';
import type { ConditionCode } from '@/lib/og/types';

export const alt = 'River conditions and float trip guide on Eddy';
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
  let gaugeReading: number | null = null;
  const gaugeUnit = 'ft';
  let status: ConditionCode = 'unknown';
  let eddyQuoteSnippet: string | null = null;

  if (slug) {
    try {
      const supabase = await createClient();

      const { data: river } = await supabase
        .from('rivers')
        .select('id, name, region')
        .eq('slug', slug)
        .single();

      if (river) {
        riverName = river.name;

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

        // Fetch latest Eddy summary for the OG card
        try {
          const { data: eddyData } = await supabase
            .from('eddy_updates')
            .select('summary_text, quote_text')
            .eq('river_slug', slug)
            .is('section_slug', null)
            .gt('expires_at', new Date().toISOString())
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (eddyData) {
            eddyQuoteSnippet = eddyData.summary_text || eddyData.quote_text || null;
          }
        } catch {
          // Eddy quote fetch failed, skip
        }
      }
    } catch {
      // Database fetch failed, use defaults
    }
  }

  const statusStyles = getStatusStyles(status);
  const [gradientStart, gradientEnd] = getStatusGradient(status);

  const fonts = loadFredokaFont();

  // Load otter image with fallback
  let otterImage: string | null = null;
  try {
    otterImage = await loadConditionOtter(status);
  } catch {
    // Otter image fetch failed — render without it
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
          background: 'linear-gradient(135deg, #161748 0%, #1a1f5c 50%, #1B4965 100%)',
          position: 'relative',
          padding: '56px 72px 48px',
        }}
      >
        {/* River name — big and prominent at top */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: riverName.length > 20 ? 80 : riverName.length > 14 ? 96 : 112,
            fontWeight: 600,
            color: BRAND_COLORS.accentCoral,
            lineHeight: 1,
            letterSpacing: -2,
            marginBottom: 24,
          }}
        >
          {truncate(riverName, 24)}
        </span>

        {/* Summary / Eddy quote — large and readable */}
        {eddyQuoteSnippet && (
          <span
            style={{
              fontSize: 32,
              fontWeight: 400,
              color: 'rgba(255,255,255,0.85)',
              lineHeight: 1.4,
              marginBottom: 32,
              maxWidth: otterImage ? 780 : '100%',
            }}
          >
            {truncate(eddyQuoteSnippet, 150)}
          </span>
        )}

        {/* Spacer to push condition to bottom */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* River Condition row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontFamily: 'Fredoka',
              fontSize: 24,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            River Condition
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 32,
            alignItems: 'center',
          }}
        >
          {/* Gauge Level */}
          {gaugeReading !== null && (
            <span
              style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize: 56,
                fontWeight: 700,
                color: 'white',
                lineHeight: 1,
              }}
            >
              {`${gaugeReading.toFixed(1)} ${gaugeUnit}`}
            </span>
          )}

          {/* Status Badge */}
          {status !== 'unknown' && (
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
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: 32,
                  fontWeight: 700,
                  color: statusStyles.text,
                }}
              >
                {statusStyles.label}
              </span>
            </div>
          )}
        </div>

        {/* Otter — small, bottom-right decorative element */}
        {otterImage && (
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: 24,
              right: 32,
              opacity: 0.9,
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

        {/* Bottom accent bar with condition gradient */}
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
    }
  );
}
