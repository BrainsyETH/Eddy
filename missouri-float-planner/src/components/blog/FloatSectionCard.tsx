// src/components/blog/FloatSectionCard.tsx
// Photo-left card used in the "Pick your float" section list. Stacks photo
// above text under 768px via the [data-stack] attribute + CSS variables.

import Link from 'next/link';
import Image from 'next/image';
import type { FloatSection } from '@/types/blog';

interface Props {
  section: FloatSection;
  index: number;
  /** When provided, the section title becomes a link to the planner pre-loaded
   *  with this section's put-in and take-out. Built by RiverGuideLayout from
   *  the section's from_slug / to_slug after resolving access point IDs. */
  plannerUrl?: string;
}

const DIFF_COLORS: Record<string, { bg: string; fg: string; bd: string }> = {
  I:    { bg: 'var(--color-support-100)', fg: 'var(--color-support-700)', bd: 'var(--color-support-500)' },
  'I–II': { bg: 'var(--color-support-100)', fg: 'var(--color-support-700)', bd: 'var(--color-support-500)' },
  II:   { bg: '#FFFBEB', fg: '#92400E', bd: '#FCD34D' },
};

export default function FloatSectionCard({ section: s, index, plannerUrl }: Props) {
  const dc = DIFF_COLORS[s.diff] ?? DIFF_COLORS.I;
  const titleContent = (
    <>
      {s.from} <span style={{ color: 'var(--color-neutral-400)' }}>→</span> {s.to}
    </>
  );
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
          gridTemplateColumns: s.photo ? '260px 1fr' : '120px 1fr',
        }}
      >
        {s.photo ? (
          <div
            style={{
              position: 'relative',
              minHeight: 240,
              borderRight: '2px solid var(--color-primary-700)',
              background: 'var(--color-secondary-100)',
              overflow: 'hidden',
            }}
          >
            <Image
              src={s.photo}
              alt={`${s.from} → ${s.to}`}
              fill
              loading="lazy"
              sizes="(max-width: 767px) 100vw, 260px"
              style={{ objectFit: 'cover' }}
            />
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
                zIndex: 1,
              }}
            >
              {index + 1}
            </div>
          </div>
        ) : (
          <div
            style={{
              background: 'var(--color-secondary-50)',
              borderRight: '2px solid var(--color-primary-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px 0',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 56,
                fontWeight: 600,
                color: 'var(--color-accent-500)',
                lineHeight: 1,
                letterSpacing: '-.02em',
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
            {plannerUrl ? (
              <Link
                href={plannerUrl}
                style={{
                  color: 'inherit',
                  textDecoration: 'none',
                  borderBottom: '2px solid var(--color-accent-500)',
                  paddingBottom: 1,
                }}
              >
                {titleContent}
              </Link>
            ) : (
              titleContent
            )}
          </h3>
          {plannerUrl && (
            <Link
              href={plannerUrl}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-accent-600)',
                textDecoration: 'none',
                letterSpacing: '.02em',
              }}
            >
              Open this float in the planner →
            </Link>
          )}
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
            data-guide-section-stats
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 0,
              margin: '14px 0 16px',
              padding: '10px 0',
              borderTop: '1px solid var(--color-neutral-200)',
              borderBottom: '1px solid var(--color-neutral-200)',
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
                  padding: '0 14px',
                  borderRight: i < 3 ? '1px dashed var(--color-neutral-300)' : 'none',
                  minWidth: 0,
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
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
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
