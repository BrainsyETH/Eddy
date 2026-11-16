import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import CampingHub from '@/components/camping/CampingHub';
import SiteFooter from '@/components/ui/SiteFooter';
import { campingWebEnabled, webCampingOverview } from '@/lib/camping/web-data';
import { publicPageMetadata, SHARE_IMAGES } from '@/lib/seo';
export const dynamic = 'force-dynamic';
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const params = await searchParams;
  return {
    ...publicPageMetadata(
      'Camping Along Ozark Rivers',
      'Find campgrounds along Ozark rivers. Compare dates, check individual campsites and book with the provider.',
      '/camping',
      SHARE_IMAGES.site,
    ),
    robots: {
      index: campingWebEnabled() && Object.keys(params).length === 0,
      follow: true,
    },
  };
}
export default async function Page() {
  if (!campingWebEnabled()) notFound();
  const overview = await webCampingOverview().catch(() => null);
  return (
    <div className="min-h-screen bg-neutral-50">
      {overview ? (
        <Suspense fallback={<p className="p-8">Loading campgrounds…</p>}>
          <CampingHub overview={overview} />
        </Suspense>
      ) : (
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-3xl font-bold text-primary-900">
            Camping along the river
          </h1>
          <p className="my-6">
            Campground information is temporarily unavailable.
          </p>
          <a href="/camping" className="underline">
            Try again
          </a>
          <p className="mt-6">
            <Link href="/plan" className="underline">
              Explore the river map →
            </Link>
          </p>
        </div>
      )}
      <SiteFooter />
    </div>
  );
}
