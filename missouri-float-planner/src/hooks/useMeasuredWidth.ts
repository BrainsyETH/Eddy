'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * An element's width in CSS pixels, so an SVG's viewBox can match it and text
 * keeps its size on a phone. Starts at `initial` for the server render.
 */
export function useMeasuredWidth<T extends HTMLElement>(initial: number, minimum = 280): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = () => setWidth(Math.max(minimum, Math.round(el.getBoundingClientRect().width)));
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [minimum]);
  return [ref, width];
}
