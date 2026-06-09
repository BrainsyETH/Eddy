'use client';

// src/components/blog/GuideTOC.tsx
// Sticky left-rail table of contents with active-section scrollspy and a
// "Plan This Float" CTA card at the bottom. Hidden under 1024px via the
// data-guide-toc attribute (RiverGuideLayout sets the responsive grid).

import Link from 'next/link';
import { useScrollSpy } from './useScrollSpy';

export interface TocItem {
  id: string;
  label: string;
}

interface Props {
  items: TocItem[];
  riverSlug: string | null;
  riverName: string;
}

export default function GuideTOC({ items, riverSlug, riverName }: Props) {
  const ids = items.map((t) => t.id);
  const active = useScrollSpy(ids);

  const onJump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <nav data-guide-toc style={{ position: 'sticky', top: 80 }}>
      <div
        className="eyebrow"
        style={{
          marginBottom: 14,
          color: 'var(--color-neutral-500)',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '.12em',
        }}
      >
        In this guide
      </div>
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          borderLeft: '2px solid var(--color-neutral-200)',
        }}
      >
        {items.map((t, i) => {
          const isActive = active === t.id;
          return (
            <li key={t.id}>
              <a
                onClick={onJump(t.id)}
                href={`#${t.id}`}
                style={{
                  display: 'block',
                  padding: '8px 14px',
                  marginLeft: -2,
                  borderLeft: `2px solid ${isActive ? 'var(--color-accent-500)' : 'transparent'}`,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--color-neutral-900)' : 'var(--color-neutral-600)',
                  textDecoration: 'none',
                  transition: 'all 150ms',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: isActive ? 'var(--color-accent-600)' : 'var(--color-neutral-400)',
                    marginRight: 8,
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                {t.label}
              </a>
            </li>
          );
        })}
      </ol>

      {riverSlug && (
        <div
          style={{
            marginTop: 22,
            padding: 16,
            background: 'var(--color-primary-800)',
            borderRadius: 8,
            boxShadow: '3px 3px 0 var(--color-primary-700)',
          }}
        >
          <div
            className="eyebrow"
            style={{
              color: 'var(--color-accent-300)',
              marginBottom: 6,
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.12em',
            }}
          >
            Plan this float
          </div>
          <div
            style={{
              color: '#fff',
              fontSize: 14,
              lineHeight: 1.4,
              marginBottom: 12,
            }}
          >
            Open the {riverName} planner with live conditions.
          </div>
          <Link
            href={`/rivers/${riverSlug}`}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 14px',
              background: 'var(--color-accent-500)',
              color: '#fff',
              border: '2px solid var(--color-neutral-900)',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              textAlign: 'center',
              textDecoration: 'none',
              boxShadow: '2px 2px 0 var(--color-neutral-900)',
            }}
          >
            Start planning →
          </Link>
        </div>
      )}
    </nav>
  );
}
