import type { Metadata } from 'next';
import FindFloatClient from './FindFloatClient';

export const metadata: Metadata = {
  title: 'Find a Route',
  description:
    'Find a route near you by time on the river, vessel, and current conditions.',
};
export default async function FindFloatPage({
  searchParams,
}: {
  searchParams: Promise<{ river?: string }>;
}) {
  const river = (await searchParams).river ?? '';
  return <FindFloatClient key={river} initialRiver={river} />;
}
