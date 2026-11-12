'use client';

import { ArrowRight, Lock } from 'lucide-react';
import AppCta from '../AppCta';
import AppLink from '../AppLink';
import AppAvailability from '../AppAvailability';
import { useAppDevice } from '../useAppDevice';
import { destinationCampaign, type AppDestination } from '@/lib/app-destination';

/** One invitation per report. Retain an available Read during background refresh. */
export default function ReportAppCta({ destination, hasRead, loading }: {
  destination?: AppDestination;
  hasRead: boolean;
  loading: boolean;
}) {
  const device = useAppDevice();
  if (!hasRead && loading) return null;
  if (device === 'android') return hasRead ? <AppAvailability className="mt-3" /> : null;
  const gauge = destination?.kind === 'gauge';
  const readDestination = destination?.kind === 'river' || destination?.kind === 'gauge'
    ? { ...destination, feature: 'read' as const } : destination;
  if (hasRead) return (
    <AppLink store={device === 'ios'} destination={readDestination} campaign={destinationCampaign(readDestination)}
      target={device === 'ios' ? '_blank' : undefined} rel={device === 'ios' ? 'noopener noreferrer' : undefined}
      trackView data-ga-label={gauge ? 'gauge_eddy_read' : 'river_eddy_read'}
      className="app-cta__link mt-3">
      <Lock className="size-3.5 shrink-0" aria-hidden="true" />Get Eddy’s full Read in the app<ArrowRight className="size-4 shrink-0" aria-hidden="true" />
    </AppLink>
  );
  if (!destination) return null;
  return <AppCta destination={destination} title={gauge ? 'Keep this gauge on your Home Screen' : 'Keep this river on your Home Screen'}
    detail={gauge ? 'Favorite this gauge in Eddy, then choose it in a River level widget.' : 'Add an Eddy river widget, then choose your river in Edit Widget.'}
    label={gauge ? 'gauge_widget' : 'river_widget'} variant="inline" />;
}
