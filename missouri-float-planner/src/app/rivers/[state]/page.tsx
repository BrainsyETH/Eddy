// src/app/rivers/[state]/page.tsx
// Dual-purpose segment under /rivers/:
//   /rivers/missouri  → state index page (rivers in that state)
//   /rivers/current   → legacy pre-hierarchy river URL, 301 to
//                       /rivers/missouri/current (canonical)
// Unknown segments 404.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { stateCodeFromSlug, stateName } from '@/lib/navigation/states';
import { riverPath } from '@/lib/navigation/river-path';
import SiteFooter from '@/components/ui/SiteFooter';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://eddy.guide';

interface Props {
  params: Promise<{ state: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state } = await params;
  const stateCode = stateCodeFromSlug(state);
  if (!stateCode) {
    // Legacy river slug (the page component redirects) or a 404.
    return {};
  }
  const name = stateName(stateCode);
  return {
    title: `${name} Float Trips & River Conditions`,
    description: `Live water levels, float conditions, access points, and river guides for ${name} float rivers. Plan your next float on Eddy.`,
    alternates: { canonical: `${BASE_URL}/rivers/${state}` },
  };
}

export default async function StateRiversPage({ params }: Props) {
  const { state } = await params;
  const stateCode = stateCodeFromSlug(state);
  const supabase = await createClient();

  if (!stateCode) {
    // Not a state slug — treat as a legacy /rivers/[riverSlug] URL.
    const { data: river } = await supabase
      .from('rivers')
      .select('slug, state')
      .eq('slug', state)
      .eq('active', true)
      .maybeSingle();

    if (river) {
      permanentRedirect(riverPath(river.state, river.slug));
    }
    notFound();
  }

  const { data: rivers } = await supabase
    .from('rivers')
    .select('slug, name, description, length_miles, difficulty_rating, region, state')
    .eq('active', true)
    .eq('state', stateCode)
    .order('name');

  if (!rivers || rivers.length === 0) {
    notFound();
  }

  const name = stateName(stateCode);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <nav className="mb-6 text-sm text-neutral-500">
          <Link href="/rivers" className="hover:text-primary-600">River Reports</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">{name}</span>
        </nav>

        <h1 className="text-3xl font-bold text-neutral-900">
          {name} Float Rivers
        </h1>
        <p className="mt-2 max-w-2xl text-neutral-600">
          Live conditions, access points, and float planning for {rivers.length}{' '}
          {rivers.length === 1 ? 'river' : 'rivers'} in {name}.
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {rivers.map((river) => (
            <li key={river.slug}>
              <Link
                href={riverPath(river.state, river.slug)}
                className="block rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-primary-300 hover:shadow-md"
              >
                <h2 className="text-lg font-semibold text-neutral-900">{river.name}</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  {[
                    river.length_miles ? `${Math.round(Number(river.length_miles))} mi` : null,
                    river.difficulty_rating,
                    river.region,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {river.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-neutral-600">{river.description}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <SiteFooter />
    </main>
  );
}
