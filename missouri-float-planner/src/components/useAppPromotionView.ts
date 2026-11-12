'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';

/** One visible invitation per placement/context/page, including responsive duplicates. */
export function useAppPromotionView<T extends HTMLElement>(label: string | undefined, context: string, enabled: boolean, damId?: string) {
  const ref = useRef<T>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (!enabled || !label || !ref.current || typeof IntersectionObserver === 'undefined') return;
    const browser = window as Window & { __eddyPromotionViews?: { path: string; keys: Set<string> } };
    if (browser.__eddyPromotionViews?.path !== pathname) browser.__eddyPromotionViews = { path: pathname, keys: new Set() };
    const views = browser.__eddyPromotionViews.keys;
    const key = `${label}:${context}`;
    if (views.has(key)) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
      if (!views.has(key)) {
        views.add(key);
        trackEvent('app_promotion_view', { label, page_path: window.location.pathname, ...(damId ? { dam_id: damId } : {}) });
      }
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [label, context, enabled, damId, pathname]);
  return ref;
}
