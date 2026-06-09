// src/app/rivers/[slug]/page.tsx
// Server-rendered river guide page. Acts as the SEO landing surface for each
// river. Heavy planning UI (map, sidebar, share/save) lives at /plan?river=<slug>
// — when this page is hit with putIn/takeOut params we redirect there so old
// shared links keep working.

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, MapPin, Ruler, Mountain } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { CONDITION_COLORS, CONDITION_LABELS } from '@/constants';
import type { ConditionCode } from '@/types/api';
import RiverGuideIslands from './RiverGuideIslands';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ putIn?: string; takeOut?: string; vessel?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  try {
    const [resolvedParams, resolvedSearch] = await Promise.all([params, searchParams]);
    const slug = resolvedParams?.slug;

    if (!slug) {
      return {
        title: 'River',
        description: 'Plan your next float trip with live conditions and access points.',
      };
    }

    const supabase = await createClient();
    const { data: river, error: riverError } = await supabase
      .from('rivers')
      .select('id, name, slug, length_miles, description, difficulty_rating, region')
      .eq('slug', slug)
      .single();

    if (riverError || !river) {
      return { title: 'River Not Found' };
    }

    // If this is a deep-link with float plan params we'll redirect, but provide
    // sensible metadata anyway in case the redirect fails.
    const putInId = resolvedSearch?.putIn;
    const takeOutId = resolvedSearch?.takeOut;
    if (putInId && takeOutId) {
      const ogImageUrl = `${BASE_URL}/api/og/float?putIn=${putInId}&takeOut=${takeOutId}`;
      const planUrl = `${BASE_URL}/plan?river=${slug}&putIn=${putInId}&takeOut=${takeOutId}`;
      return {
        title: `Float Plan | ${river.name}`,
        description: `Floating ${river.name} on Eddy.`,
        alternates: { canonical: planUrl },
        openGraph: {
          type: 'website',
          title: `Float Plan | ${river.name}`,
          description: `Floating ${river.name} on Eddy.`,
          url: planUrl,
          siteName: 'Eddy',
          images: [{ url: ogImageUrl, width: 1200, height: 630 }],
        },
      };
    }

    let conditionCode = 'unknown';
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: condRows } = await (supabase.rpc as any)('get_river_condition', {
        p_river_id: river.id,
      });
      if (condRows && condRows.length > 0) {
        conditionCode = condRows[0].condition_code || 'unknown';
      }
    } catch (err) {
      console.warn('Failed to fetch conditions for river metadata:', err);
    }

    const conditionLabels: Record<string, string> = {
      flowing: 'Flowing',
      good: 'Good - Floatable',
      low: 'Very Low',
      high: 'High Water',
      too_low: 'Too Low',
      dangerous: 'Dangerous',
      unknown: '',
    };
    const conditionText = conditionLabels[conditionCode] || '';

    const lengthMiles = river.length_miles ? parseFloat(river.length_miles).toFixed(1) : '';
    const title = conditionText ? `${river.name} — ${conditionText}` : river.name;
    const ogTitle = `${river.name} | Float Trip Guide`;

    const descParts: string[] = [];
    if (conditionText) descParts.push(`Currently ${conditionText.toLowerCase()}.`);
    if (lengthMiles) descParts.push(`${lengthMiles} mi`);
    if (river.difficulty_rating) descParts.push(river.difficulty_rating);
    if (river.region) descParts.push(river.region);
    const descMeta = descParts.length > 1
      ? descParts.slice(0, 1).join('') + ' ' + descParts.slice(1).join(', ') + '.'
      : descParts.join(', ') + '.';
    const description = `${descMeta} Access points, river guide, and live conditions for ${river.name}. Plan your float on Eddy.`;
    const pageUrl = `${BASE_URL}/rivers/${slug}`;

    return {
      title,
      description,
      alternates: {
        canonical: pageUrl,
        types: { 'application/json': `${BASE_URL}/api/rivers/${slug}` },
      },
      openGraph: {
        type: 'website',
        title: ogTitle,
        description,
        url: pageUrl,
        siteName: 'Eddy',
      },
      twitter: {
        card: 'summary_large_image',
        title: ogTitle,
        description,
      },
    };
  } catch (error) {
    console.error('Error generating river metadata:', error);
    return {
      title: 'River',
      description: 'Plan your next float trip with live conditions and access points.',
    };
  }
}

export default async function RiverGuidePage({ params }: Props) {
  const resolvedParams = await params;
  const slug = resolvedParams?.slug;

  // Note: /rivers/<slug>?putIn=…&takeOut=… is 308'd to /plan via
  // next.config.mjs redirects() before we reach this handler.

  const supabase = await createClient();

  const [riverResult, guideResult] = await Promise.all([
    supabase
      .from('rivers')
      .select('id, name, slug, description, length_miles, difficulty_rating, region, geom')
      .eq('slug', slug)
      .single(),
    supabase
      .from('blog_posts')
      .select('slug, title')
      .eq('river_slug', slug)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (riverResult.error || !riverResult.data) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-3xl">:/</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">River Not Found</h1>
          <p className="text-neutral-600 mb-4">We don&apos;t have a guide for that river yet.</p>
          <Link href="/rivers" className="text-primary-600 hover:underline">Browse all rivers</Link>
        </div>
      </div>
    );
  }

  const river = riverResult.data;

  // Fetch access points + current condition in parallel (need river.id first)
  const [{ data: accessPoints }, condRowsResult] = await Promise.all([
    supabase
      .from('access_points')
      .select('id, slug, name, river_mile_downstream, image_urls, type, types')
      .eq('approved', true)
      .eq('river_id', river.id)
      .order('river_mile_downstream', { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)('get_river_condition', { p_river_id: river.id }).then(
      (res: { data: Array<{ condition_code: string }> | null }) => res,
      () => ({ data: null }),
    ),
  ]);

  const conditionCode = condRowsResult?.data?.[0]?.condition_code || 'unknown';
  const guidePost = guideResult.data || null;

  // Centroid for JSON-LD
  let centroid: [number, number] | null = null;
  if (river.geom && typeof river.geom === 'object') {
    try {
      const geom = river.geom as GeoJSON.LineString;
      if (geom.coordinates && geom.coordinates.length > 0) {
        const lngs = geom.coordinates.map((c: number[]) => c[0]);
        const lats = geom.coordinates.map((c: number[]) => c[1]);
        centroid = [
          (Math.min(...lngs) + Math.max(...lngs)) / 2,
          (Math.min(...lats) + Math.max(...lats)) / 2,
        ];
      }
    } catch {
      // ignore
    }
  }

  const lengthMiles = river.length_miles ? parseFloat(river.length_miles) : null;

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Rivers', item: `${BASE_URL}/rivers` },
      { '@type': 'ListItem', position: 3, name: river.name, item: `${BASE_URL}/rivers/${slug}` },
    ],
  };

  const descParts: string[] = [];
  if (river.description) descParts.push(river.description);
  if (lengthMiles) descParts.push(`${lengthMiles.toFixed(1)} miles.`);
  if (river.difficulty_rating) descParts.push(`Difficulty: ${river.difficulty_rating}.`);
  if (river.region) descParts.push(`Located in ${river.region}, Missouri.`);
  const fullDescription = descParts.join(' ') || `Float trip guide for ${river.name} in Missouri.`;

  const touristAttractionJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: river.name,
    description: fullDescription,
    touristType: ['Float trip', 'Canoeing', 'Kayaking', 'Tubing'],
    isAccessibleForFree: true,
    publicAccess: true,
    url: `${BASE_URL}/rivers/${slug}`,
    ...(centroid && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: centroid[1],
        longitude: centroid[0],
      },
    }),
    ...(river.region && {
      address: {
        '@type': 'PostalAddress',
        addressRegion: 'MO',
        addressCountry: 'US',
      },
    }),
  };

  // Pick a hero image from any access point that has one
  const heroImage = (accessPoints || []).find(ap => ap.image_urls && ap.image_urls.length > 0)?.image_urls?.[0] || null;

  const planUrl = `/plan?river=${slug}`;
  const condKey = conditionCode as ConditionCode;
  const conditionLabel = CONDITION_LABELS[condKey] || 'Unknown';
  const conditionColor = CONDITION_COLORS[condKey] || CONDITION_COLORS.unknown;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(touristAttractionJsonLd) }} />

      <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50">
        {/* Hero */}
        <section
          className="relative text-white overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #1A4550 50%, #0F2D35 100%)' }}
        >
          {heroImage && (
            <Image
              src={heroImage}
              alt={`${river.name} river`}
              fill
              priority
              sizes="100vw"
              className="object-cover opacity-30"
            />
          )}
          <div className="relative max-w-5xl mx-auto px-4 py-10 md:py-14">
            <nav className="text-xs text-white/60 mb-3">
              <Link href="/rivers" className="hover:text-white">Rivers</Link>
              <span className="mx-2">/</span>
              <span className="text-white/80">{river.name}</span>
            </nav>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <h1
                className="text-3xl md:text-5xl font-bold"
                style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
              >
                {river.name}
              </h1>
              <span
                className="px-2.5 py-1 rounded text-xs font-bold text-white"
                style={{ backgroundColor: conditionColor }}
                title={`Condition: ${conditionLabel}`}
              >
                {conditionLabel}
              </span>
            </div>
            {river.description && (
              <p className="text-base md:text-lg text-white/85 max-w-2xl mb-5">
                {river.description}
              </p>
            )}
            <div className="flex items-center gap-4 mb-6 flex-wrap text-sm text-white/80">
              {lengthMiles && (
                <span className="inline-flex items-center gap-1.5">
                  <Ruler className="w-4 h-4" /> {lengthMiles.toFixed(1)} miles
                </span>
              )}
              {river.difficulty_rating && (
                <span className="inline-flex items-center gap-1.5">
                  <Mountain className="w-4 h-4" /> {river.difficulty_rating}
                </span>
              )}
              {river.region && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> {river.region}
                </span>
              )}
            </div>
            <Link
              href={planUrl}
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl transition-colors shadow-lg"
            >
              Plan a Float on the {river.name}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>

        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          {/* Access points list */}
          {accessPoints && accessPoints.length > 0 && (
            <section className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
                  Access Points
                </h2>
                <span className="text-xs text-neutral-500">{accessPoints.length} on river</span>
              </div>
              <p className="text-sm text-neutral-600 mb-4">
                Tap any access point to start a float plan from there.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {accessPoints.map((ap) => (
                  <li key={ap.id}>
                    <Link
                      href={`/plan?river=${slug}&putIn=${ap.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-primary-50 hover:border-primary-300 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-900 text-sm truncate">{ap.name}</div>
                        {ap.river_mile_downstream != null && (
                          <div className="text-[11px] text-neutral-500">
                            Mile {parseFloat(ap.river_mile_downstream).toFixed(1)}
                          </div>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Live data islands (visuals + nearby services) */}
          <RiverGuideIslands riverSlug={slug} />

          {/* Blog cross-link */}
          {guidePost && (
            <Link
              href={`/blog/${guidePost.slug}`}
              className="block bg-primary-50 rounded-xl border border-primary-100 p-4 hover:bg-primary-100 transition-colors"
            >
              <p className="text-sm font-semibold text-neutral-900">
                Read the full {river.name} Float Trip Guide →
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                Best floats, access points, outfitters, and everything you need to know.
              </p>
            </Link>
          )}

          {/* Secondary CTA */}
          <div className="text-center pt-2">
            <Link
              href={planUrl}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
            >
              Open the planner
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
