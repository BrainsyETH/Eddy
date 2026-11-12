'use client';

import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import AppLink, { useAppCampaign } from './AppLink';
import { useAppDevice } from './useAppDevice';
import { useAppPromotionView } from './useAppPromotionView';
import { appLandingUrl, appStoreUrl } from '@/lib/app-discovery';
import { destinationCampaign, nativeDestination, type AppDestination } from '@/lib/app-destination';

export default function AppCta({ destination, title, detail, label, variant = 'card', widget = false, landing = false, campaign: initialCampaign }: {
  destination: AppDestination;
  title: string;
  detail?: string;
  label: string;
  variant?: 'inline' | 'card';
  widget?: boolean;
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
              <a className="btn-outline min-h-11" href={`eddy://${nativeDestination(destination)}`}
                data-ga-event="app_open_click" data-ga-label={label} data-ga-campaign={campaign ?? undefined}>
                Open {destination.kind === 'plan' ? 'this plan' : noun} in Eddy <ArrowRight className="size-4" aria-hidden="true" />
              </a>
              <a className="app-cta__link" href={appStoreUrl(campaign)} target="_blank" rel="noopener noreferrer"
                data-ga-event="app_store_click" data-ga-label={label} data-ga-campaign={campaign ?? undefined}>Get Eddy for iPhone</a>
            </> : <AppLink store={landing} destination={destination} campaign={campaign} trackView={false}
              className="app-cta__link" data-ga-label={label}>Get Eddy for iPhone <ArrowRight className="size-4" aria-hidden="true" /></AppLink>}
          </div>
          {device === 'ios' && destination.kind === 'plan' && <p className="text-xs text-neutral-500">After installing, return here to open your plan.</p>}
        </div>
      </div>
      {widget && <figure className="app-cta__widget">
        <Image src="/app-store/08-your-rivers-at-a-glance.webp" width={1206} height={2622}
          alt="Eddy’s Your rivers Home Screen widget, shown as an example" sizes="180px" />
        <figcaption>Widget example</figcaption>
      </figure>}
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
