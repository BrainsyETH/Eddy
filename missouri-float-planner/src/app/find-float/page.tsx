import type { Metadata } from 'next';
import FindFloatClient from './FindFloatClient';

export const metadata: Metadata = {
  title: 'Find a Float',
  description:
    'Find a float near you by time on the river, boat, and current conditions.',
};
export default async function FindFloatPage({
  searchParams,
}: {
  searchParams: Promise<{ river?: string }>;
}) {
  const river = (await searchParams).river ?? '';
  return <FindFloatClient key={river} initialRiver={river} />;
}
