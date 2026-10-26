'use client';

import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import AppLink from '@/components/AppLink';
import { useAppDevice } from '@/components/useAppDevice';
import { damWidgetHeadline, getDamAppPromotion } from '@/lib/dam-app-promotion';
import { trackEvent } from '@/lib/analytics';

export default function DamAppCTA({ damId, damName }: { damId: string; damName: string }) {
  const dam = getDamAppPromotion(damId);
  const device = useAppDevice();
  const ref = useRef<HTMLElement>(null);
  const viewedDam = useRef<string | null>(null);
  const id = dam?.id;
  useEffect(() => {
    if (!id || viewedDam.current === id || device === 'android' || !ref.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
      viewedDam.current = id;
      trackEvent('app_promotion_view', { label: 'dam_schedule', dam_id: id, page_path: window.location.pathname });
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [id, device]);
  if (!dam || device === 'android') return null;

  return (
    <aside ref={ref} aria-label="Eddy for iPhone" data-dam-app-cta={dam.id} className="flex flex-wrap items-center justify-between gap-x-4 border-t border-neutral-200 px-5 py-2 sm:px-6">
      <p className="py-1 text-sm font-medium text-primary-800">{damWidgetHeadline(damName)}</p>
      <AppLink
        campaign={dam.campaign}
        damId={dam.id}
        data-ga-event="app_landing_click"
        data-ga-label="dam_schedule"
        data-ga-dam-id={dam.id}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-700 underline underline-offset-4 hover:text-primary-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-700"
      >
        Get Eddy for iPhone <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
      </AppLink>
    </aside>
  );
}
