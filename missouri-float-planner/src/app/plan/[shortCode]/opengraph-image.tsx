// src/app/plan/[shortCode]/opengraph-image.tsx
// Dynamic OG image for shared float plans

import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import { loadOGFonts, loadConditionOtter } from '@/lib/og/fonts';
import type { ConditionCode } from '@/lib/og/types';

export const alt = 'Float Plan on eddy.guide';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Revalidate every 5 minutes for fresh gauge data
export const revalidate = 300;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '...';
}

// Get condition display info
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

  // Load fonts
  const fonts = await loadOGFonts();

  // Default fallback data
  let riverName = 'Missouri River';
  let putInName = 'Start';
  let takeOutName = 'End';
  let condition: ConditionCode = 'unknown';
  let gaugeName = 'USGS Gauge';
  let gaugeHeight = '';

  if (shortCode) {
    try {
      const supabase = await createClient();

      // Fetch the saved plan
      const { data: savedPlan } = await supabase
        .from('float_plans')
        .select('*')
        .eq('short_code', shortCode)
        .single();

      if (savedPlan) {
        // Fetch river and access points in parallel
        const [riverResult, putInResult, takeOutResult] = await Promise.all([
          supabase.from('rivers').select('name').eq('id', savedPlan.river_id).single(),
          supabase.from('access_points').select('name').eq('id', savedPlan.start_access_id).single(),
          supabase.from('access_points').select('name').eq('id', savedPlan.end_access_id).single(),
        ]);

        riverName = riverResult.data?.name || riverName;
        putInName = putInResult.data?.name || putInName;
        takeOutName = takeOutResult.data?.name || takeOutName;
        gaugeName = savedPlan.gauge_name_at_creation || gaugeName;
        condition = (savedPlan.condition_at_creation || 'unknown') as ConditionCode;

        if (savedPlan.gauge_reading_at_creation) {
          gaugeHeight = parseFloat(savedPlan.gauge_reading_at_creation).toFixed(2);
        }
      }
    } catch {
      // Database fetch failed, use defaults
    }
  }

  // Load condition-specific otter image
  const otterImage = await loadConditionOtter(condition);
  const condDisplay = getConditionDisplay(condition);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, sans-serif',
          background: '#1A3D40',
          padding: '32px 40px',
          position: 'relative',
        }}
      >
        {/* TOP - Otter + River name */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            marginBottom: 12,
          }}
        >
          {/* Otter */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={otterImage}
            width={100}
            height={100}
            alt=""
            style={{ objectFit: 'contain', marginRight: 20 }}
          />

          {/* River name */}
          <span
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: 'white',
              letterSpacing: -1,
              lineHeight: 1,
              marginTop: 20,
            }}
          >
            {truncate(riverName.toUpperCase(), 20)}
          </span>
        </div>

        {/* Put-in / Take-out row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 24,
            marginLeft: 120,
          }}
        >
          {/* Put-in */}
          <div
            style={{
              width: 18,
              height: 18,
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
              marginRight: 28,
            }}
          >
            {truncate(putInName, 15)}
          </span>

          {/* Arrow */}
          <span
            style={{
              fontSize: 20,
              color: 'rgba(255,255,255,0.5)',
              marginRight: 28,
            }}
          >
            →
          </span>

          {/* Take-out */}
          <div
            style={{
              width: 18,
              height: 18,
              background: '#F07052',
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
            padding: '20px 32px',
            background: condDisplay.bg,
            border: '4px solid #000',
            marginBottom: 24,
          }}
        >
          <span
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: condDisplay.textColor,
              letterSpacing: -1,
            }}
          >
            {condDisplay.label}
          </span>
        </div>

        {/* Gauge data */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
          }}
        >
          {gaugeHeight && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#72B5C4',
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                GAUGE HEIGHT
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                }}
              >
                <span
                  style={{
                    fontSize: 44,
                    fontWeight: 700,
                    color: 'white',
                    letterSpacing: -1,
                  }}
                >
                  {gaugeHeight}
                </span>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#A3D1DB',
                    marginLeft: 8,
                  }}
                >
                  ft
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom row - Gauge name + watermark */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          {/* Gauge name chip */}
          <div
            style={{
              display: 'flex',
              padding: '8px 14px',
              background: 'rgba(255,255,255,0.08)',
              border: '2px solid rgba(255,255,255,0.15)',
            }}
          >
            <span
              style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize: 14,
                fontWeight: 600,
                color: '#A3D1DB',
              }}
            >
              {gaugeName}
            </span>
          </div>

          {/* Watermark */}
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            eddy.guide
          </span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
    }
  );
}
