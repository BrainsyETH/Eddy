// src/app/rivers/[state]/[slug]/add-photo/page.tsx
// Dedicated, crawlable, shareable page for submitting a river photo. Server-
// rendered with its own canonical URL + metadata; the interactive form is a
// client island (AddPhotoIsland).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { riverPath } from '@/lib/navigation/river-path';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import AddPhotoIsland from '@/components/river/AddPhotoIsland';

interface Props {
  params: Promise<{ state: string; slug: string }>;
}

async function getRiver(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('rivers')
    .select('id, name, state')
    .eq('slug', slug)
    .maybeSingle();
  return data as { id: string; name: string; state: string } | null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const river = await getRiver(slug);
  if (!river) return { title: 'Add a River Photo | Eddy' };

  const title = `Add a Photo of the ${river.name} | Eddy`;
  const description = `Share what the ${river.name} looks like right now and help fellow floaters read the river. Your photo is tagged with the day's gauge level.`;
  const url = `${riverPath(river.state, slug)}/add-photo`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function AddPhotoPage({ params }: Props) {
  const { slug } = await params;
  const river = await getRiver(slug);
  if (!river) notFound();

  const riverHref = riverPath(river.state, slug);

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Rivers', href: '/rivers' },
            { label: river.name, href: riverHref },
            { label: 'Add a photo' },
          ]}
        />

        <header>
          <h1 className="text-2xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
            Add a photo of the {river.name}
          </h1>
          <p className="mt-1.5 text-sm text-neutral-600 leading-relaxed">
            Show fellow floaters what the {river.name} looks like right now. Pick the day
            it was taken and we&apos;ll tag it with that day&apos;s USGS gauge reading — once a
            moderator approves it, it appears to everyone viewing the river at that level.
          </p>
        </header>

        <AddPhotoIsland riverSlug={slug} riverHref={riverHref} />

        <Link
          href={riverHref}
          className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {river.name}
        </Link>
      </div>
    </div>
  );
}
