import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/ui/SiteFooter';
import { reviewedPhotos } from '@/lib/photos/reviewed';

export const metadata: Metadata = {
  title: 'Photo credits | Eddy',
  description: 'Creators, sources, and licenses for Eddy’s curated place photographs.',
  alternates: { canonical: '/photo-credits' },
};

export default function PhotoCreditsPage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/" className="text-primary-700 underline">Eddy</Link>
        <h1 className="text-4xl font-bold text-neutral-900 mt-6 mb-4">Photo credits</h1>
        <p className="text-neutral-700 mb-8">Place photographs show scenery, not current water or campground conditions. Images may be resized and cropped for display. Government photography does not imply endorsement.</p>
        <div className="space-y-6">
          {reviewedPhotos.map(({ id, name, image }) => (
            <section key={id} id={id} className="bg-white border border-neutral-200 rounded-lg p-5">
              <h2 className="text-xl font-semibold text-neutral-900">{name}</h2>
              <p className="text-neutral-700 mt-2">{image.credit} · {image.license}</p>
              <div className="flex flex-wrap gap-5 mt-3 text-primary-700 underline">
                <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer">Original photograph</a>
                <a href={image.licenseUrl} target="_blank" rel="noopener noreferrer">License and usage terms</a>
              </div>
            </section>
          ))}
        </div>
        <p className="text-sm text-neutral-600 mt-8">Onboarding dam photo credits are available in the app’s river and dam picker. Other provider photos retain their credits in the associated galleries.</p>
      </main>
      <SiteFooter showSafetyDisclaimer={false} />
    </div>
  );
}
