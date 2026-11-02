'use client';

// src/components/blog/GuideJumpNav.tsx
// The guide's table of contents below lg, where the left-rail GuideTOC is
// hidden: a strip of section chips that sticks under the site header. A
// river guide runs a dozen sections, so without it a phone reader had no way
// to reach the gauge or "When to go" except by scrolling through everything
// above them.
//
// Same items and scrollspy as GuideTOC. The current section's chip is
// highlighted (aria-current) and kept in view by scrolling the strip
// sideways, never the page.

import { useEffect, useRef } from 'react';
import type { TocItem } from './GuideTOC';
import { scrollToSection, useScrollSpy } from './useScrollSpy';

/** SiteHeader's sticky bar: h-14 plus its 2px bottom border. */
const HEADER_HEIGHT = 58;
/** This strip's height: 44px chips plus 6px padding top and bottom, plus
 *  its 1px bottom border. */
const NAV_HEIGHT = 57;
/** Breathing room between the stuck chrome and a section's heading. */
const GAP = 12;
const STUCK_CHROME = HEADER_HEIGHT + NAV_HEIGHT + GAP;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function GuideJumpNav({ items }: { items: TocItem[] }) {
  const active = useScrollSpy(
    items.map((t) => t.id),
    STUCK_CHROME,
  );
  const stripRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    const chip = strip?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!strip || !chip) return;
    strip.scrollTo({
      left: chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [active]);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="In this guide"
      className="sticky z-40 border-b border-neutral-200 bg-neutral-50 lg:hidden"
      style={{ top: HEADER_HEIGHT }}
    >
      <div className="relative">
        <ol ref={stripRef} className="scrollbar-hide m-0 flex list-none gap-2 overflow-x-auto px-5 py-1.5">
          {items.map((t) => {
            const isActive = active === t.id;
            return (
              <li key={t.id} className="shrink-0">
                <a
                  href={`#${t.id}`}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(t.id, STUCK_CHROME);
                  }}
                  className={[
                    'inline-flex min-h-11 items-center whitespace-nowrap rounded-lg border px-3.5 text-sm font-semibold no-underline',
                    'transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1',
                    isActive
                      ? 'border-primary-500 bg-primary-500 text-white'
                      : 'border-neutral-300 bg-white text-neutral-700 hover:bg-primary-50',
                  ].join(' ')}
                >
                  {t.label}
                </a>
              </li>
            );
          })}
        </ol>
        {/* Fade at the trailing edge: says "there's more this way" on a strip
            whose scrollbar is hidden. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-neutral-50"
        />
      </div>
    </nav>
  );
}
