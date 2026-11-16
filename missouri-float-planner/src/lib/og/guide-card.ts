// src/lib/og/guide-card.ts
// What the guide link card (app/blog/[slug]/opengraph-image) prints: the
// post's own title and a category kicker.

import { createPublicCatalogClient } from '@/lib/supabase/public-read';

export interface GuideCard {
  title: string;
  eyebrow: string;
}

/** The card for a slug with no published guide. Never a stand-in for a failed lookup. */
export const GENERIC_GUIDE_CARD: GuideCard = { title: 'Float Trip Guide', eyebrow: 'Guide' };

const CATEGORY_KICKER: Record<string, string> = {
  'River Guides': 'River Guide',
  Guides: 'Guide',
};

const MAX_TITLE_LENGTH = 76;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '…';
}

/**
 * The published guide's card, or null when no published guide has this slug.
 *
 * The image route is ISR. Next refuses a `no-store` fetch while it renders one
 * (it raises its static-bailout error before the request leaves), and
 * supabase-js hands that back as `error` instead of throwing. Read with a
 * no-store client, every guide therefore rendered the generic card, which was
 * then cached and scraped by Facebook as the guide's preview. So this reads
 * through the cacheable catalog client, and a failed lookup throws: an error
 * response is not cached and is retried, a wrong card is neither.
 *
 * Public RLS limits the anon key to guides that are published and not
 * future-dated, the same rows the page serves.
 */
export async function guideCard(slug: string): Promise<GuideCard | null> {
  const { data: post, error } = await createPublicCatalogClient()
    .from('blog_posts')
    .select('title, category')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw new Error(`Guide card lookup failed for "${slug}": ${error.message}`);
  if (!post) return null;

  const category = post.category || GENERIC_GUIDE_CARD.eyebrow;
  return {
    title: truncate(post.title || GENERIC_GUIDE_CARD.title, MAX_TITLE_LENGTH),
    eyebrow: CATEGORY_KICKER[category] ?? category,
  };
}
