// src/components/blog/RelatedRiversStrip.tsx
// Horizontal pill row at the bottom of a guide pointing readers to
// neighboring river pages.

import Link from 'next/link';
import type { RelatedRiver } from '@/types/blog';

interface Props {
  rivers: RelatedRiver[];
}

export default function RelatedRiversStrip({ rivers }: Props) {
  if (rivers.length === 0) return null;

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
        {rivers.map((r) => (
          <Link
            key={r.slug}
            href={`/plan?river=${r.slug}`}
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
