// src/components/blog/DriveTimesStrip.tsx
// Mile-stat-strip-shaped row showing drive times from canonical reference
// cities. Mirrors the hero stat strip's visual weight.

import type { DriveTime } from '@/types/blog';

interface Props {
  driveTimes: DriveTime[];
}

export default function DriveTimesStrip({ driveTimes }: Props) {
  if (driveTimes.length === 0) return null;

  return (
    <div
      data-guide-drive-times
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${driveTimes.length}, 1fr)`,
        gap: 0,
        background: 'var(--color-secondary-50)',
        border: '2px solid var(--color-primary-700)',
        borderRadius: 8,
        boxShadow: '2px 2px 0 var(--color-neutral-300)',
        padding: '14px 18px',
      }}
    >
      {driveTimes.map((d, i) => (
        <div
          key={d.city}
          style={{
            padding: '0 14px',
            borderRight: i < driveTimes.length - 1 ? '1px dashed var(--color-neutral-300)' : 'none',
          }}
        >
          <div
            className="eyebrow"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'var(--color-neutral-500)',
              marginBottom: 4,
            }}
          >
            {d.city}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-neutral-900)',
            }}
          >
            {d.hours}
          </div>
        </div>
      ))}
    </div>
  );
}
