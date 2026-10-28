import type { Metadata } from 'next';
import FindFloatClient from './FindFloatClient';

export const metadata: Metadata = {
  title: 'Floats',
  description:
    'Explore featured Ozarks floats, find a route for your day, or build your own with Eddy.',
};
export default async function FindFloatPage({
  searchParams,
}: {
  searchParams: Promise<{ river?: string }>;
}) {
  const river = (await searchParams).river ?? '';
  return <FindFloatClient key={river} initialRiver={river} />;
}
