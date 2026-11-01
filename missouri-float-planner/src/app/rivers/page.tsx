import type { Metadata } from 'next';
import ConditionsPage from '@/components/conditions/ConditionsPage';
import { publicPageMetadata, ROUTE_SHARE_IMAGE } from '@/lib/seo';

export const revalidate = 60;
export const metadata: Metadata = publicPageMetadata(
  'River Conditions, Lakes & Dam Releases',
  'Search river levels, float conditions, lake and dam releases, and generation schedules across the Ozarks and beyond.',
  '/rivers',
  ROUTE_SHARE_IMAGE,
);

export default function Page() {
  return <ConditionsPage />;
}
