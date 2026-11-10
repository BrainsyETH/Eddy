import { createHash } from 'node:crypto';
import type { RiverGuideSeed } from './river-guide-seeds';

export type GuideEditorialFields = Pick<RiverGuideSeed, 'title' | 'description' | 'guide_data' | 'read_time_minutes'>;
export type CurrentGuide = GuideEditorialFields & { slug: string; river_slug: string | null; updated_at: string };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function editorialFields(row: GuideEditorialFields): GuideEditorialFields {
  return { title: row.title, description: row.description, guide_data: row.guide_data, read_time_minutes: row.read_time_minutes };
}

export function editorialFingerprint(row: GuideEditorialFields): string {
  return createHash('sha256').update(stable(editorialFields(row))).digest('hex');
}

/** Preflight the entire batch before the first write. A later editor wins;
 * operational timestamp changes do not invalidate the reviewed baseline. */
export function planGuideRefresh(seeds: RiverGuideSeed[], current: CurrentGuide[], baseline: Record<string, string>) {
  return seeds.flatMap(seed => {
    const row = current.find(post => post.slug === seed.slug);
    if (!row || row.river_slug !== seed.river_slug) throw new Error(`Missing or changed guide identity: ${seed.slug}`);
    const actual = editorialFingerprint(row);
    if (actual === editorialFingerprint(seed)) return [];
    if (!baseline[seed.slug] || actual !== baseline[seed.slug]) throw new Error(`Editorial changes need review: ${seed.slug}`);
    return [{ slug: seed.slug, expectedUpdatedAt: row.updated_at, before: editorialFields(row), after: editorialFields(seed) }];
  });
}
