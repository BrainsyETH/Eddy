// src/app/plan/[shortCode]/opengraph-image.tsx
// OG image for shared float plans — Field Notebook "Float Plan" card: river
// name, put-in → take-out route, distance + float time, status badge.

import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFredokaFont, loadEddyAvatar } from '@/lib/og/fonts';
import { CardFrame, conditionMeta, CORAL, INK, type CardBadge } from '@/lib/og/cardLayout';

export const alt = 'Float plan on eddy.guide';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 300;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '…';
}

function formatDuration(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`;
}

export default async function Image({ params }: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await params;

  let riverName = 'Float Plan';
  let putInName = 'Start';
  let takeOutName = 'End';
  let code = 'unknown';
  let distanceMiles: number | null = null;
  let floatMinutes: number | null = null;

  if (shortCode) {
    try {
      const supabase = createAdminClient();
      const { data: plan } = await supabase.from('float_plans').select('*').eq('short_code', shortCode).single();
      if (plan) {
        code = plan.condition_at_creation || 'unknown';
        distanceMiles = plan.distance_miles != null ? Number(plan.distance_miles) : null;
        floatMinutes = plan.estimated_float_minutes ?? null;
        const [river, putIn, takeOut] = await Promise.all([
          supabase.from('rivers').select('name').eq('id', plan.river_id).single(),
          supabase.from('access_points').select('name').eq('id', plan.start_access_id).single(),
          supabase.from('access_points').select('name').eq('id', plan.end_access_id).single(),
        ]);
        riverName = river.data?.name || riverName;
        putInName = putIn.data?.name || putInName;
        takeOutName = takeOut.data?.name || takeOutName;
      }
    } catch {
      // Render with defaults.
    }
  }

  const meta = conditionMeta(code);
  const badge: CardBadge | null = code === 'unknown' ? null : { label: meta.label, accent: meta.accent, tint: meta.tint };
  const duration = formatDuration(floatMinutes);

  const fonts = loadFredokaFont();
  const avatar = await loadEddyAvatar().catch(() => null);

  return new ImageResponse(
    (
      <CardFrame eyebrow="Float Plan" title={truncate(riverName, 22)} avatar={avatar} badge={badge} accent={meta.accent}>
        {/* Route */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 6 }}>
          <span style={{ fontFamily: 'Fredoka', fontSize: 32, fontWeight: 600, color: INK }}>{truncate(putInName, 18)}</span>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 80 }}>
            <div style={{ width: 16, height: 16, borderRadius: 999, background: meta.accent }} />
            <div style={{ flex: 1, height: 4, background: '#C2BAAC' }} />
            <div style={{ width: 16, height: 16, borderRadius: 999, background: CORAL }} />
          </div>
          <span style={{ fontFamily: 'Fredoka', fontSize: 32, fontWeight: 600, color: INK }}>{truncate(takeOutName, 18)}</span>
        </div>

        {/* Distance + time */}
        {(distanceMiles !== null || duration) && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 36, marginTop: 30 }}>
            {distanceMiles !== null && (
              <span style={{ fontFamily: 'Fredoka', fontSize: 64, fontWeight: 600, color: INK }}>
                {distanceMiles.toFixed(1)} <span style={{ fontSize: 30, color: '#857D70' }}>mi</span>
              </span>
            )}
            {duration && (
              <span style={{ fontFamily: 'Fredoka', fontSize: 64, fontWeight: 600, color: INK }}>{duration}</span>
            )}
          </div>
        )}
      </CardFrame>
    ),
    { ...size, fonts },
  );
}
