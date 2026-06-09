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
        }}
      >
        {segment.character}
      </p>
    </div>
  );
}
