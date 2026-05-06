// src/components/blog/NearbyAttractionsList.tsx
// Compact list of nearby attractions (state parks, caves, historic sites)
// — same visual weight as the springs list.

import type { NearbyAttraction } from '@/types/blog';

interface Props {
  attractions: NearbyAttraction[];
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
      {attractions.map((a, i) => (
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
              {a.name}
            </div>
            <div style={{ fontSize: 14, color: 'var(--color-neutral-700)', lineHeight: 1.5 }}>
              {a.note}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
