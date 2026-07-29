'use client';

// src/app/rivers/[slug]/HubSectionNav.tsx
// Sticky in-page section nav for the river hub with scroll-spy + a persistent
// "Plan this float" CTA. The "River guide" tab only appears when the river has
// a published guide (blog).

import { useEffect, useState } from 'react';
import Link from 'next/link';

const SECTIONS = [
  // FIRST, and only when there is one. A closure or a flood warning changes
  // whether the trip happens at all, which outranks what the gauge reads.
  { id: 'alerts', label: 'Alerts' },
  { id: 'status', label: 'Live status' },
  // Only present on a tailwater reach — see fetchRiverDam(). Most rivers have
  // no dam above them, and a tab that scrolls to nothing is worse than no tab.
  { id: 'dam', label: 'Dam release' },
  { id: 'access', label: 'Access points' },
  { id: 'guide', label: 'River guide' },
];

/**
 * The sections actually rendered for this river, in document order.
 *
 * Called TWICE — once for render and once inside the scroll-spy effect — so a
 * new conditional section has to be added to this one function, or the nav and
 * the spy disagree about which ids exist.
 */
function visibleSections(hasGuide: boolean, hasDam: boolean, hasAlerts: boolean) {
  return SECTIONS.filter(
    (s) =>
      (s.id !== 'guide' || hasGuide) &&
      (s.id !== 'dam' || hasDam) &&
      (s.id !== 'alerts' || hasAlerts)
  );
}

export default function HubSectionNav({
  planUrl,
  hasGuide = true,
  hasDam = false,
  hasAlerts = false,
}: {
  planUrl: string;
  hasGuide?: boolean;
  hasDam?: boolean;
  hasAlerts?: boolean;
}) {
  // Not `sections[0].id` — the default is what a reader is looking at before
  // anything scrolls, and that is Live status whether or not an alerts block
  // sits above it.
  const [active, setActive] = useState('status');
  const sections = visibleSections(hasGuide, hasDam, hasAlerts);

  useEffect(() => {
    const ids = visibleSections(hasGuide, hasDam, hasAlerts).map((s) => s.id);
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
  }, [hasGuide, hasDam, hasAlerts]);

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
          {/* No aria-live here: the gauge <select> is portaled into this slot,
              and wrapping an interactive control in a live region makes screen
              readers re-announce it on mount and on every selection change. */}
          <div id="gauge-selection-slot" className="flex min-h-9 items-center" />
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
