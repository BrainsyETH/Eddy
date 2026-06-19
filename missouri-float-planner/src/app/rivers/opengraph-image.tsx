// src/app/rivers/opengraph-image.tsx
// OG image for the River Reports index — clean branded card with Eddy's live
// cross-river summary as the supporting line.

import { ImageResponse } from 'next/og';
import { loadFredokaFont, loadEddyAvatar, loadOtterImage, OTTER_URLS } from '@/lib/og/fonts';
import { BRAND_COLORS } from '@/lib/og/colors';
import { createAdminClient } from '@/lib/supabase/admin';
import { ContentCard } from '@/lib/og/cardLayout';

export const alt = 'River Reports — real-time river conditions on Eddy';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 300;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '…';
}

export default async function Image() {
  let eddyQuote: string | null = null;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('eddy_updates')
      .select('summary_text, quote_text')
      .eq('river_slug', 'global')
      .is('section_slug', null)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) eddyQuote = data.summary_text || data.quote_text || null;
  } catch {
    // No live summary — fall back to the static tagline below.
  }

  const fonts = loadFredokaFont();
  const [avatar, otter] = await Promise.all([
    loadEddyAvatar().catch(() => null),
    loadOtterImage(OTTER_URLS.standard).catch(() => null),
  ]);

  return new ImageResponse(
    (
      <ContentCard
        title="River Reports"
        titleColor={BRAND_COLORS.accentCoral}
        body={eddyQuote ? truncate(eddyQuote, 140) : 'Live water levels and conditions for every Missouri float river.'}
        avatar={avatar}
        otter={otter}
      />
    ),
    { ...size, fonts },
  );
}
