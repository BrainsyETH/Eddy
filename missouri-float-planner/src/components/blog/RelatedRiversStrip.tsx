// src/components/blog/RelatedRiversStrip.tsx
// Horizontal pill row at the bottom of a guide pointing readers to other
// rivers' guides. Each pill simply names the river and "Guide" and links to
// that river's published River Guide (falling back to the river report if no
// guide exists yet). Resolved server-side so labels/links stay correct as
// guides are added or renamed.

import Link from 'next/link';
import type { RelatedRiver } from '@/types/blog';
import { createAdminClient } from '@/lib/supabase/admin';

interface Props {
  rivers: RelatedRiver[];
}

interface ResolvedRelated {
  slug: string;
  label: string;
  href: string;
}

export default async function RelatedRiversStrip({ rivers }: Props) {
  if (rivers.length === 0) return null;

  const slugs = rivers.map((r) => r.slug);
  const supabase = createAdminClient();

  const [{ data: riverRows }, { data: guideRows }] = await Promise.all([
    supabase.from('rivers').select('slug, name').in('slug', slugs),
    supabase
      .from('blog_posts')
      .select('slug, river_slug')
      .eq('category', 'River Guides')
      .eq('status', 'published')
      .in('river_slug', slugs),
  ]);

  const nameBySlug = new Map(
    ((riverRows ?? []) as { slug: string; name: string }[]).map((r) => [r.slug, r.name]),
  );
  const guideBySlug = new Map(
    ((guideRows ?? []) as { slug: string; river_slug: string }[]).map((g) => [g.river_slug, g.slug]),
  );

  // Preserve the order given in related_rivers; drop any river we can't name.
  const items: ResolvedRelated[] = rivers
    .map((r): ResolvedRelated | null => {
      const name = nameBySlug.get(r.slug);
      if (!name) return null;
      const guideSlug = guideBySlug.get(r.slug);
      return {
        slug: r.slug,
        label: `${name} Guide`,
        href: guideSlug ? `/blog/${guideSlug}` : `/rivers/${r.slug}`,
      };
    })
    .filter((x): x is ResolvedRelated => x !== null);

  if (items.length === 0) return null;

  return (
    <div style={{ marginTop: 36 }}>
      <div
        className="eyebrow"
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: 'var(--color-neutral-500)',
          marginBottom: 10,
        }}
      >
        See also
      </div>
      <div data-guide-related-rivers style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.map((r) => (
          <Link
            key={r.slug}
            href={r.href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '8px 14px',
              background: '#fff',
              border: '2px solid var(--color-primary-700)',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-neutral-900)',
              textDecoration: 'none',
              boxShadow: '2px 2px 0 var(--color-neutral-300)',
            }}
          >
            {r.label} →
          </Link>
        ))}
      </div>
    </div>
  );
}
