// src/components/blog/FloatSectionCard.tsx
// Photo-left card used in the "Pick your float" section list. Stacks photo
// above text under 768px via the [data-stack] attribute + CSS variables.

import type { FloatSection } from '@/types/blog';

interface Props {
  section: FloatSection;
  index: number;
}

const DIFF_COLORS: Record<string, { bg: string; fg: string; bd: string }> = {
  I:    { bg: 'var(--color-support-100)', fg: 'var(--color-support-700)', bd: 'var(--color-support-500)' },
  'I–II': { bg: 'var(--color-support-100)', fg: 'var(--color-support-700)', bd: 'var(--color-support-500)' },
  II:   { bg: '#FFFBEB', fg: '#92400E', bd: '#FCD34D' },
};

export default function FloatSectionCard({ section: s, index }: Props) {
  const dc = DIFF_COLORS[s.diff] ?? DIFF_COLORS.I;
  return (
    <article
      data-guide-section-card
      style={{
        background: '#fff',
        border: '2px solid var(--color-primary-700)',
        borderRadius: 8,
        boxShadow: '3px 3px 0 var(--color-neutral-400)',
        overflow: 'hidden',
        marginBottom: 20,
      }}
    >
      <div
        data-guide-section-grid
        style={{
          display: 'grid',
          gridTemplateColumns: s.photo ? '260px 1fr' : '1fr',
        }}
      >
        {s.photo && (
          <div
            style={{
              backgroundImage: `url(${s.photo})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              minHeight: 240,
              borderRight: '2px solid var(--color-primary-700)',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                width: 44,
                height: 44,
                background: 'var(--color-accent-500)',
                color: '#fff',
                border: '2px solid var(--color-neutral-900)',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 700,
                fontFamily: 'var(--font-display)',
                boxShadow: '2px 2px 0 var(--color-neutral-900)',
              }}
            >
              {index + 1}
            </div>
          </div>
        )}

        <div style={{ padding: '22px 26px' }}>
          <div
            className="eyebrow"
            style={{
              color: 'var(--color-accent-600)',
              marginBottom: 6,
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.12em',
            }}
          >
            Section {index + 1}
          </div>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '-.01em',
              lineHeight: 1.25,
              color: 'var(--color-neutral-900)',
              margin: 0,
              marginBottom: 4,
            }}
          >
            {s.from} <span style={{ color: 'var(--color-neutral-400)' }}>→</span> {s.to}
          </h3>
          <p
            style={{
              fontSize: 13,
              color: 'var(--color-neutral-600)',
              marginBottom: 14,
              fontStyle: 'italic',
              margin: 0,
            }}
          >
            {s.name}
          </p>

          <div
            style={{
              display: 'flex',
              gap: 0,
              margin: '14px 0 16px',
              padding: '10px 0',
              borderTop: '1px solid var(--color-neutral-200)',
              borderBottom: '1px solid var(--color-neutral-200)',
              flexWrap: 'wrap',
            }}
          >
            {[
              ['Distance', `${s.miles} mi`],
              ['Float time', s.time],
              ['Class', s.diff],
              ['Crowd', s.crowd],
            ].map(([k, v], i) => (
              <div
                key={k}
                style={{
                  flex: '1 1 120px',
                  paddingRight: 12,
                  borderRight: i < 3 ? '1px dashed var(--color-neutral-300)' : 'none',
                  paddingLeft: i ? 14 : 0,
                }}
              >
                <div
                  className="eyebrow"
                  style={{
                    marginBottom: 4,
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '.12em',
                    color: 'var(--color-neutral-500)',
                  }}
                >
                  {k}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    fontWeight: 600,
                    color: i === 2 ? dc.fg : 'var(--color-neutral-900)',
                  }}
                >
                  {v}
                </div>
              </div>
            ))}
          </div>

          <p
            style={{
              fontSize: 15,
              lineHeight: 1.65,
              color: 'var(--color-neutral-700)',
              marginBottom: 12,
              margin: 0,
            }}
          >
            {s.body}
          </p>
          <div
            style={{
              fontSize: 13,
              color: 'var(--color-neutral-600)',
              marginTop: 12,
            }}
          >
            <strong style={{ color: 'var(--color-neutral-900)' }}>Best for:</strong> {s.best}
          </div>
        </div>
      </div>
    </article>
  );
}
