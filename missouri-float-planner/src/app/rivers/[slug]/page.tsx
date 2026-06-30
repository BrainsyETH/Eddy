// src/app/rivers/[slug]/page.tsx
// Server-rendered river guide page. Acts as the SEO landing surface for each
// river. Heavy planning UI (map, sidebar, share/save) lives at /plan?river=<slug>
// — when this page is hit with putIn/takeOut params we redirect there so old
// shared links keep working.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, MapPin, Ruler, Mountain } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { CONDITION_COLORS, CONDITION_LABELS } from '@/constants';
import type { ConditionCode } from '@/types/api';
import RiverHubMap from './RiverHubMap';
import RiverHeroStats from './RiverHeroStats';
import HubSectionNav from './HubSectionNav';
import RiverGaugeDetail from '@/components/gauge/RiverGaugeDetail';
import SiteFooter from '@/components/ui/SiteFooter';

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

    const lengthMiles = river.length_miles ? river.length_miles.toFixed(1) : '';
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
      .select('slug, title, description, featured_image_url')
      .eq('river_slug', slug)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (riverResult.error || !riverResult.data) {
    // Render the dedicated not-found boundary with a proper HTTP 404 status.
    notFound();
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

  const lengthMiles = river.length_miles ?? null;

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
  if (river.region) descParts.push(`Located in ${river.region}.`);
  const fullDescription = descParts.join(' ') || `Float trip guide for ${river.name} in the Ozarks.`;

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
        {/* ===== Hero (status-first, 2-col) ===== */}
        <section
          className="text-white"
          style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #1A4550 50%, #0F2D35 100%)' }}
        >
          <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
            <nav className="text-xs text-white/50 mb-5">
              <Link href="/rivers" className="hover:text-white">River Reports</Link>
              <span className="mx-2">/</span>
              <span className="text-white/80">{river.name}</span>
            </nav>

            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-stretch">
              {/* Left: identity + live metrics + CTAs */}
              <div className="flex flex-col">
                <div
                  className="inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 mb-4 text-sm font-semibold"
                  style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: conditionColor }} />
                  {conditionLabel}
                </div>

                <h1
                  className="text-4xl md:text-5xl font-bold leading-[1.05] mb-3"
                  style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
                >
                  {river.name}
                </h1>

                {river.description && (
                  <p className="text-base text-white/80 max-w-xl mb-5 leading-relaxed">{river.description}</p>
                )}

                {/* Live metric cards */}
                <RiverHeroStats riverSlug={slug} />

                {/* CTAs */}
                <div className="flex flex-wrap items-center gap-3 mt-auto">
                  <Link
                    href={planUrl}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white no-underline shadow-lg transition-all hover:brightness-110"
                    style={{ backgroundColor: '#F07052' }}
                  >
                    Plan a Float on the {river.name}
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                  {guidePost && (
                    <Link
                      href={`/blog/${guidePost.slug}`}
                      className="inline-flex items-center px-5 py-3 rounded-xl font-semibold text-white border border-white/25 hover:bg-white/10 transition-colors no-underline"
                    >
                      River Guide
                    </Link>
                  )}
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 mt-5 flex-wrap text-sm text-white/70">
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
              </div>

              {/* Right: photo panel */}
              <div className="relative rounded-2xl overflow-hidden border border-white/10 min-h-[240px] lg:min-h-0 bg-white/5">
                {heroImage ? (
                  <Image
                    src={heroImage}
                    alt={`${river.name} river`}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    className="object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{ background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 14px, rgba(255,255,255,0.07) 14px 28px)' }}
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ===== Sticky section nav + persistent CTA ===== */}
        <HubSectionNav planUrl={planUrl} hasGuide={!!guidePost} />

        <main className="max-w-5xl mx-auto px-4 pb-16">
          {/* ===== Live report ===== */}
          <section id="status" className="scroll-mt-24 pt-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              Live report
            </h2>
            <p className="text-sm text-neutral-600 mb-5">
              Real-time USGS gauge readings. Pick a gauge near your put-in.
            </p>
            <RiverGaugeDetail riverSlug={slug} />
          </section>

          {/* ===== Plan CTA band (the hinge) ===== */}
          <section
            className="my-10 rounded-2xl px-6 py-8 md:px-9 md:py-9 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center text-white"
            style={{ background: 'linear-gradient(135deg, #163F4A 0%, #1A4F5C 100%)' }}
          >
            <div>
              <div className="text-2xl font-bold mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                Ready to float? Build your trip.
              </div>
              <p className="text-sm text-white/80 max-w-xl">
                Pick a put-in and take-out and we&apos;ll estimate float time, mileage, and shuttle — then give you a link to share with your crew.
              </p>
            </div>
            <Link
              href={planUrl}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white no-underline whitespace-nowrap transition-all hover:brightness-110"
              style={{ backgroundColor: '#F07052' }}
            >
              Open the planner
              <ArrowRight className="w-5 h-5" />
            </Link>
          </section>

          {/* ===== Access points (with overview map) ===== */}
          <section id="access" className="scroll-mt-24">
            <h2 className="text-2xl font-bold text-neutral-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              Access points
            </h2>
            <p className="text-sm text-neutral-600 mb-5">
              Ordered upstream → downstream. Tap a stop to start a float plan from there.
            </p>

            <div className="mb-5">
              <RiverHubMap riverSlug={slug} />
            </div>

            {accessPoints && accessPoints.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {accessPoints.map((ap) => (
                  <Link
                    key={ap.id}
                    href={`/plan?river=${slug}&putIn=${ap.id}`}
                    className="flex items-center gap-4 px-4 py-3.5 bg-white border border-neutral-200 rounded-xl hover:bg-primary-50 hover:border-primary-300 transition-colors no-underline"
                  >
                    <div className="w-12 flex-shrink-0 text-sm font-mono font-medium text-primary-600">
                      {ap.river_mile_downstream != null ? `mi ${ap.river_mile_downstream.toFixed(0)}` : '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-neutral-900 text-sm truncate">{ap.name}</div>
                    </div>
                    <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-100 px-3 py-1.5 rounded-lg">
                      Set put-in
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Access points coming soon for this river.</p>
            )}
          </section>

          {/* ===== River guide (blog) ===== */}
          {guidePost && (
            <section id="guide" className="scroll-mt-24 pt-12">
              <h2 className="text-2xl font-bold text-neutral-900 mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                River guide
              </h2>
              <Link
                href={`/blog/${guidePost.slug}`}
                className="group block overflow-hidden rounded-2xl border border-neutral-200 bg-white hover:shadow-md hover:border-neutral-300 transition-all no-underline"
              >
                {(guidePost.featured_image_url || heroImage) && (
                  <div className="relative h-52 md:h-64 overflow-hidden bg-neutral-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={guidePost.featured_image_url || heroImage || ''}
                      alt={guidePost.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                    />
                  </div>
                )}
                <div className="p-5 md:p-6">
                  <div className="text-lg md:text-xl font-bold text-neutral-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                    {guidePost.title}
                  </div>
                  {guidePost.description && (
                    <p className="text-sm text-neutral-600 leading-relaxed line-clamp-2">{guidePost.description}</p>
                  )}
                  <span className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-primary-600 group-hover:gap-2.5 transition-all">
                    Read the full {river.name} guide
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            </section>
          )}
        </main>

        <SiteFooter maxWidth="max-w-5xl" className="mt-12" />
      </div>
    </>
  );
}
