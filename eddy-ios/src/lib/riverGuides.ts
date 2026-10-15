/** Public evergreen articles, separate from the subscription-based daily Reads. */
export interface RiverGuideSummary {
  slug: string;
  title: string;
  description: string | null;
  category: string;
  riverSlug?: string | null;
  featuredImageUrl: string | null;
  featuredImageAlt?: string;
  imageCredit?: {
    author: string;
    sourceUrl: string;
    license: string;
    licenseUrl: string;
    caption: string;
    changes: string;
  } | null;
  readTimeMinutes: number | null;
}

export function selectRiverGuides(posts: RiverGuideSummary[], search = ''): RiverGuideSummary[] {
  const query = search.trim().toLocaleLowerCase();
  return posts.filter(post => post.category === 'River Guides' &&
    (!query || `${post.title} ${post.description ?? ''}`.toLocaleLowerCase().includes(query)))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** One published guide per local calendar day, independent of API ordering. */
export function selectFeaturedRiverGuide(posts: RiverGuideSummary[], now: number): RiverGuideSummary | null {
  const guides = posts.filter(post => post.category === 'River Guides')
    .sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  if (!guides.length) return null;
  const date = new Date(now);
  // Count calendar dates, not elapsed local hours: DST days have 23 or 25 hours.
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return guides[((day % guides.length) + guides.length) % guides.length];
}

export function riverGuideUrl(slug: string): string {
  return `https://eddy.guide/blog/${encodeURIComponent(slug)}`;
}
