/** Only an explicit editorial date is a content modification date. Operational
 * blog_posts.updated_at and source-check dates must not refresh search dates. */
export function guideEditorialDate(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = (data as { editorial_updated_at?: unknown }).editorial_updated_at;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && date.getTime() <= Date.now() ? value : undefined;
}
