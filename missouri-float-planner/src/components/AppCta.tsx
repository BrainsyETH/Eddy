'use client';

import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import AppLink, { useAppCampaign } from './AppLink';
import { useAppDevice } from './useAppDevice';
import { useAppPromotionView } from './useAppPromotionView';
import { appLandingUrl, appStoreUrl } from '@/lib/app-discovery';
import { destinationCampaign, nativeDestination, type AppDestination } from '@/lib/app-destination';

export default function AppCta({ destination, title, detail, label, variant = 'card', landing = false, campaign: initialCampaign }: {
  destination: AppDestination;
  title: string;
  detail?: string;
  label: string;
  variant?: 'inline' | 'card';
  landing?: boolean;
  campaign?: string | null;
}) {
  const device = useAppDevice();
  const campaign = useAppCampaign(initialCampaign ?? destinationCampaign(destination));
  const ref = useAppPromotionView<HTMLElement>(label, JSON.stringify(destination), device !== 'android');
  if (device === 'android') return null;
  const landingUrl = appLandingUrl(campaign, undefined, destination);
  const query = landingUrl.split('?')[1] ?? '';
  const noun = destination.kind === 'plan' ? 'plan' : destination.kind === 'access' ? 'access point' : destination.kind;
  return (
    <aside ref={ref} data-app-cta={label} aria-label={title}
      className={variant === 'inline' ? 'app-cta app-cta--inline' : 'app-cta card-panel'}>
      <div className="app-cta__content">
        <Image src="/icons/eddy-wave.png" width={36} height={42} alt="" className="h-10 w-auto shrink-0" />
        <div className="min-w-0">
          <p className="font-display text-base font-semibold text-primary-800">{title}</p>
          {detail && <p className="mt-1 text-sm text-neutral-600">{detail}</p>}
          <div className="app-cta__actions">
            {device === 'ios' ? <>
              <a className="btn-outline min-h-11" href={appStoreUrl(campaign)} target="_blank" rel="noopener noreferrer"
                data-ga-event="app_store_click" data-ga-label={label} data-ga-campaign={campaign ?? undefined}>
                Get Eddy for iPhone <ArrowRight className="size-4" aria-hidden="true" />
              </a>
              <a className="app-cta__link app-cta__open" href={`eddy://${nativeDestination(destination)}`}
                data-ga-event="app_open_click" data-ga-label={label} data-ga-campaign={campaign ?? undefined}>
                Already have Eddy? Open {destination.kind === 'plan' ? 'this plan' : 'it'}
              </a>
            </> : <AppLink store={landing} destination={destination} campaign={campaign} trackView={false}
              className="app-cta__link" data-ga-label={label}>Get Eddy for iPhone <ArrowRight className="size-4" aria-hidden="true" /></AppLink>}
          </div>
          {device === 'ios' && destination.kind === 'plan' && <p className="text-xs text-neutral-500">After installing, return here to open your plan.</p>}
        </div>
      </div>
      {device === 'other' && <details className="app-cta__qr" open={landing}>
        <summary>Send to iPhone</summary>
        <div>
          <Image src={`/api/app/qr?${query}`} width={112} height={112} alt={`Scan to open this ${noun} on your iPhone`} unoptimized />
          <p>Scan with your iPhone</p>
        </div>
      </details>}
    </aside>
  );
}
