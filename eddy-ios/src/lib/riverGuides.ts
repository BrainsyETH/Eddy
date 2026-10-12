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

export function riverGuideUrl(slug: string): string {
  return `https://eddy.guide/blog/${encodeURIComponent(slug)}`;
}
