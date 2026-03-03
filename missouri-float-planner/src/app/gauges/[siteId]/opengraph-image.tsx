// src/app/gauges/[siteId]/opengraph-image.tsx
// Dynamic OG image for individual gauge station pages
// Shows gauge name, current height (ft), discharge (CFS), and condition status

import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import { loadFredokaFont, loadConditionOtter } from '@/lib/og/fonts';
import { getStatusStyles, getStatusGradient, BRAND_COLORS } from '@/lib/og/colors';
import { computeCondition } from '@/lib/conditions';
import type { ConditionCode } from '@/lib/og/types';

export const alt = 'Gauge station water levels on Eddy';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 300;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '...';
}

export default async function Image({ params }: { params: Promise<{ siteId: string }> }) {
  const resolvedParams = await params;
  const siteId = resolvedParams?.siteId;

  // Default fallback data
  let gaugeName = `Gauge ${siteId || ''}`;
  let gaugeHeightFt: number | null = null;
  let dischargeCfs: number | null = null;
  let status: ConditionCode = 'unknown';

  if (siteId) {
    try {
      const supabase = await createClient();

      // Fetch gauge station
      const { data: station } = await supabase
        .from('gauge_stations')
        .select('id, usgs_site_id, name')
        .eq('usgs_site_id', siteId)
        .eq('active', true)
        .single();

      if (station) {
        gaugeName = station.name;

        // Fetch latest reading
        const { data: reading } = await supabase
          .from('gauge_readings')
          .select('gauge_height_ft, discharge_cfs')
          .eq('gauge_station_id', station.id)
          .order('reading_timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (reading) {
          gaugeHeightFt = reading.gauge_height_ft ? parseFloat(reading.gauge_height_ft) : null;
          dischargeCfs = reading.discharge_cfs ? parseFloat(reading.discharge_cfs) : null;
        }

        // Fetch thresholds from primary river association
        const { data: riverGauge } = await supabase
          .from('river_gauges')
          .select('threshold_unit, level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous')
          .eq('gauge_station_id', station.id)
          .eq('is_primary', true)
          .limit(1)
          .maybeSingle();

        if (riverGauge) {
          const condition = computeCondition(
            gaugeHeightFt,
            {
              thresholdUnit: (riverGauge.threshold_unit as 'ft' | 'cfs') || 'ft',
              levelTooLow: riverGauge.level_too_low,
              levelLow: riverGauge.level_low,
              levelOptimalMin: riverGauge.level_optimal_min,
              levelOptimalMax: riverGauge.level_optimal_max,
              levelHigh: riverGauge.level_high,
              levelDangerous: riverGauge.level_dangerous,
            },
            dischargeCfs
          );
          status = condition.code;
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

  // Adaptive font size for gauge name
  const nameFontSize = gaugeName.length > 30 ? 64 : gaugeName.length > 20 ? 80 : 96;

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
          padding: '56px 72px 72px',
        }}
      >
        {/* Gauge name — big and prominent at top */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: nameFontSize,
            fontWeight: 600,
            color: BRAND_COLORS.accentCoral,
            lineHeight: 1.1,
            letterSpacing: -2,
            marginBottom: 32,
            maxWidth: otterImage ? 860 : '100%',
          }}
        >
          {truncate(gaugeName, 40)}
        </span>

        {/* Spacer to push readings to bottom */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* Readings row — Height and CFS side by side */}
        <div
          style={{
            display: 'flex',
            gap: 64,
            marginBottom: 24,
            alignItems: 'flex-end',
          }}
        >
          {/* Gauge Height */}
          {gaugeHeightFt !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span
                style={{
                  fontFamily: 'Fredoka',
                  fontSize: 22,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase',
                  letterSpacing: 2,
                }}
              >
                Gauge Height
              </span>
              <span
                style={{
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: 56,
                  fontWeight: 700,
                  color: 'white',
                  lineHeight: 1,
                }}
              >
                {`${gaugeHeightFt.toFixed(1)} ft`}
              </span>
            </div>
          )}

          {/* Discharge CFS */}
          {dischargeCfs !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span
                style={{
                  fontFamily: 'Fredoka',
                  fontSize: 22,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase',
                  letterSpacing: 2,
                }}
              >
                Discharge
              </span>
              <span
                style={{
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: 56,
                  fontWeight: 700,
                  color: 'white',
                  lineHeight: 1,
                }}
              >
                {`${dischargeCfs.toLocaleString()} cfs`}
              </span>
            </div>
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
                marginBottom: 4,
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
