'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { optimizeBlogImage } from '@/lib/blog-image';
import { featuredFloatPath, featuredFloatsForDay, type FeaturedFloat } from '@/lib/featured-floats';
import type { RiverListItem } from '@/types/api';

export default function FeaturedFloats({ rivers, onPlan }: { rivers: RiverListItem[]; onPlan: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ['favorite-floats', 'v2'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/favorite-floats?v=2', {
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      });
      if (!response.ok) throw new Error('Featured floats are unavailable.');
      const body: { floats: FeaturedFloat[] } = await response.json();
      if (!Array.isArray(body.floats)) throw new Error('Featured floats are unavailable.');
      return body.floats;
    },
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
  const ordered = featuredFloatsForDay(data ?? []);
  const visible = showAll ? ordered : ordered.slice(0, 3);

  return <section aria-labelledby="featured-floats-heading" className="min-w-0">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="featured-floats-heading" style={{ fontFamily: 'var(--font-display)' }} className="text-3xl font-medium">Featured Floats</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">From Eddy’s river guides.</p>
      </div>
      {ordered.length > 3 && <Button variant="outline" aria-expanded={showAll} aria-controls="featured-floats-list" onClick={() => setShowAll(value => !value)}>
        {showAll ? 'Show fewer' : 'Show all floats'}
      </Button>}
    </div>
    {isPending ? <div role="status" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">Loading featured floats</span>
      {[0, 1, 2].map(index => <Skeleton key={index} className="h-96 w-full rounded-lg" />)}
    </div> : visible.length ? <>
      {isError && <p role="status" className="mb-4 text-sm text-[var(--color-text-secondary)]">Featured floats couldn’t refresh. Showing the previous selection.</p>}
      <div id="featured-floats-list" className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((float, index) => <FeaturedFloatCard key={float.id} float={float} eager={index < 3} onPlan={onPlan} riverPhoto={rivers.find(river => river.slug === float.riverSlug)?.photoUrl} />)}
      </div>
    </> : <Card variant="panel" className="flex flex-wrap items-center justify-between gap-4 p-5">
      <p role="status" className="text-sm text-[var(--color-text-secondary)]">{isError ? 'Featured floats couldn’t load. You can still find or plan a float above.' : 'More featured floats are on the way. Find or plan a float above.'}</p>
      {isError && <Button variant="outline" disabled={isFetching} onClick={() => { void refetch(); }}>{isFetching ? 'Loading…' : 'Try again'}</Button>}
    </Card>}
  </section>;
}

function FeaturedFloatCard({ float, riverPhoto, eager, onPlan }: { float: FeaturedFloat; riverPhoto?: string | null; eager: boolean; onPlan: () => void }) {
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const photo = [float.photoUrl, ...(float.photoFallbackUrls ?? []), riverPhoto].find(
    (url): url is string => typeof url === 'string' && url.length > 0 && !failedPhotos.includes(url),
  );
  return <Card variant="framed" as="article" className="overflow-hidden">
    <Link href={featuredFloatPath(float)} prefetch={false} onNavigate={onPlan}
      aria-label={`Plan this float: ${float.putInName} to ${float.takeOutName} on ${float.riverName}`}
      className="group flex h-full flex-col text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-primary-500">
      <div className="relative flex h-44 shrink-0 items-center justify-center bg-[var(--color-surface-hover)] sm:h-48">
        {photo ? <Image key={photo} src={photo} alt="" fill loading={eager ? 'eager' : 'lazy'} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          unoptimized={!optimizeBlogImage(photo)} className="object-cover" onError={() => setFailedPhotos(previous => [...previous, photo])} />
          : <EddyIcon name="wave" size={130} />}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-accent-500)]">{float.riverName}</p>
        <h3 className="mt-2 text-xl font-bold leading-snug">{float.tagline || `${float.putInName} to ${float.takeOutName}`}</h3>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{float.putInName} → {float.takeOutName}</p>
        <p className="mt-4 text-sm font-semibold text-[var(--color-text-primary)]">{float.distanceMiles.toFixed(1)} miles{float.durationFormatted ? ` · About ${float.durationFormatted.replace(/~/g, '').trim()}` : ''}</p>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          {float.durationFormatted ? 'Canoe estimate' : float.durationUnavailableReason === 'regulated' ? 'Time varies with dam releases' : 'Open route for float time'}
          {float.difficulty ? ` · Class ${float.difficulty}` : ''}
        </p>
        <span className="mt-auto flex items-center gap-2 pt-5 text-sm font-semibold text-[var(--color-text-primary)] group-hover:underline">Plan this float<ArrowRight size={16} aria-hidden="true" /></span>
      </div>
    </Link>
  </Card>;
}
