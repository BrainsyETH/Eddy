// src/components/blog/RegulationsCard.tsx
// Renders the {topic, rule} list as a single bordered card. Tone is firm
// (it's the rules section) but not alarming — uses the secondary palette.

import type { Regulation } from '@/types/blog';

interface Props {
  regulations: Regulation[];
}

export default function RegulationsCard({ regulations }: Props) {
  if (regulations.length === 0) return null;

  return (
    <div
      style={{
        background: '#fff',
        border: '2px solid var(--color-primary-700)',
        borderRadius: 8,
        boxShadow: '2px 2px 0 var(--color-neutral-300)',
        overflow: 'hidden',
      }}
    >
      {regulations.map((r, i) => (
        <div
          key={r.topic}
          style={{
            padding: '14px 20px',
            borderTop: i ? '1px dashed var(--color-neutral-200)' : 'none',
          }}
        >
          <div
            className="eyebrow"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-700)',
              marginBottom: 4,
            }}
          >
            {r.topic}
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--color-neutral-800)' }}>
            {r.rule}
          </div>
        </div>
      ))}
    </div>
  );
}
