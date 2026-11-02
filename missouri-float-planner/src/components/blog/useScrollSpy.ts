'use client';

// src/components/blog/useScrollSpy.ts
// Returns the id of the element nearest the top of the viewport from a list
// of section ids. IntersectionObserver-based — same pattern as the embed-page
// scrollspy at app/embed/page.tsx, but reusable.
//
// `topOffset` is the height of whatever is stuck to the top of the viewport
// (the site header, plus the guide's jump nav below lg), so a section counts
// as current once it clears that band rather than when it slides under it.

import { useEffect, useState } from 'react';

export function useScrollSpy(ids: string[], topOffset = 80): string {
  const [active, setActive] = useState<string>(ids[0] ?? '');
  // Key the observer on the ids' content, not the array's identity, so a
  // caller that rebuilds the array each render doesn't re-observe each render.
  const key = ids.join('|');

  useEffect(() => {
    const list = key ? key.split('|') : [];
    if (list.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: `-${topOffset}px 0px -60% 0px`, threshold: 0 },
    );

    for (const id of list) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, [key, topOffset]);

  return active;
}

/** Smooth-scroll a section to just below the stuck chrome (`offset` px from
 *  the top) and move keyboard focus with it. */
export function scrollToSection(id: string, offset: number): void {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}
