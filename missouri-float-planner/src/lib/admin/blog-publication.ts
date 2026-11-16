export const BLOG_CATEGORIES = [
  'Guides',
  'River Guides',
  'Tips',
  'News',
  'Safety',
  'River Profiles',
  'Gear Reviews',
  'Trip Reports',
];
export type BlogStatus = 'draft' | 'published' | 'scheduled';
export function publicationState(
  status: unknown,
  date: unknown,
  currentDate: string | null = null,
  now = Date.now(),
): { status: BlogStatus; published_at: string | null } {
  if (status !== 'draft' && status !== 'published' && status !== 'scheduled')
    throw new Error('Choose draft, published, or scheduled.');
  const supplied = date === undefined ? currentDate : date;
  const timestamp = supplied
    ? typeof supplied === 'string'
      ? Date.parse(supplied)
      : NaN
    : null;
  if (timestamp !== null && !Number.isFinite(timestamp))
    throw new Error('Enter a valid publish date.');
  if (status === 'scheduled' && (timestamp === null || timestamp <= now))
    throw new Error('Choose a future date and time to schedule this post.');
  if (status === 'published' && timestamp !== null && timestamp > now)
    throw new Error('Use Schedule for a future publish date.');
  return {
    status,
    published_at:
      status === 'published'
        ? new Date(timestamp ?? now).toISOString()
        : timestamp === null
          ? null
          : new Date(timestamp).toISOString(),
  };
}
export function formatAdminPost(data: Record<string, unknown>) {
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    description: data.description,
    content: data.content,
    category: data.category,
    featuredImageUrl: data.featured_image_url,
    ogImageUrl: data.og_image_url,
    metaKeywords: data.meta_keywords,
    readTimeMinutes: data.read_time_minutes,
    status: data.status,
    publishedAt: data.published_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    structuredGuide: !!data.guide_data,
    riverSlug: data.river_slug,
  };
}
