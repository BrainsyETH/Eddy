// src/app/rivers/[slug]/opengraph-image.tsx
// Dynamic OG image for river pages — clean branded card: river name + the live
// Eddy quote + Eddy logo. (Gauge/condition detail intentionally omitted to keep
// the share preview uncluttered.)

import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import { loadFredokaFont, loadEddyAvatar } from '@/lib/og/fonts';
import { BRAND_COLORS } from '@/lib/og/colors';
import { ContentCard } from '@/lib/og/cardLayout';

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
  let eddyQuote: string | null = null;

  if (slug) {
    try {
      const supabase = await createClient();
      const { data: river } = await supabase
        .from('rivers')
        .select('id, name')
        .eq('slug', slug)
        .single();

      if (river) {
        riverName = river.name;
        try {
          const { data: eddyData } = await supabase
            .from('eddy_updates')
            .select('summary_text, quote_text')
            .eq('river_slug', slug)
            .is('section_slug', null)
            .gt('expires_at', new Date().toISOString())
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (eddyData) eddyQuote = eddyData.summary_text || eddyData.quote_text || null;
        } catch {
          // No live quote — card still renders with the river name.
        }
      }
    } catch {
      // DB unavailable — fall back to defaults.
    }
  }

  const fonts = loadFredokaFont();
  const avatar = await loadEddyAvatar().catch(() => null);

  return new ImageResponse(
    (
      <ContentCard
        title={truncate(riverName, 28)}
        titleColor={BRAND_COLORS.accentCoral}
        body={eddyQuote ? truncate(eddyQuote, 150) : undefined}
        avatar={avatar}
      />
    ),
    { ...size, fonts },
  );
}
