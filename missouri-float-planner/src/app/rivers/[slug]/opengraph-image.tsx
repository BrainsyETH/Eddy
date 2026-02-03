// src/app/rivers/[slug]/opengraph-image.tsx
// Dynamic OG image for river pages

import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import { loadOGFonts, loadEddyAvatar } from '@/lib/og/fonts';
import { getStatusStyles, getStatusGradient } from '@/lib/og/colors';
import type { ConditionCode } from '@/lib/og/types';

export const alt = 'River conditions on eddy.guide';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Revalidate every 5 minutes for fresh gauge data
export const revalidate = 300;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '...';
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const slug = resolvedParams?.slug;

  // Load fonts and avatar in parallel
  const [fonts, eddyAvatar] = await Promise.all([loadOGFonts(), loadEddyAvatar()]);

  // Default fallback data
  let riverName = 'Missouri River';
  let accessPointCount = 0;
  let gaugeReading: number | null = null;
  const gaugeUnit = 'ft';
  let status: ConditionCode = 'unknown';

  if (slug) {
    try {
      const supabase = await createClient();

      // Fetch river info
      const { data: river } = await supabase
        .from('rivers')
        .select('id, name')
        .eq('slug', slug)
        .single();

      if (river) {
        riverName = river.name;

        // Fetch access point count
        const { count } = await supabase
          .from('access_points')
          .select('*', { count: 'exact', head: true })
          .eq('river_id', river.id)
          .eq('is_approved', true);

        accessPointCount = count || 0;

        // Fetch conditions
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

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #161748 0%, #1a1f5c 50%, #1B4965 100%)',
          padding: 40,
          position: 'relative',
        }}
      >
        {/* Eddy Brand Mark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #478559 0%, #81B29A 100%)',
              border: '2px solid rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={eddyAvatar} width={24} height={24} alt="" style={{ objectFit: 'cover' }} />
          </div>
          <span
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            eddy.guide
          </span>
        </div>

        {/* River Name */}
        <span
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 48,
            fontWeight: 700,
            color: 'white',
            letterSpacing: -0.5,
            marginBottom: 24,
          }}
        >
          {truncate(riverName, 20)}
        </span>

        {/* Metadata Row */}
        <div
          style={{
            display: 'flex',
            gap: 32,
            marginBottom: 28,
          }}
        >
          {/* Access Points */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize: 11,
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
                fontSize: 20,
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
                fontFamily: 'system-ui, sans-serif',
                fontSize: 11,
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
                fontSize: 20,
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
            gap: 8,
            backgroundColor: statusStyles.bg,
            border: `1px solid ${statusStyles.border}`,
            borderRadius: 100,
            padding: '10px 20px',
            alignSelf: 'flex-start',
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: statusStyles.solid,
            }}
          />
          <span
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 16,
              fontWeight: 700,
              color: statusStyles.text,
            }}
          >
            {statusStyles.label}
          </span>
        </div>

        {/* Tagline */}
        <span
          style={{
            position: 'absolute',
            bottom: 16,
            right: 24,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 12,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          Plan your float trip with Eddy
        </span>

        {/* Bottom Accent Bar */}
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
