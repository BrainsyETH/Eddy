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
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between gap-3 py-2">
        <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
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
              className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-semibold transition-colors no-underline ${
                active === s.id ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {s.label}
            </a>
          ))}
        </nav>
        <Link
          href={planUrl}
          className="hidden sm:inline-flex flex-shrink-0 items-center px-4 py-2 rounded-lg text-sm font-semibold text-white no-underline transition-all hover:brightness-110"
          style={{ backgroundColor: '#F07052' }}
        >
          Plan this float
        </Link>
      </div>
    </div>
  );
}
