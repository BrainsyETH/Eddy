'use client';

import { useEffect, useState, type AnchorHTMLAttributes } from 'react';
import { usePathname } from 'next/navigation';
import { appLandingUrl, appStoreUrl, campaignToken } from '@/lib/app-discovery';

const STORAGE_KEY = 'eddy_app_campaign';

/** Last explicit campaign wins for this tab's visit; storage is optional. */
export function readAppCampaign(): string | null {
  const incoming = campaignToken(new URLSearchParams(window.location.search).get('ct'));
  try {
    if (incoming) window.sessionStorage.setItem(STORAGE_KEY, incoming);
    return incoming ?? campaignToken(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return incoming;
  }
}

export function useAppCampaign(initialCampaign?: string | null) {
  const pathname = usePathname();
  const [campaign, setCampaign] = useState(initialCampaign ?? null);
  useEffect(() => {
    setCampaign(readAppCampaign() ?? initialCampaign ?? null);
  }, [pathname, initialCampaign]);
  return campaign;
}

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  store?: boolean;
  campaign?: string | null;
};

export default function AppLink({ store = false, campaign: initialCampaign, ...props }: Props) {
  const campaign = useAppCampaign(initialCampaign);
  // A document navigation to /app gives Safari the campaign-specific banner
  // in the initial HTML. Native banners aren't guaranteed to re-read SPA meta.
  return <a {...props} href={store ? appStoreUrl(campaign) : appLandingUrl(campaign)} />;
}
