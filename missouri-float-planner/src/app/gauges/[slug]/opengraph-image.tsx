// src/app/gauges/[slug]/opengraph-image.tsx
// Dynamic OG image for individual gauge station pages — clean branded card:
// gauge name + a single live-readings line (height · discharge · condition).

import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import { loadFredokaFont, loadEddyAvatar } from '@/lib/og/fonts';
import { getStatusStyles, BRAND_COLORS } from '@/lib/og/colors';
import { computeCondition } from '@/lib/conditions';
import { ContentCard } from '@/lib/og/cardLayout';
import type { ConditionCode } from '@/lib/og/types';

export const alt = 'Gauge station water levels on Eddy';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 300;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '…';
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;

  let siteId = rawSlug && /^\d+$/.test(rawSlug) ? rawSlug : null;

  if (!siteId && rawSlug) {
    try {
      const supabase = await createClient();
      const { data: river } = await supabase
        .from('rivers')
        .select('id')
        .eq('slug', rawSlug)
        .eq('active', true)
        .single();
      if (river) {
        const { data: rg } = await supabase
          .from('river_gauges')
          .select('gauge_stations!inner(usgs_site_id)')
          .eq('river_id', river.id)
          .eq('is_primary', true)
          .limit(1)
          .maybeSingle();
        if (rg) {
          const gs = rg.gauge_stations as unknown as { usgs_site_id: string };
          siteId = gs.usgs_site_id;
        }
      }
    } catch {
      // fall through to defaults
    }
  }

  let gaugeName = rawSlug ? `Gauge ${rawSlug}` : 'Gauge';
  let gaugeHeightFt: number | null = null;
  let dischargeCfs: number | null = null;
  let status: ConditionCode = 'unknown';

  if (siteId) {
    try {
      const supabase = await createClient();
      const { data: station } = await supabase
        .from('gauge_stations')
        .select('id, usgs_site_id, name')
        .eq('usgs_site_id', siteId)
        .eq('active', true)
        .single();

      if (station) {
        gaugeName = station.name;

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

        const { data: riverGauge } = await supabase
          .from('river_gauges')
          .select('threshold_unit, level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous')
          .eq('gauge_station_id', station.id)
          .eq('is_primary', true)
          .limit(1)
          .maybeSingle();

        if (riverGauge) {
          status = computeCondition(
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
            dischargeCfs,
          ).code;
        }
      }
    } catch {
      // Database fetch failed — render with the gauge name only.
    }
  }

  const parts: string[] = [];
  if (gaugeHeightFt !== null) parts.push(`${gaugeHeightFt.toFixed(1)} ft`);
  if (dischargeCfs !== null) parts.push(`${dischargeCfs.toLocaleString()} cfs`);
  if (status !== 'unknown') parts.push(getStatusStyles(status).label);
  const body = parts.length > 0 ? parts.join('  ·  ') : 'Live USGS gauge readings';

  const fonts = loadFredokaFont();
  const avatar = await loadEddyAvatar().catch(() => null);

  return new ImageResponse(
    (
      <ContentCard
        title={truncate(gaugeName, 36)}
        titleColor={BRAND_COLORS.accentCoral}
        body={body}
        avatar={avatar}
      />
    ),
    { ...size, fonts },
  );
}
