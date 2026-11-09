import type { Metadata } from 'next';
import ConditionsPage from '@/components/conditions/ConditionsPage';
import { publicPageMetadata, SHARE_IMAGES } from '@/lib/seo';

export const revalidate = 300;
export const metadata: Metadata = publicPageMetadata(
  'Lake Levels, Dam Releases & Generation Schedules',
  'Lake levels, releases and hourly generation schedules for Corps of Engineers and Ameren dams in Missouri, Arkansas, Oklahoma, Texas, Kentucky and Tennessee.',
  '/dams',
  SHARE_IMAGES.site,
);

export default function Page() {
  return <ConditionsPage defaultKind="dams" />;
}
