import type { Metadata } from 'next';
import { publicPageMetadata, SHARE_IMAGES } from '@/lib/seo';
import { appBannerMetadata } from '@/lib/app-discovery';
import FindFloatClient from './FindFloatClient';

export const metadata: Metadata = {
  ...publicPageMetadata(
    'Floats',
    'Explore featured Ozarks floats, find a float for your day, or plan your own with Eddy.',
    '/find-float',
    SHARE_IMAGES.plan,
  ),
  ...appBannerMetadata('/find-float'),
};
export default async function FindFloatPage({
  searchParams,
}: {
  searchParams: Promise<{ river?: string }>;
}) {
  const river = (await searchParams).river ?? '';
  return <FindFloatClient key={river} initialRiver={river} />;
}
