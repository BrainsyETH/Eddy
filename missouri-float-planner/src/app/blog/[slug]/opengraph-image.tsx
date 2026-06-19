// src/app/blog/[slug]/opengraph-image.tsx
// Dynamic OG image for blog posts (River Guides + general Guides). Renders a
// branded 1200×630 card — category eyebrow, post title in Fredoka, Eddy
// wordmark, and the post's hero photo as a darkened backdrop — so shared links
// match the rest of the site instead of falling back to a raw screenshot.

import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFredokaFont, loadEddyAvatar } from '@/lib/og/fonts';
import { BRAND_COLORS } from '@/lib/og/colors';

export const alt = 'Float trip guide on Eddy';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 300;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '…';
}

async function loadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const type = res.headers.get('content-type') || 'image/jpeg';
    return `data:${type};base64,${Buffer.from(buf).toString('base64')}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let title = 'Float Trip Guide';
  let category = 'Guide';
  let heroUrl: string | null = null;

  try {
    const supabase = createAdminClient();
    const { data: post } = await supabase
      .from('blog_posts')
      .select('title, category, featured_image_url, og_image_url, guide_data')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (post) {
      title = post.title || title;
      category = post.category || category;
      heroUrl =
        post.guide_data?.hero?.photo_url ||
        post.featured_image_url ||
        post.og_image_url ||
        null;
    }
  } catch {
    // Fall back to brand defaults
  }

  const fonts = loadFredokaFont();
  const [heroImage, avatar] = await Promise.all([
    heroUrl ? loadImage(heroUrl) : Promise.resolve(null),
    loadEddyAvatar().catch(() => null),
  ]);

  const eyebrow = category.toUpperCase();
  const titleSize = title.length > 78 ? 56 : title.length > 54 ? 66 : title.length > 32 ? 78 : 92;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: '#1A3D40',
          position: 'relative',
          padding: '64px 72px',
          justifyContent: 'flex-end',
        }}
      >
        {/* Hero photo backdrop */}
        {heroImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage}
            alt=""
            width={1200}
            height={630}
            style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, objectFit: 'cover' }}
          />
        )}
        {/* Legibility overlay — dark gradient bottom + brand tint */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: heroImage
              ? 'linear-gradient(180deg, rgba(15,45,53,0.35) 0%, rgba(15,45,53,0.78) 60%, rgba(15,45,53,0.94) 100%)'
              : 'linear-gradient(135deg, #0F2D35 0%, #163F4A 55%, #1A4F5C 100%)',
          }}
        />

        {/* Eddy wordmark lockup — top left */}
        <div style={{ display: 'flex', alignItems: 'center', position: 'absolute', top: 56, left: 72, gap: 14 }}>
          {avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} width={56} height={56} alt="" style={{ borderRadius: 12 }} />
          )}
          <span style={{ fontFamily: 'Fredoka', fontSize: 40, fontWeight: 600, color: '#fff', letterSpacing: -1 }}>
            Eddy
          </span>
        </div>

        {/* Category eyebrow */}
        <span
          style={{
            position: 'relative',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 4,
            color: BRAND_COLORS.accentCoral,
            marginBottom: 18,
          }}
        >
          {eyebrow}
        </span>

        {/* Title */}
        <span
          style={{
            position: 'relative',
            fontFamily: 'Fredoka',
            fontSize: titleSize,
            fontWeight: 600,
            color: '#fff',
            lineHeight: 1.05,
            letterSpacing: -1.5,
            maxWidth: 1000,
          }}
        >
          {truncate(title, 96)}
        </span>

        {/* Domain watermark */}
        <span
          style={{
            position: 'absolute',
            bottom: 28,
            right: 48,
            fontSize: 20,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.65)',
          }}
        >
          eddy.guide
        </span>

        {/* Bottom accent bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: `linear-gradient(90deg, ${BRAND_COLORS.accentCoral} 0%, ${BRAND_COLORS.bluewater} 100%)`,
          }}
        />
      </div>
    ),
    { ...size, fonts },
  );
}
