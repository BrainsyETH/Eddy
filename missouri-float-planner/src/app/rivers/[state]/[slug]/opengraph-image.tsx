// src/app/rivers/[slug]/opengraph-image.tsx
// Dynamic OG image for river pages — Field Notebook "Live Conditions" card:
// river name, location, Stage / Flow / 14-day-trend stat boxes, status badge.

import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFredokaFont, loadEddyAvatar } from '@/lib/og/fonts';
import { CardFrame, StatBox, Sparkline, conditionMeta, type CardBadge } from '@/lib/og/cardLayout';
import { recentHeights } from '@/lib/og/snapshot';

export const alt = 'River conditions and float trip guide on Eddy';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 300;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '…';
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let riverName = 'River';
  let place: string | null = null;
  let code = 'unknown';
  let heightFt: number | null = null;
  let dischargeCfs: number | null = null;
  let trend: number[] = [];

  try {
    const supabase = createAdminClient();
    const { data: river } = await supabase
      .from('rivers')
      .select('id, name, region')
      .eq('slug', slug)
      .single();

    if (river) {
      riverName = river.name;
      if (river.region) place = river.region;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: cond } = await (supabase.rpc as any)('get_river_condition', { p_river_id: river.id });
        if (cond?.[0]) {
          code = cond[0].condition_code || 'unknown';
          if (cond[0].gauge_height_ft) heightFt = parseFloat(cond[0].gauge_height_ft);
        }
      } catch {
        // condition optional
      }

      const { data: rg } = await supabase
        .from('river_gauges')
        .select('gauge_station_id, gauge_stations!inner(name)')
        .eq('river_id', river.id)
        .eq('is_primary', true)
        .limit(1)
        .maybeSingle();

      if (rg) {
        const stationId = rg.gauge_station_id as string;
        const gaugeName = (rg.gauge_stations as unknown as { name?: string })?.name;
        if (gaugeName && / at /i.test(gaugeName)) {
          place = gaugeName.split(/ at /i)[1]?.trim() || place;
        }

        const { data: reading } = await supabase
          .from('gauge_readings')
          .select('gauge_height_ft, discharge_cfs')
          .eq('gauge_station_id', stationId)
          .order('reading_timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (reading) {
          if (heightFt === null && reading.gauge_height_ft) heightFt = parseFloat(reading.gauge_height_ft);
          if (reading.discharge_cfs) dischargeCfs = parseFloat(reading.discharge_cfs);
        }
        trend = await recentHeights(supabase, stationId);
      }
    }
  } catch {
    // Render with the river name only if the DB is unavailable.
  }

  const meta = conditionMeta(code);
  const badge: CardBadge | null =
    code === 'unknown' ? null : { label: meta.label, accent: meta.accent, tint: meta.tint };

  const fonts = loadFredokaFont();
  const avatar = await loadEddyAvatar().catch(() => null);

  return new ImageResponse(
    (
      <CardFrame
        eyebrow="Live Conditions"
        title={truncate(riverName, 22)}
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
