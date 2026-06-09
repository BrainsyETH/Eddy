// src/components/blog/NearbyAttractionsList.tsx
// Compact list of nearby attractions (state parks, caves, historic sites)
// — same visual weight as the springs list. Renders links when an
// attraction has a canonical URL; always renders a Google Maps directions
// link as a secondary action.

import type { NearbyAttraction } from '@/types/blog';

interface Props {
  attractions: NearbyAttraction[];
}

function mapsUrl(name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' Missouri')}`;
}

export default function NearbyAttractionsList({ attractions }: Props) {
  if (attractions.length === 0) return null;

  return (
    <div
      style={{
        background: 'var(--color-secondary-50)',
        border: '2px solid var(--color-primary-700)',
        borderRadius: 8,
        boxShadow: '2px 2px 0 var(--color-neutral-300)',
        overflow: 'hidden',
      }}
    >
      {attractions.map((a, i) => {
        const titleNode = a.url ? (
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--color-neutral-900)',
              textDecoration: 'none',
              borderBottom: '1.5px solid var(--color-accent-500)',
            }}
          >
            {a.name}
          </a>
        ) : (
          a.name
        );
        return (
          <div
            key={a.name}
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr',
              gap: 0,
              padding: '14px 22px',
              borderTop: i ? '1px dashed var(--color-neutral-300)' : 'none',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'var(--color-accent-600)',
              }}
            >
              {a.kind}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-neutral-900)', marginBottom: 2 }}>
                {titleNode}
              </div>
              <div style={{ fontSize: 14, color: 'var(--color-neutral-700)', lineHeight: 1.5, marginBottom: 4 }}>
                {a.note}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {a.url && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-600)', textDecoration: 'none' }}
                  >
                    Visit official site →
                  </a>
                )}
                <a
                  href={mapsUrl(a.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-600)', textDecoration: 'none' }}
                >
                  Get directions →
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
