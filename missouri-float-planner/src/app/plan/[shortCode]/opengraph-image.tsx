// src/app/plan/[shortCode]/opengraph-image.tsx
// OG image for shared float plans — clean branded card: river name + the
// put-in → take-out route (with condition) as the supporting line.

import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import { loadFredokaFont, loadEddyAvatar } from '@/lib/og/fonts';
import { getStatusStyles, BRAND_COLORS } from '@/lib/og/colors';
import { ContentCard } from '@/lib/og/cardLayout';
import type { ConditionCode } from '@/lib/og/types';

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
  let condition: ConditionCode = 'unknown';

  if (shortCode) {
    try {
      const supabase = await createClient();
      const { data: savedPlan } = await supabase
        .from('float_plans')
        .select('*')
        .eq('short_code', shortCode)
        .single();

      if (savedPlan) {
        const [riverResult, putInResult, takeOutResult] = await Promise.all([
          supabase.from('rivers').select('name').eq('id', savedPlan.river_id).single(),
          supabase.from('access_points').select('name').eq('id', savedPlan.start_access_id).single(),
          supabase.from('access_points').select('name').eq('id', savedPlan.end_access_id).single(),
        ]);
        riverName = riverResult.data?.name || riverName;
        putInName = putInResult.data?.name || putInName;
        takeOutName = takeOutResult.data?.name || takeOutName;
        condition = (savedPlan.condition_at_creation || 'unknown') as ConditionCode;
      }
    } catch {
      // Database fetch failed — render with defaults.
    }
  }

  const route = `${truncate(putInName, 22)}  →  ${truncate(takeOutName, 22)}`;
  const body = condition !== 'unknown' ? `${route}  ·  ${getStatusStyles(condition).label}` : route;

  const fonts = loadFredokaFont();
  const avatar = await loadEddyAvatar().catch(() => null);

  return new ImageResponse(
    (
      <ContentCard
        eyebrow="Float Plan"
        title={truncate(riverName, 28)}
        titleColor={BRAND_COLORS.accentCoral}
        body={body}
        avatar={avatar}
      />
    ),
    { ...size, fonts },
  );
}
