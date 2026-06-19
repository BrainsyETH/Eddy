// src/app/blog/[slug]/opengraph-image.tsx
// Dynamic OG image for blog posts (River Guides + general Guides) — Field
// Notebook card: Eddy logo, category kicker, and the post title.

import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFredokaFont, loadEddyAvatar } from '@/lib/og/fonts';
import { CardFrame } from '@/lib/og/cardLayout';

export const alt = 'Float trip guide on Eddy';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 300;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '…';
}

const CATEGORY_KICKER: Record<string, string> = {
  'River Guides': 'River Guide',
  Guides: 'Guide',
};

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let title = 'Float Trip Guide';
  let category = 'Guide';

  try {
    const supabase = createAdminClient();
    const { data: post } = await supabase
      .from('blog_posts')
      .select('title, category')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();
    if (post) {
      title = post.title || title;
      category = post.category || category;
    }
  } catch {
    // Fall back to brand defaults.
  }

  const fonts = loadFredokaFont();
  const avatar = await loadEddyAvatar().catch(() => null);

  return new ImageResponse(
    (
      <CardFrame
        eyebrow={CATEGORY_KICKER[category] ?? category}
        title={truncate(title, 76)}
        avatar={avatar}
      />
    ),
    { ...size, fonts },
  );
}
