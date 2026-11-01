import type { Metadata } from 'next';
import ConditionsPage from '@/components/conditions/ConditionsPage';
import { publicPageMetadata, SHARE_IMAGES } from '@/lib/seo';

export const revalidate = 300;
export const metadata: Metadata = publicPageMetadata(
  'Lake Levels & Dam Releases',
  'Live USACE lake levels, dam releases and hourly generation schedules across Missouri, Arkansas, Oklahoma, Texas, Kentucky and Tennessee.',
  '/dams',
  SHARE_IMAGES.site,
);

export default function Page() {
  return <ConditionsPage defaultKind="dams" />;
}
