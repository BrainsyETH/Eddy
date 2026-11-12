'use client';

import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import AppLink from '@/components/AppLink';
import { useAppDevice } from '@/components/useAppDevice';
import { damWidgetHeadline, getDamAppPromotion } from '@/lib/dam-app-promotion';
import { useAppPromotionView } from '../useAppPromotionView';

export default function DamAppCTA({ damId, damName }: { damId: string; damName: string }) {
  const dam = getDamAppPromotion(damId);
  const device = useAppDevice();
  const ref = useAppPromotionView<HTMLElement>('dam_schedule', damId, !!dam && device !== 'android', dam?.id);
  if (!dam || device === 'android') return null;

  return (
    <aside ref={ref} aria-label="Eddy for iPhone" data-dam-app-cta={dam.id} className="flex flex-wrap items-center justify-between gap-x-4 border-t border-neutral-200 bg-secondary-50 px-5 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <Image src="/icons/eddy-wave.png" alt="" width={40} height={46} className="h-11 w-auto shrink-0" />
        <p className="py-1 text-sm font-medium text-neutral-800">{damWidgetHeadline(damName)}</p>
      </div>
      <AppLink
        trackView={false}
        campaign={dam.campaign}
        damId={dam.id}
        data-ga-label="dam_schedule"
        data-ga-dam-id={dam.id}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-700 underline underline-offset-4 hover:text-primary-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-700"
      >
        Get Eddy for iPhone <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
      </AppLink>
    </aside>
  );
}
