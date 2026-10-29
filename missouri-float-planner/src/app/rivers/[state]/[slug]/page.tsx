// src/app/rivers/[state]/[slug]/page.tsx
// Server-rendered river guide page at the canonical /rivers/[state]/[slug]
// URL (e.g. /rivers/missouri/current). Legacy /rivers/[slug] URLs 301 here
// via app/rivers/[state]/page.tsx; a wrong-state URL 301s to the canonical
// state. Acts as the SEO landing surface for each river. Heavy planning UI
// (map, sidebar, share/save) lives at /plan?river=<slug> — when this page is
// hit with putIn/takeOut params we redirect there so old shared links keep
// working.

import { guideCover } from '@/lib/photos/guides';
import { appBannerMetadata } from '@/lib/app-discovery';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { stateSlug, stateName } from '@/lib/navigation/states';
import NearbyServices from '@/components/river/NearbyServices';
import { riverPath, riverAccessPath, statePath } from '@/lib/navigation/river-path';
import Link from 'next/link';
import AccessPointPhoto from '@/components/access-point/AccessPointPhoto';
import { ArrowRight, MapPin, Ruler, Mountain } from 'lucide-react';
import { createPublicCatalogClient } from '@/lib/supabase/public-read';
import { pageRiverDam, pageRiverReaches } from '@/lib/data/public-pages';
import RiverHubMap from './RiverHubMap';
import ShareRiverButton from './ShareRiverButton';
import HubSectionNav from './HubSectionNav';
import RiverAlertsPanel from '@/components/river/RiverAlertsPanel';
import ReportIssueButton from '@/components/ui/ReportIssueButton';
import RiverDamPanel from '@/components/dam/RiverDamPanel';
import TailwaterStatusRow from '@/components/dam/TailwaterStatusRow';
import { pageRiverAlerts } from '@/lib/data/public-pages';
import RiverHazards from '@/components/river/RiverHazards';
import RiverReaches from '@/components/river/RiverReaches';
import type { RiverType } from '@/lib/rivers/context';
import RiverGaugeDetail from '@/components/gauge/RiverGaugeDetail';
import SiteFooter from '@/components/ui/SiteFooter';
import { jsonLdString } from '@/lib/json-ld';
import { floatSearchLaunch } from '@/lib/float-search-launch';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

// Public catalog reads cache for five minutes; water-bearing page snapshots
// use 60 seconds. Public context reads participate in the page cache;
// alerts retain their own provider policy.
export const revalidate = 60;

interface Props {
  params: Promise<{ state: string; slug: string }>;
}

// Note: legacy share URLs (/rivers/<state>/<slug>?putIn=…&takeOut=…) are
// 308'd to /plan by next.config.mjs redirects() and never reach this
// route, so nothing here reads searchParams — that read would opt the
// whole page back into per-request rendering.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const resolvedParams = await params;
    const slug = resolvedParams?.slug;

    if (!slug) {
      return {
        title: 'River',
        description: 'Plan your next float trip with live conditions and access points.',
      };
    }

    const supabase = createPublicCatalogClient();
    const { data: river, error: riverError } = await supabase
      .from('rivers')
      .select('id, name, slug, state, length_miles, description, difficulty_rating, region')
      .eq('slug', slug)
      .single();

    if (riverError || !river) {
      return { title: 'River Not Found' };
    }

    // Chat clients can retain metadata indefinitely. Do not publish a condition
    // verdict here; the destination supplies timestamped, current readings.
    const title = `${river.name} · Float guide & access points`;
    const ogTitle = `${title} | Eddy`;
    const description = `River conditions, access points and float planning for ${river.name}. Open for the latest readings.`;
    const pageUrl = `${BASE_URL}${riverPath(river.state, slug)}`;

    return {
      title,
      ...appBannerMetadata(`/river/${encodeURIComponent(slug)}`),
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
  const stateSegment = resolvedParams?.state;

  // Note: /rivers/<state>/<slug>?putIn=…&takeOut=… is 308'd to /plan via
  // next.config.mjs redirects() before we reach this handler.

  // Public catalog client (no cookies()): this page is public and identical for all
  // visitors — the cookie-bound server client would force per-request
  // rendering and defeat the ISR above.
  const supabase = createPublicCatalogClient();

  const [riverResult, guideResult] = await Promise.all([
    supabase
      .from('rivers')
      .select('id, name, slug, state, description, float_tip, length_miles, difficulty_rating, region, geom, river_type, active')
      .eq('slug', slug)
      .maybeSingle(),
    supabase
      .from('blog_posts')
      .select('slug, river_slug, title, description, featured_image_url')
      .eq('river_slug', slug)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (riverResult.error) throw riverResult.error;
  if (!riverResult.data) {
    // Render the dedicated not-found boundary with a proper HTTP 404 status.
    notFound();
  }

  const river = riverResult.data;

  // Wrong-state URLs (e.g. /rivers/arkansas/current for a Missouri river)
  // 301 to the canonical state segment.
  if (stateSegment !== stateSlug(river.state)) {
    permanentRedirect(riverPath(river.state, river.slug));
  }

  // Fetch access points and the river's panels in parallel (need river.id first).
  // The condition itself is read client-side by the live report's reading card.
  const [{ data: accessPoints }, riverDam, riverReaches, { alerts: riverAlerts, unavailable: alertsUnavailable }] = await Promise.all([
    supabase
      .from('access_points')
      .select('id, slug, name, river_mile_downstream, image_urls, type, types')
      .eq('approved', true)
      .eq('river_id', river.id)
      .order('river_mile_downstream', { ascending: true }),
    // Resolved here rather than in a client hook so the dam tab is present in
    // the first paint and the section stays inside this page's ISR window.
    // Null for every river without a tailwater dam, which is most of them.
    pageRiverDam(slug).catch(() => null),
    // Same reasoning. Null unless the river has two or more curated reaches —
    // today only the Black, which straddles Clearwater Dam.
    pageRiverReaches(river.id, slug, (river.river_type || 'spring_fed_float') as RiverType).catch(() => null),
    // Closures and weather warnings, server-side for the same reason the dam is:
    // a closure is the last thing that should wait on hydration, and the section
    // has to exist before HubSectionNav can decide whether to offer the tab.
    // Optional context failures render an explicit unavailable state.
    pageRiverAlerts(slug),
  ]);

  /**
   * The reach this river's dam actually controls, confirmed to exist.
   *
   * ── One boundary where registry and database drift is resolved ────────────
   * `tailwater.sectionSlug` is a hand-written constant in usace-registry.ts;
   * the reaches come from river_sections. Nothing keeps them in step, so a
   * renamed section, a deleted one, a typo, or a reaches query that simply
   * failed all leave a slug pointing at nothing.
   *
   * Resolving it HERE means the highlight and the panel's anchor link cannot
   * disagree: both are fed this one verified value. The highlight already
   * failed closed on its own, but a hash link does not — it renders, it looks
   * live, and it scrolls nowhere.
   */
  const controlledReach =
    riverReaches?.find(
      (reach) => reach.sectionSlug === riverDam?.dam.tailwater?.sectionSlug
    ) ?? null;

  const guidePost = guideResult.data || null;
  const guideImage = guidePost ? guideCover(guidePost) : null;

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

  const lengthMiles = river.length_miles != null ? parseFloat(String(river.length_miles)) : null;

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Rivers', item: `${BASE_URL}/rivers` },
      { '@type': 'ListItem', position: 3, name: stateName(river.state), item: `${BASE_URL}${statePath(river.state)}` },
      { '@type': 'ListItem', position: 4, name: river.name, item: `${BASE_URL}${riverPath(river.state, slug)}` },
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
    publicAccess: true,
    url: `${BASE_URL}${riverPath(river.state, slug)}`,
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
        // The river's own state, not a literal. Everything else on this page
        // was already state-correct — the breadcrumb calls stateName(river.state)
        // and the canonical calls riverPath(river.state, …) — while the one
        // line a search engine actually reads asserted Missouri for all seven
        // Arkansas rivers.
        addressRegion: river.state,
        addressCountry: 'US',
      },
    }),
  };

  // Pick a hero image from any access point that has one
  const heroImage = (accessPoints || []).find(ap => ap.image_urls && ap.image_urls.length > 0)?.image_urls?.[0] || null;

  const planUrl = `/plan?river=${slug}`;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(touristAttractionJsonLd) }} />

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
                {/* No condition pill here: the reading card directly below
                    says the verdict, as the app's river screen does. */}

                <h1
                  className="text-4xl md:text-5xl font-bold leading-[1.05] mb-3"
                  style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
                >
                  {river.name}
                </h1>

                {river.description && (
                  <p className="text-base text-white/80 max-w-xl mb-5 leading-relaxed">{river.description}</p>
                )}

                {/* CTAs (live readings live in the report right below — the
                    hero no longer duplicates gauge numbers) */}
                <div className="flex flex-wrap items-center gap-3 mt-auto">
                  <Link
                    href={planUrl}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white no-underline shadow-lg transition-all hover:brightness-110"
                    style={{ backgroundColor: '#F07052' }}
                  >
                    Plan a float
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
                  <ShareRiverButton className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-white border border-white/25 hover:bg-white/10 transition-colors" />
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
                  <AccessPointPhoto
                    src={heroImage}
                    alt={`${river.name} river`}
                    priority
                    className="absolute inset-0 w-full h-full object-cover"
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
        <HubSectionNav
          planUrl={planUrl}
          hasGuide={!!guidePost}
          hasDam={!!riverDam}
          hasAlerts={alertsUnavailable || riverAlerts.length > 0}
          riverSlug={slug}
        />

        <main className="max-w-5xl mx-auto px-4 pb-16">
          {/* ===== Alerts — above the live report, deliberately =====
              A closure or a flood warning decides whether the trip happens at
              all, which outranks what the gauge reads. Notices and watches are
              collapsed so the live report stays above the fold; warnings open
              themselves. Absent entirely when nothing is posted: an empty
              summary reads as an all-clear, and this section cannot tell an
              all-clear from an agency outage. */}
          {(alertsUnavailable || riverAlerts.length > 0) && (
            <section id="alerts" className="scroll-mt-28 pt-4 md:pt-5">
              <h2 className="sr-only">Alerts</h2>
              {alertsUnavailable ? (
                <p role="status" className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                  Alerts unavailable. Check official weather and park notices before your trip.
                </p>
              ) : <RiverAlertsPanel alerts={riverAlerts} />}
            </section>
          )}

          {/* ===== Live report ===== */}
          <section id="status" className="scroll-mt-28 pt-4 md:pt-5">
            <h2 className="mb-3 text-xl font-bold text-neutral-900 md:text-2xl" style={{ fontFamily: 'var(--font-display)' }}>
              Live report
            </h2>
            {/* The dam row goes THROUGH the report, not after it: it belongs
                under the "Right now" summary, and this component renders the
                whole report below that. Server-rendered here, so the snapshot
                never reaches the browser bundle. */}
            <RiverGaugeDetail
              riverSlug={slug}
              damSlot={riverDam ? <TailwaterStatusRow dam={riverDam.dam} /> : null}
              reachesSlot={riverReaches ? (
                // Only where the river's halves differ. When a dam controls
                // one of these reaches, the chip names it as THE one the Dam
                // release panel is about.
                <section id="reaches" className="scroll-mt-28" aria-labelledby="reaches-heading">
                  <h3 id="reaches-heading" className="mb-2 text-base font-bold text-neutral-900">Reaches</h3>
                  <RiverReaches
                    reaches={riverReaches}
                    highlightSlug={controlledReach?.sectionSlug ?? null}
                    damName={riverDam?.dam.name ?? null}
                  />
                </section>
              ) : null}
            />
          </section>

          {/* ===== Dam control — tailwater reaches only ===== */}
          {riverDam && (
            <section id="dam" className="scroll-mt-28 pt-8">
              <h2 className="mb-3 text-xl font-bold text-neutral-900 md:text-2xl" style={{ fontFamily: 'var(--font-display)' }}>
                Dam release
              </h2>
              <RiverDamPanel context={riverDam} controlledReachSlug={controlledReach?.sectionSlug ?? null} />
            </section>
          )}

          {/* ===== Plan CTA band — phones only =====
              From sm up the sticky section bar carries "Plan a float" the whole
              way down the page, and a third button here only repeated it. On a
              phone that bar has no room for the button, so this is the one
              plan action between the hero and the access list. */}
          <section
            className="my-10 rounded-2xl px-6 py-6 grid grid-cols-1 gap-4 items-center text-white sm:hidden"
            style={{ background: 'linear-gradient(135deg, #163F4A 0%, #1A4F5C 100%)' }}
          >
            <div className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              Ready to float?
            </div>
            <Link
              href={planUrl}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white no-underline whitespace-nowrap transition-all hover:brightness-110"
              style={{ backgroundColor: '#F07052' }}
            >
              Plan a float
              <ArrowRight className="w-5 h-5" />
            </Link>
          </section>

          {/* ===== Hazards — above the access list, as in the app ===== */}
          <RiverHazards riverSlug={slug} className="scroll-mt-28 pt-10" />

          {/* ===== Access points (with overview map) ===== */}
          <section id="access" className="scroll-mt-28">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              Access points
            </h2>

            <div className="mb-4">
              <RiverHubMap riverSlug={slug} />
            </div>

            {/* Map markers are not reachable by keyboard or screen reader, so
                the list is the only version of this flow some visitors get.
                Kept compact so the map still reads as the primary view. */}
            {accessPoints && accessPoints.length > 0 ? (
              <ul className="grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2">
                {accessPoints.map((ap) => (
                  <li key={ap.id}>
                    <Link
                      href={riverAccessPath(river.state, slug, ap.slug)}
                      className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 no-underline transition-colors hover:border-primary-300 hover:bg-primary-50"
                    >
                      <span className="w-11 flex-shrink-0 font-mono text-xs font-medium text-primary-600">
                        {ap.river_mile_downstream != null ? `mi ${parseFloat(String(ap.river_mile_downstream)).toFixed(0)}` : '—'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{ap.name}</span>
                      <ArrowRight className="w-4 h-4 flex-shrink-0 text-primary-600" aria-hidden="true" />
                      <span className="sr-only">View access details</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">Access points coming soon for this river.</p>
            )}
          </section>

          {river.float_tip && <p className="mt-5 text-sm text-neutral-600">{river.float_tip}</p>}
          <section className="mt-8" aria-label="Campgrounds and nearby services">
            <NearbyServices riverSlug={slug} defaultOpen />
          </section>

          {/* ===== River guide (blog) ===== */}
          {guidePost && (
            <section id="guide" className="scroll-mt-28 pt-12">
              <h2 className="text-2xl font-bold text-neutral-900 mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                River guide
              </h2>
              <Link
                href={`/blog/${guidePost.slug}`}
                className="group block overflow-hidden rounded-2xl border border-neutral-200 bg-white hover:shadow-md hover:border-neutral-300 transition-all no-underline"
              >
                {guideImage?.src && (
                  <div className="relative h-52 md:h-64 overflow-hidden bg-neutral-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={guideImage.src}
                      alt={guideImage.alt ?? guidePost.title}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-slower"
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
          {floatSearchLaunch().web && river.active && (
            <div className="mt-10">
              <Link
                href={`/find-float?river=${encodeURIComponent(slug)}`}
                className="inline-flex items-center px-5 py-3 rounded-xl font-semibold text-primary-700 border border-primary-200 hover:bg-primary-50 transition-colors no-underline"
              >
                Find a float on this river
              </Link>
            </div>
          )}

          {/* The condition above is a claim about water, and the only people who
              can check it are on the river. Defaults to the recalibration type
              because that is what gets disputed on a river page — not a typo. */}
          <div className="mt-10 flex justify-center">
            <ReportIssueButton
              context={{ type: 'river', id: river.id, name: river.name }}
              defaultType="gauge_recalibration"
              label={`Something wrong with the ${river.name}?`}
            />
          </div>
        </main>

        <SiteFooter maxWidth="max-w-5xl" className="mt-12" />
      </div>
    </>
  );
}

// Generate public HTML on the first visit, then revalidate it.
export async function generateStaticParams() { return []; }
