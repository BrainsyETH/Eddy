// src/components/blog/PreLaunchCard.tsx
// "Things to know before you launch" — 3-bullet card surfaced just under
// the TL;DR. Used for hard-won facts that a casual reader will regret
// missing (permits, cell service, shuttle logistics).

import type { GuideBullet } from '@/types/blog';

interface Props {
  notes: GuideBullet[];
}

export default function PreLaunchCard({ notes }: Props) {
  if (notes.length === 0) return null;

  return (
    <aside
      style={{
        marginTop: 16,
        padding: '18px 22px',
        background: 'var(--color-secondary-50)',
        border: '2px solid var(--color-secondary-300)',
        borderLeft: '4px solid var(--color-accent-500)',
        borderRadius: 8,
        boxShadow: '2px 2px 0 var(--color-neutral-300)',
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
          marginBottom: 10,
        }}
      >
        Things to know before you launch
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {notes.map((n) => (
          <li
            key={n.strong}
            style={{
              fontSize: 15,
              lineHeight: 1.55,
              color: 'var(--color-neutral-800)',
              paddingLeft: 22,
              position: 'relative',
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                top: 10,
                width: 12,
                height: 2,
                background: 'var(--color-accent-500)',
              }}
            />
            <strong style={{ color: 'var(--color-neutral-900)', fontWeight: 700 }}>{n.strong}</strong>{' '}
            {n.body}
          </li>
        ))}
      </ul>
    </aside>
  );
}
