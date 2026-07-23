'use client';

// src/app/rivers/[slug]/HubSectionNav.tsx
// Sticky in-page section nav for the river hub with scroll-spy + a persistent
// "Plan this float" CTA. The "River guide" tab only appears when the river has
// a published guide (blog).

import { useEffect, useState } from 'react';
import Link from 'next/link';

const SECTIONS = [
  { id: 'status', label: 'Live status' },
  { id: 'access', label: 'Access points' },
  { id: 'guide', label: 'River guide' },
];

export default function HubSectionNav({ planUrl, hasGuide = true }: { planUrl: string; hasGuide?: boolean }) {
  const [active, setActive] = useState('status');
  const sections = hasGuide ? SECTIONS : SECTIONS.filter((s) => s.id !== 'guide');

  useEffect(() => {
    const ids = (hasGuide ? SECTIONS : SECTIONS.filter((s) => s.id !== 'guide')).map((s) => s.id);
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        let current = ids[0];
        for (const id of ids) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= 160) current = id;
        }
        setActive(current);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [hasGuide]);

  return (
    <div className="sticky top-14 z-40 bg-white/95 backdrop-blur-sm border-b border-neutral-200">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 px-4 py-2">
        <nav className="scrollbar-hide -mx-1 flex min-w-0 gap-1 overflow-x-auto px-1">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(s.id);
                if (!el) return;
                const y = el.getBoundingClientRect().top + window.scrollY - 120;
                window.scrollTo({ top: y, behavior: 'smooth' });
              }}
              className={`whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold no-underline transition-colors sm:px-3 ${
                s.id === 'guide' ? 'hidden sm:block' : ''
              } ${
                active === s.id ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {s.label}
            </a>
          ))}
        </nav>
        <div className="flex flex-shrink-0 items-center gap-2">
          <div id="gauge-selection-slot" className="flex min-h-9 items-center" aria-live="polite" />
          <Link
            href={planUrl}
            className="hidden flex-shrink-0 items-center rounded-md border-2 border-accent-700 bg-accent-500 px-4 py-1.5 text-sm font-semibold text-white no-underline shadow-[2px_2px_0_var(--color-accent-700)] transition-colors hover:bg-accent-600 sm:inline-flex"
          >
            Plan this float
          </Link>
        </div>
      </div>
    </div>
  );
}
