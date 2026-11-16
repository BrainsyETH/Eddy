'use client';

import type { AnchorHTMLAttributes } from 'react';
import AppLink from './AppLink';
import AppAvailability from './AppAvailability';
import { useAppDevice } from './useAppDevice';
import { destinationCampaign, type AppDestination } from '@/lib/app-destination';

/** A Read keeps its topic and water through desktop, QR and iPhone handoffs. */
export default function ReadAppLink({ destination, label, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  destination?: AppDestination;
  label: string;
}) {
  const device = useAppDevice();
  if (device === 'android') return <AppAvailability className={props.className} />;
  const readDestination = destination && ['river', 'gauge', 'dam'].includes(destination.kind)
    ? { ...destination, feature: 'read' as const } : destination;
  return <AppLink {...props} destination={readDestination} campaign={destinationCampaign(readDestination)}
    data-ga-dam-id={destination?.kind === 'dam' ? destination.id : undefined}
    trackView data-ga-label={label} />;
}
