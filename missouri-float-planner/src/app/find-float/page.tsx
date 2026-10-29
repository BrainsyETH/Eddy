import type { Metadata } from 'next';
import FindFloatClient from './FindFloatClient';

export const metadata: Metadata = {
  title: 'Floats',
  description:
    'Explore featured Ozarks floats, find a float for your day, or plan your own with Eddy.',
};
export default async function FindFloatPage({
  searchParams,
}: {
  searchParams: Promise<{ river?: string }>;
}) {
  const river = (await searchParams).river ?? '';
  return <FindFloatClient key={river} initialRiver={river} />;
}
