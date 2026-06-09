'use client';

// src/components/blog/useScrollSpy.ts
// Returns the id of the element nearest the top of the viewport from a list
// of section ids. IntersectionObserver-based — same pattern as the embed-page
// scrollspy at app/embed/page.tsx, but reusable.

import { useEffect, useState } from 'react';

export function useScrollSpy(ids: string[]): string {
  const [active, setActive] = useState<string>(ids[0] ?? '');

  useEffect(() => {
    if (ids.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, [ids]);

  return active;
}
