// src/components/blog/GuideTldr.tsx
// 4-tile horizontal card just under the hero. Hidden when guide_data.tldr
// is absent so unmigrated rivers degrade cleanly.

import type { GuideTldr } from '@/types/blog';

interface Props {
  tldr: GuideTldr;
}

export default function GuideTldr({ tldr }: Props) {
  const tiles: { label: string; value: string }[] = [
    { label: 'Typical distance',     value: tldr.typical_distance },
    { label: 'Best for beginners',   value: tldr.best_for_beginners },
    { label: 'Primary gauge',        value: tldr.primary_gauge },
  ];
  if (tldr.recommended_outfitter) {
    tiles.push({ label: 'Recommended outfitter', value: tldr.recommended_outfitter });
  }

  return (
    <div
      data-guide-tldr
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${tiles.length}, 1fr)`,
        gap: 0,
        background: '#fff',
        border: '2px solid var(--color-primary-700)',
        borderRadius: 8,
        boxShadow: '3px 3px 0 var(--color-neutral-400)',
        margin: '24px 0 0',
        overflow: 'hidden',
      }}
    >
      {tiles.map((t, i) => (
        <div
          key={t.label}
          style={{
            padding: '16px 18px',
            borderRight: i < tiles.length - 1 ? '1px dashed var(--color-neutral-300)' : 'none',
          }}
        >
          <div
            className="eyebrow"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-600)',
              marginBottom: 6,
            }}
          >
            {t.label}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-neutral-900)', lineHeight: 1.35 }}>
            {t.value}
          </div>
        </div>
      ))}
    </div>
  );
}
