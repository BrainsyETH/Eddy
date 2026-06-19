// src/app/gauges/[slug]/opengraph-image.tsx
// Dynamic OG image for gauge station pages — Field Notebook "Live Conditions"
// card: gauge name, Stage / Flow / 14-day-trend stat boxes, status badge.

import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFredokaFont, loadEddyAvatar } from '@/lib/og/fonts';
import { CardFrame, StatBox, Sparkline, conditionMeta, type CardBadge } from '@/lib/og/cardLayout';
import { recentHeights } from '@/lib/og/snapshot';
import { computeCondition } from '@/lib/conditions';
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
  const supabase = createAdminClient();

  let siteId = rawSlug && /^\d+$/.test(rawSlug) ? rawSlug : null;
  if (!siteId && rawSlug) {
    try {
      const { data: river } = await supabase.from('rivers').select('id').eq('slug', rawSlug).eq('active', true).single();
      if (river) {
        const { data: rg } = await supabase
          .from('river_gauges')
          .select('gauge_stations!inner(usgs_site_id)')
          .eq('river_id', river.id)
          .eq('is_primary', true)
          .limit(1)
          .maybeSingle();
        if (rg) siteId = (rg.gauge_stations as unknown as { usgs_site_id: string }).usgs_site_id;
      }
    } catch {
      // fall through
    }
  }

  let gaugeName = rawSlug ? `Gauge ${rawSlug}` : 'Gauge';
  let place: string | null = null;
  let heightFt: number | null = null;
  let dischargeCfs: number | null = null;
  let status: ConditionCode = 'unknown';
  let trend: number[] = [];

  if (siteId) {
    try {
      const { data: station } = await supabase
        .from('gauge_stations')
        .select('id, name')
        .eq('usgs_site_id', siteId)
        .eq('active', true)
        .single();

      if (station) {
        gaugeName = station.name;
        if (/ at /i.test(gaugeName)) {
          const [head, tail] = gaugeName.split(/ at /i);
          gaugeName = head.trim();
          place = tail?.trim() || null;
        }

        const { data: reading } = await supabase
          .from('gauge_readings')
          .select('gauge_height_ft, discharge_cfs')
          .eq('gauge_station_id', station.id)
          .order('reading_timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (reading) {
          heightFt = reading.gauge_height_ft ? parseFloat(reading.gauge_height_ft) : null;
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
            heightFt,
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

        trend = await recentHeights(supabase, station.id);
      }
    } catch {
      // Render with the gauge name only.
    }
  }

  const meta = conditionMeta(status);
  const badge: CardBadge | null =
    status === 'unknown' ? null : { label: meta.label, accent: meta.accent, tint: meta.tint };

  const fonts = loadFredokaFont();
  const avatar = await loadEddyAvatar().catch(() => null);

  return new ImageResponse(
    (
      <CardFrame
        eyebrow="Live Conditions"
        title={truncate(gaugeName, 24)}
        avatar={avatar}
        badge={badge}
        accent={meta.accent}
      >
        {place && <span style={{ fontSize: 28, color: '#857D70', marginTop: -6, marginBottom: 8 }}>at {place}</span>}
        <div style={{ display: 'flex', gap: 18, marginTop: 10 }}>
          {heightFt !== null && <StatBox label="Stage" value={heightFt.toFixed(1)} unit="ft" />}
          {dischargeCfs !== null && <StatBox label="Flow" value={dischargeCfs.toLocaleString()} unit="cfs" />}
          {trend.length >= 2 && (
            <StatBox label="14-day trend">
              <Sparkline points={trend} color={meta.accent} />
            </StatBox>
          )}
        </div>
      </CardFrame>
    ),
    { ...size, fonts },
  );
}
