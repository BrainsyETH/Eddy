// src/app/plan/[shortCode]/opengraph-image.tsx
// OG image for shared float plans — Field Notebook "Float Plan" card: river
// name, put-in → take-out route and stable distance. Live condition and time
// are deliberately omitted because messaging clients cache previews while the
// opened plan recalculates them.

import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFredokaFont, loadEddyAvatar } from '@/lib/og/fonts';
import { CardFrame, CORAL, INK } from '@/lib/og/cardLayout';

export const alt = 'Float plan on eddy.guide';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 300;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '…';
}

export default async function Image({ params }: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await params;

  let riverName = 'Float Plan';
  let putInName = 'Start';
  let takeOutName = 'End';
  let distanceMiles: number | null = null;

  if (shortCode) {
    try {
      const supabase = createAdminClient();
      const { data: plan } = await supabase.from('float_plans').select('*').eq('short_code', shortCode).single();
      if (plan) {
        distanceMiles = plan.distance_miles != null ? Number(plan.distance_miles) : null;
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

  const fonts = loadFredokaFont();
  const avatar = await loadEddyAvatar().catch(() => null);

  return new ImageResponse(
    (
      <CardFrame eyebrow="Float Plan" title={truncate(riverName, 22)} avatar={avatar} badge={null} accent={CORAL}>
        {/* Route */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 6 }}>
          <span style={{ fontFamily: 'Fredoka', fontSize: 32, fontWeight: 600, color: INK }}>{truncate(putInName, 18)}</span>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 80 }}>
            <div style={{ width: 16, height: 16, borderRadius: 999, background: CORAL }} />
            <div style={{ flex: 1, height: 4, background: '#C2BAAC' }} />
            <div style={{ width: 16, height: 16, borderRadius: 999, background: CORAL }} />
          </div>
          <span style={{ fontFamily: 'Fredoka', fontSize: 32, fontWeight: 600, color: INK }}>{truncate(takeOutName, 18)}</span>
        </div>

        {/* Stable distance only. Current time belongs on the opened plan. */}
        {distanceMiles !== null && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 36, marginTop: 30 }}>
            <span style={{ fontFamily: 'Fredoka', fontSize: 64, fontWeight: 600, color: INK }}>
              {distanceMiles.toFixed(1)} <span style={{ fontSize: 30, color: '#857D70' }}>mi</span>
            </span>
          </div>
        )}
      </CardFrame>
    ),
    { ...size, fonts },
  );
}
