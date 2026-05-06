// src/components/blog/SegmentHeader.tsx
// Visual header that groups the FloatSectionCards belonging to a single
// segment (Upper / Middle / Lower).

import type { GuideSegment } from '@/types/blog';

interface Props {
  segment: GuideSegment;
}

export default function SegmentHeader({ segment }: Props) {
  return (
    <div style={{ marginTop: 28, marginBottom: 12 }}>
      <div
        className="eyebrow"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: 'var(--color-primary-700)',
          marginBottom: 6,
        }}
      >
        Segment · {segment.id}
      </div>
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-.01em',
          lineHeight: 1.2,
          color: 'var(--color-neutral-900)',
          margin: 0,
          marginBottom: 8,
        }}
      >
        {segment.label}
      </h3>
      <p
        style={{
          fontSize: 15,
          lineHeight: 1.6,
          color: 'var(--color-neutral-700)',
          margin: 0,
          marginBottom: 10,
        }}
      >
        {segment.character}
      </p>
      {segment.best_for.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {segment.best_for.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '.04em',
                padding: '3px 9px',
                background: 'var(--color-secondary-100)',
                color: 'var(--color-secondary-800)',
                border: '1px solid var(--color-secondary-300)',
                borderRadius: 999,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
