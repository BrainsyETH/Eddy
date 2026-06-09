'use client';

// src/components/blog/GuideProgressBar.tsx
// Fixed-position 3px coral bar at the very top of the viewport that fills as
// the reader scrolls down the article.

import { useEffect, useState } from 'react';

export default function GuideProgressBar() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    function update() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? (window.scrollY / max) * 100 : 0);
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: 'var(--color-neutral-200)',
        zIndex: 60,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--color-accent-500)',
          transition: 'width 80ms linear',
        }}
      />
    </div>
  );
}
