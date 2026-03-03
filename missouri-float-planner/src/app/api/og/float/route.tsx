// src/app/api/og/float/route.tsx
// Dynamic OG image for float plan share URLs
// Reads putIn, takeOut UUIDs from query params and generates a preview
// showing put-in → take-out, distance, and live river conditions

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadFredokaFont, loadConditionOtter } from '@/lib/og/fonts';
import { BRAND_COLORS } from '@/lib/og/colors';
import { computeCondition } from '@/lib/conditions';
import type { ConditionCode } from '@/lib/og/types';

export const revalidate = 300;

const SIZE = { width: 1200, height: 630 };

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '...';
}

function getConditionDisplay(condition: ConditionCode) {
  const displays: Record<ConditionCode, { label: string; textColor: string; bg: string }> = {
    optimal: { label: 'OPTIMAL', textColor: '#1A3D23', bg: '#059669' },
    okay: { label: 'OKAY', textColor: '#1A3D23', bg: '#84CC16' },
    low: { label: 'LOW', textColor: '#2D2A24', bg: '#EAB308' },
    high: { label: 'HIGH WATER', textColor: '#ffffff', bg: '#F97316' },
    too_low: { label: 'TOO LOW', textColor: '#2D2A24', bg: '#9CA3AF' },
    dangerous: { label: 'FLOOD', textColor: '#ffffff', bg: '#DC2626' },
    unknown: { label: 'UNKNOWN', textColor: '#2D2A24', bg: '#9CA3AF' },
  };
  return displays[condition] || displays.unknown;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const putInId = searchParams.get('putIn');
  const takeOutId = searchParams.get('takeOut');

  // Default fallback data
  let riverName = 'Float Trip';
  let putInName = 'Start';
  let takeOutName = 'End';
  let distanceMiles: number | null = null;
  let condition: ConditionCode = 'unknown';
  let gaugeHeight: number | null = null;

  if (putInId && takeOutId) {
    try {
      const supabase = await createClient();

      // Fetch access points + river in parallel
      const [putInResult, takeOutResult] = await Promise.all([
        supabase
          .from('access_points')
          .select('id, name, river_id')
          .eq('id', putInId)
          .single(),
        supabase
          .from('access_points')
          .select('id, name, river_id')
          .eq('id', takeOutId)
          .single(),
      ]);

      if (putInResult.data) putInName = putInResult.data.name;
      if (takeOutResult.data) takeOutName = takeOutResult.data.name;

      const riverId = putInResult.data?.river_id || takeOutResult.data?.river_id;

      // Fetch river name, distance, and conditions in parallel
      const [riverResult, segmentResult, conditionResult] = await Promise.all([
        // River name
        riverId
          ? supabase.from('rivers').select('name').eq('id', riverId).single()
          : Promise.resolve({ data: null }),
        // Distance via get_float_segment RPC
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.rpc as any)('get_float_segment', {
          p_start_access_id: putInId,
          p_end_access_id: takeOutId,
        }),
        // River condition
        riverId
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (supabase.rpc as any)('get_river_condition', { p_river_id: riverId })
          : Promise.resolve({ data: null }),
      ]);

      if (riverResult.data) {
        riverName = (riverResult.data as { name: string }).name;
      }

      if (segmentResult.data && segmentResult.data.length > 0) {
        distanceMiles = parseFloat(segmentResult.data[0].distance_miles);
      }

      if (conditionResult.data && conditionResult.data.length > 0) {
        const cond = conditionResult.data[0];
        condition = (cond.condition_code || 'unknown') as ConditionCode;
        if (cond.gauge_height_ft) {
          gaugeHeight = parseFloat(cond.gauge_height_ft);
        }
      }

      // If we couldn't get condition from river, try computing from gauge thresholds
      if (condition === 'unknown' && riverId && gaugeHeight !== null) {
        try {
          const { data: riverGauge } = await supabase
            .from('river_gauges')
            .select('threshold_unit, level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous')
            .eq('river_id', riverId)
            .eq('is_primary', true)
            .limit(1)
            .maybeSingle();

          if (riverGauge) {
            const computed = computeCondition(
              gaugeHeight,
              {
                thresholdUnit: (riverGauge.threshold_unit as 'ft' | 'cfs') || 'ft',
                levelTooLow: riverGauge.level_too_low,
                levelLow: riverGauge.level_low,
                levelOptimalMin: riverGauge.level_optimal_min,
                levelOptimalMax: riverGauge.level_optimal_max,
                levelHigh: riverGauge.level_high,
                levelDangerous: riverGauge.level_dangerous,
              },
              null
            );
            condition = computed.code;
          }
        } catch {
          // Threshold computation failed
        }
      }
    } catch {
      // Database fetch failed, use defaults
    }
  }

  const condDisplay = getConditionDisplay(condition);
  const fonts = loadFredokaFont();

  let otterImage: string | null = null;
  try {
    otterImage = await loadConditionOtter(condition);
  } catch {
    // Otter image fetch failed
  }

  const riverNameSize = riverName.length > 16 ? 64 : 84;

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
        {otterImage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 380,
              padding: 32,
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={otterImage}
              width={310}
              height={310}
              alt=""
              style={{ objectFit: 'contain' }}
            />
          </div>
        )}

        {/* RIGHT — Float plan info */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: otterImage ? '44px 48px 44px 0' : '44px 48px',
            justifyContent: 'center',
          }}
        >
          {/* River name */}
          <span
            style={{
              fontFamily: 'Fredoka',
              fontSize: riverNameSize,
              fontWeight: 600,
              color: BRAND_COLORS.accentCoral,
              lineHeight: 1,
              letterSpacing: -2,
              marginBottom: 28,
            }}
          >
            {truncate(riverName, 24)}
          </span>

          {/* Put-in → Take-out with distance */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              marginBottom: 28,
            }}
          >
            {/* Put-in row */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  background: '#4EB86B',
                  marginRight: 12,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 30,
                  fontWeight: 600,
                  color: 'white',
                }}
              >
                {truncate(putInName, 28)}
              </span>
            </div>

            {/* Arrow + distance */}
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 5 }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  marginRight: 12,
                  width: 12,
                }}
              >
                <div style={{ width: 3, height: 20, background: 'rgba(255,255,255,0.3)' }} />
                <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>▼</span>
              </div>
              {distanceMiles !== null && (
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.6)',
                    fontFamily: 'Fredoka',
                  }}
                >
                  {distanceMiles.toFixed(1)} miles
                </span>
              )}
            </div>

            {/* Take-out row */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  background: BRAND_COLORS.accentCoral,
                  marginRight: 12,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 30,
                  fontWeight: 600,
                  color: 'white',
                }}
              >
                {truncate(takeOutName, 28)}
              </span>
            </div>
          </div>

          {/* Condition banner + gauge reading */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div
              style={{
                display: 'flex',
                padding: '14px 28px',
                background: condDisplay.bg,
                border: '3px solid #000',
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

            {gaugeHeight !== null && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span
                  style={{
                    fontFamily: 'system-ui, sans-serif',
                    fontSize: 44,
                    fontWeight: 700,
                    color: 'white',
                    letterSpacing: -1,
                  }}
                >
                  {gaugeHeight.toFixed(1)}
                </span>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: '#A3D1DB',
                  }}
                >
                  ft
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Domain watermark */}
        <span
          style={{
            position: 'absolute',
            bottom: 20,
            right: 36,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 18,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          eddy.guide
        </span>
      </div>
    ),
    {
      ...SIZE,
      fonts,
    }
  );
}
