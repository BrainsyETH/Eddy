'use client';

// src/components/blog/FaqAccordion.tsx
// Multi-item accordion with single-open behavior. Each Q is a button so the
// keyboard / screen-reader contract works without extra a11y wiring.

import { useState } from 'react';
import type { FaqItem } from '@/types/blog';

interface Props {
  items: FaqItem[];
}

export default function FaqAccordion({ items }: Props) {
  const [open, setOpen] = useState<number>(0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <div
            key={f.q}
            style={{
              background: '#fff',
              border: '2px solid var(--color-primary-700)',
              borderRadius: 8,
              boxShadow: isOpen
                ? '3px 3px 0 var(--color-neutral-400)'
                : '2px 2px 0 var(--color-neutral-300)',
              transition: 'box-shadow 200ms',
            }}
          >
            <button
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'transparent',
                border: 'none',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'var(--color-neutral-900)',
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 600 }}>{f.q}</span>
              <span
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: isOpen ? 'var(--color-accent-500)' : 'var(--color-neutral-100)',
                  color: isOpen ? '#fff' : 'var(--color-neutral-700)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  lineHeight: 1,
                  transition: 'all 200ms',
                  flexShrink: 0,
                }}
              >
                {isOpen ? '−' : '+'}
              </span>
            </button>
            {isOpen && (
              <div
                style={{
                  padding: '14px 20px 18px',
                  fontSize: 15,
                  lineHeight: 1.65,
                  color: 'var(--color-neutral-700)',
                  borderTop: '1px solid var(--color-neutral-200)',
                }}
              >
                {f.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
