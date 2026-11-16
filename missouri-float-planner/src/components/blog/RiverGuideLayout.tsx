import GuideOverview from './GuideOverview';
import { guideDam, type GuideDam } from '@/lib/guides/dam';
import GuidePhoto from './GuidePhoto';
import PhotoCreditOverlay from './PhotoCreditOverlay';
import { guideOverviewMap, type GuideMapRoute } from '@/lib/guides/overview';
import type { ReactNode } from 'react';
import { guideEditorialDate } from '@/lib/guides/editorial-date';
// src/components/blog/RiverGuideLayout.tsx
// Field Notebook layout for River Guide blog posts. Pulls structured data
// from blog_posts.guide_data and renders the design from variation-a.jsx in
// the bundled handoff.

import ArticleByline from './ArticleByline';
import Link from 'next/link';
import Image from 'next/image';
import type { RiverGuidePost, FloatSection, GuideSegment } from '@/types/blog';
import { createAdminClient } from '@/lib/supabase/admin';
import { floatSearchLaunch } from '@/lib/float-search-launch';
import { riverPath, riverAccessPath } from '@/lib/navigation/river-path';
import { npsHeroImage } from '@/lib/services/npsCampground';
import { optimizeBlogImage, guidePhotoCredit } from '@/lib/blog-image';
import SectionTitle from './SectionTitle';
import FloatSectionCard from './FloatSectionCard';
import EddySaysCallout from './EddySaysCallout';
import GuideTOC, { type TocItem } from './GuideTOC';
import GuideProgressBar from './GuideProgressBar';
import FaqAccordion from './FaqAccordion';
import DirectoryCards from './DirectoryCards';
import GuideJumpNav from './GuideJumpNav';
import GuideTldr from './GuideTldr';
import SegmentHeader from './SegmentHeader';
import RegulationsCard from './RegulationsCard';
import PreLaunchCard from './PreLaunchCard';
import DriveTimesStrip from './DriveTimesStrip';
import NearbyAttractionsList from './NearbyAttractionsList';
import RelatedRiversStrip from './RelatedRiversStrip';

const EDDY_CANOE =
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

function buildToc(post: RiverGuidePost, hasDirectory: boolean, dam: GuideDam | null = null): TocItem[] {
  const g = post.guide_data;
  const items: TocItem[] = [];
  if (g.tldr) items.push({ id: 'tldr', label: 'TL;DR' });
  if (g.pre_launch_notes?.length) items.push({ id: 'pre-launch', label: 'Before you launch' });
  // A dam with a schedule is the first thing to read, in place of the river
  // card; one without is a link further down.
  items.push(dam?.hydro ? { id: 'dam', label: 'Dam releases' } : { id: 'today', label: 'Today on the river' });
  items.push({ id: 'different', label: 'Why this river is different' });
  if (g.sections.length) items.push({ id: 'pick', label: 'Pick your float' });
  if (g.springs.length) items.push({ id: 'springs', label: g.sights_heading ?? 'Springs & sights' });
  if (hasDirectory) items.push({ id: 'outfitters', label: 'Outfitters & lodging' });
  items.push({ id: 'gauge', label: 'Water levels & gauge' });
  if (dam && !dam.hydro) items.push({ id: 'dam', label: 'Dam releases' });
  if (g.regulations?.length)        items.push({ id: 'regulations', label: 'Regulations' });
  items.push({ id: 'when', label: 'When to go' });
  if (g.drive_times?.length)        items.push({ id: 'drive', label: 'Drive times' });
  items.push({ id: 'pack-and-plan', label: 'Pack & plan' });
  if (g.nearby_attractions?.length) items.push({ id: 'nearby', label: 'Nearby attractions' });
  items.push({ id: 'faq', label: 'FAQ' });
  return items;
}

// Group sections by segment (per guide_data.segments[].section_ids), preserving
// the segment order and section order within each segment. Sections not
// referenced by any segment (or guides without `segments`) fall through ungrouped.
function groupSectionsBySegment(
  sections: FloatSection[],
  segments: GuideSegment[] | undefined,
): { segment: GuideSegment | null; sections: FloatSection[] }[] {
  if (!segments?.length) return [{ segment: null, sections }];
  const byId = new Map(sections.map((s) => [s.id, s]));
  const grouped: { segment: GuideSegment | null; sections: FloatSection[] }[] = [];
  const claimed = new Set<number>();
  for (const seg of segments) {
    const segSections = seg.section_ids
      .map((id) => byId.get(id))
      .filter((s): s is FloatSection => !!s);
    segSections.forEach((s) => claimed.add(s.id));
    if (segSections.length > 0) grouped.push({ segment: seg, sections: segSections });
  }
  const orphans = sections.filter((s) => !claimed.has(s.id));
  if (orphans.length > 0) grouped.push({ segment: null, sections: orphans });
  return grouped;
}

interface Props {
  post: RiverGuidePost;
}

export interface GuideAccessInfo {
  id: string;
  imageUrl: string | null;
  npsImageUrl: string | null;
  endpoint: boolean;
  mile: number | null;
  riverId: string;
}

// Resolve each section's put-in/take-out access points: the access point id
// (for planner deep links) plus any photo we can show on the float card — the
// access point's own image first, then its linked NPS campground's photo. This
// lets sections with no explicit `photo` fall back to access-point imagery.
// Look up a river's state code so we can build canonical /rivers/[state]/[slug]
// links (legacy 1-segment links still 301 to these, but we skip the redirect).
// `name` rides along for the drive-time tiles, whose Maps destination used to
// fall back to the literal "Current River Missouri" — one river's name, on
// every guide, in the wrong state for seven of them.
async function getRiverMeta(
  riverSlug: string,
): Promise<{ state: string | null; name: string | null }> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('rivers')
    .select('state, name')
    .eq('slug', riverSlug)
    .single();
  const row = data as { state: string | null; name: string | null } | null;
  return { state: row?.state ?? null, name: row?.name ?? null };
}

async function resolveAccessPoints(
  riverSlug: string,
  sections: FloatSection[],
): Promise<Map<string, GuideAccessInfo>> {
  const slugs = new Set<string>();
  for (const s of sections) {
    if (s.from_slug) slugs.add(s.from_slug);
    if (s.to_slug) slugs.add(s.to_slug);
  }
  if (slugs.size === 0) return new Map();

  const supabase = createAdminClient();
  const { data: river } = await supabase
    .from('rivers')
    .select('id')
    .eq('slug', riverSlug)
    .single();
  if (!river) return new Map();

  const { data: aps } = await supabase
    .from('access_points')
    .select('slug, id, image_urls, nps_campground_id, is_float_endpoint, river_mile_downstream')
    .eq('river_id', river.id)
    .eq('approved', true)
    .in('slug', Array.from(slugs));

  const apRows = (aps ?? []) as {
    slug: string;
    is_float_endpoint: boolean | null;
    river_mile_downstream: number | null;
    id: string;
    image_urls: string[] | null;
    nps_campground_id: string | null;
  }[];

  // Resolve hero photos for any NPS campgrounds linked to these access points.
  const cgIds = Array.from(
    new Set(apRows.map((a) => a.nps_campground_id).filter((x): x is string => !!x)),
  );
  const cgHero = new Map<string, string>();
  if (cgIds.length > 0) {
    const { data: cgs } = await supabase
      .from('nps_campgrounds')
      .select('id, images')
      .in('id', cgIds);
    for (const cg of (cgs ?? []) as { id: string; images: unknown }[]) {
      const hero = npsHeroImage(cg.images);
      if (hero) cgHero.set(cg.id, hero.url);
    }
  }

  return new Map(
    apRows.map((a): [string, GuideAccessInfo] => [
      a.slug,
      {
        id: a.id,
        endpoint: a.is_float_endpoint !== false,
        mile: a.river_mile_downstream == null ? null : Number(a.river_mile_downstream),
        riverId: river.id,
        imageUrl: a.image_urls && a.image_urls.length > 0 ? a.image_urls[0] : null,
        npsImageUrl: a.nps_campground_id ? cgHero.get(a.nps_campground_id) ?? null : null,
      },
    ]),
  );
}

function buildPlannerUrl(
  riverSlug: string,
  section: FloatSection,
  aps: Map<string, GuideAccessInfo>,
): string | undefined {
  if (!section.from_slug || !section.to_slug) return undefined;
  const from = aps.get(section.from_slug), to = aps.get(section.to_slug);
  if (!from?.endpoint || !to?.endpoint || from.mile == null || to.mile == null || to.mile <= from.mile) return undefined;
  const putIn = from.id;
  const takeOut = aps.get(section.to_slug)?.id;
  if (!putIn || !takeOut) return undefined;
  return `/plan?river=${riverSlug}&putIn=${putIn}&takeOut=${takeOut}`;
}

// Photo shown on a float card when guide_data didn't specify one: the put-in's
// access-point photo, then the take-out's, then either access point's linked
// NPS campground photo.
function resolveSectionPhoto(
  section: FloatSection,
  aps: Map<string, GuideAccessInfo>,
): string | undefined {
  if (section.photo) return section.photo;
  const order = [section.from_slug, section.to_slug].filter(Boolean) as string[];
  for (const slug of order) {
    const url = aps.get(slug)?.imageUrl;
    if (url) return url;
  }
  for (const slug of order) {
    const url = aps.get(slug)?.npsImageUrl;
    if (url) return url;
  }
  return undefined;
}

export default async function RiverGuideLayout({ post }: Props) {
  const g = post.guide_data;
  const slug = post.river_slug ?? post.slug;
  const [directory, aps, riverMeta] = await Promise.all([
    DirectoryCards({ riverSlug: slug }),
    resolveAccessPoints(slug, g.sections),
    post.river_slug ? getRiverMeta(post.river_slug) : Promise.resolve({ state: null, name: null }),
  ]);
  const db = createAdminClient();
  const mapLines = await Promise.all(g.sections.map(async (section, index) => {
    if (!buildPlannerUrl(slug, section, aps)) return null;
    const { data, error } = await db.rpc('get_float_segment', { p_start_access_id: aps.get(section.from_slug!)!.id, p_end_access_id: aps.get(section.to_slug!)!.id });
    if (error) return null;
    return { id: section.id, number: index + 1, label: `${section.from} → ${section.to}`, miles: section.miles, geometry: data?.[0]?.segment_geom };
  }));
  const drawn = mapLines.filter((line): line is NonNullable<typeof line> => line !== null);
  // The whole river, so separated stretches read as parts of one line. Skipped when nothing is drawn.
  const riverLine = drawn.length && post.river_slug
    ? (await db.from('rivers').select('geom').eq('slug', post.river_slug).maybeSingle()).data?.geom
    : null;
  const map = guideOverviewMap(drawn, riverLine);
  const overview = map.routes;
  return <RiverGuideView post={post} aps={aps} riverMeta={riverMeta} directory={directory} overview={overview} riverLine={map.river} overviewGeo={map.geo} overviewBounds={map.bounds} dam={post.river_slug ? guideDam(post.river_slug) : null} />;
}

/** Shared presentation, with independently loaded resources kept on the server. */
export function RiverGuideView({ post, aps, riverMeta, directory, overview, riverLine = null, overviewGeo = [], overviewBounds = null, dam = null }: Props & {
  dam?: GuideDam | null;
  riverLine?: string | null;
  overviewGeo?: { id: number; coordinates: number[][] }[];
  overviewBounds?: [number, number, number, number] | null;
  aps: Map<string, GuideAccessInfo>;
  riverMeta: { state: string | null; name: string | null };
  directory: ReactNode;
  overview: GuideMapRoute[];
}) {
  const g = post.guide_data;
  const slug = post.river_slug ?? post.slug;
  const riverName = g.hero.title_top;
  const heroCredit = guidePhotoCredit(g.hero);
  const toc = buildToc(post, directory != null, dam);
  const grouped = groupSectionsBySegment(g.sections, g.segments);
  const riverState = riverMeta.state;
  // Only on a river a dam controls. A dam without a powerhouse has no
  // generation schedule, so it gets the link alone.
  const damSection = dam ? (
    <>
              <SectionTitle id="dam" eyebrow="Below the dam">
                {dam.name} releases
              </SectionTitle>
              <p style={{ fontSize: 17, color: 'var(--color-neutral-700)', marginBottom: 12, lineHeight: 1.65 }}>
                {dam.hydro
                  ? `Water below ${dam.name} rises and falls with power generation. This is what the dam is releasing now and what is scheduled next. Water already released can still be on its way downstream.`
                  : `The river below ${dam.name} runs on what the dam releases, so the gauge upstream of the lake says nothing about it. ${dam.name} has no powerhouse and no hourly schedule; the dam report shows the current release and the forecast.`}
              </p>
              {dam.hydro && (
                <iframe
                  data-eddy-embed
                  src={`/embed/dam/${dam.id}?size=full&theme=light`}
                  width="100%"
                  loading="lazy"
                  title={`${dam.name} generation schedule`}
                  style={{ border: 0, borderRadius: 12, display: 'block', width: '100%', maxWidth: '100%', height: 420 }}
                />
              )}
              <p className="mt-3 flex flex-wrap gap-x-5 text-sm">
                <Link href={`/dams/${dam.id}`} className="inline-flex min-h-11 items-center font-semibold text-primary-700 underline underline-offset-4">Open the full {dam.name} report →</Link>
                {dam.hydro && <Link href="/embed" className="inline-flex min-h-11 items-center font-semibold text-primary-700 underline underline-offset-4">Put this schedule on your site →</Link>}
              </p>
            </>
  ) : null;
  const reportHref = post.river_slug
    ? (riverState ? riverPath(riverState, post.river_slug) : '/rivers')
    : '/blog';

  return (
    <article className="eddy-guide-root" style={{ background: 'var(--color-neutral-50)' }}>
      <GuideProgressBar />
      <ResponsiveStyles />

      {/* Top breadcrumb / meta strip */}
      <div
        data-guide-meta
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '24px 32px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 13,
          color: 'var(--color-neutral-600)',
          flexWrap: 'wrap',
        }}
      >
        <Link
          href={reportHref}
          style={{
            color: 'var(--color-primary-600)',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          ← View Report
        </Link>
        <div data-guide-byline className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          {post.read_time_minutes && (
            <span className="inline-flex items-baseline gap-3 whitespace-nowrap">
              <span data-byline-separator aria-hidden="true">·</span>
              <span>{post.read_time_minutes} min read</span>
            </span>
          )}
          <ArticleByline publishedAt={post.published_at} editorialDate={guideEditorialDate(g)} />
        </div>
        <span
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            minHeight: 26,
            lineHeight: 1,
            whiteSpace: 'nowrap',
            textAlign: 'center',
            padding: '4px 10px',
            background: 'var(--color-accent-100)',
            color: 'var(--color-accent-700)',
            border: '1.5px solid var(--color-accent-300)',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          {post.category}
        </span>
      </div>

      {/* Hero */}
      <section
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '32px 32px 40px',
          borderBottom: '1px solid var(--color-neutral-200)',
        }}
      >
        <div
          data-guide-hero
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 1fr',
            gap: 48,
            alignItems: 'end',
          }}
        >
          <div>
            <div
              className="eyebrow"
              style={{
                marginBottom: 16,
                color: 'var(--color-accent-600)',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.12em',
              }}
            >
              {g.hero.eyebrow}
            </div>
            <h1
              data-guide-title
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 64,
                fontWeight: 600,
                lineHeight: 1.02,
                letterSpacing: '-.02em',
                marginBottom: 24,
                color: 'var(--color-neutral-900)',
                margin: 0,
              }}
            >
              {g.hero.title_top}
              <br />
              <span style={{ color: 'var(--color-accent-500)' }}>{g.hero.title_accent}</span>
            </h1>
            <p
              style={{
                fontSize: 19,
                lineHeight: 1.55,
                color: 'var(--color-neutral-700)',
                maxWidth: 540,
                marginTop: 24,
              }}
            >
              {g.hero.lede}
            </p>
          </div>
          <figure style={{ margin: 0 }}>
          <div
            style={{
              position: 'relative',
              aspectRatio: '4/3',
              borderRadius: 8,
              overflow: 'hidden',
              border: '2px solid var(--color-primary-700)',
              boxShadow: '3px 3px 0 var(--color-neutral-400)',
              background: 'var(--color-secondary-100)',
            }}
          >
            <Image
              src={g.hero.photo_url || EDDY_CANOE}
              unoptimized={!optimizeBlogImage(g.hero.photo_url || EDDY_CANOE)}
              alt={g.hero.photo_alt ?? (g.hero.photo_url ? `${riverName} scenery` : "Eddy in a canoe")}
              fill
              priority
              sizes="(max-width: 1023px) 100vw, 580px"
              style={{ objectFit: g.hero.photo_url ? 'cover' : 'contain' }}
            />
            {heroCredit && <PhotoCreditOverlay author={heroCredit.author} sourceUrl={heroCredit.source_url} license={heroCredit.license} licenseUrl={heroCredit.license_url} />}
          </div>
            {g.hero.photo_caption && <figcaption className="mt-2 text-sm leading-relaxed text-neutral-600">{g.hero.photo_caption}</figcaption>}
          </figure>
        </div>

        {/* Mile-marker stat strip */}
        <div
          data-guide-mile-strip
          style={{
            marginTop: 36,
            padding: '20px 24px',
            background: 'var(--color-secondary-50)',
            border: '2px solid var(--color-primary-700)',
            borderRadius: 8,
            boxShadow: '2px 2px 0 var(--color-neutral-300)',
            display: 'grid',
            gridTemplateColumns: `repeat(${g.hero.mile_stats.length}, 1fr)`,
            gap: 0,
          }}
        >
          {g.hero.mile_stats.map((s, i) => (
            <div
              key={s.label}
              style={{
                padding: '4px 18px',
                borderRight:
                  i < g.hero.mile_stats.length - 1
                    ? '1px dashed var(--color-neutral-300)'
                    : 'none',
              }}
            >
              <div
                className="eyebrow"
                style={{
                  marginBottom: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.12em',
                  color: 'var(--color-neutral-500)',
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 17,
                  fontWeight: 600,
                  color: 'var(--color-neutral-900)',
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Below lg the left-rail TOC is hidden; this strip replaces it. */}
      <GuideJumpNav items={toc} />

      {/* TL;DR — surfaced just under the hero so readers see scope at a glance */}
      {g.tldr && (
        <section
          id="tldr"
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '0 32px',
            scrollMarginTop: 80,
          }}
        >
          <GuideTldr tldr={g.tldr} />
        </section>
      )}

      {/* Pre-launch notes — surfaced under TL;DR so they're impossible to miss */}
      {g.pre_launch_notes && g.pre_launch_notes.length > 0 && (
        <section
          id="pre-launch"
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '0 32px',
            scrollMarginTop: 80,
          }}
        >
          <PreLaunchCard notes={g.pre_launch_notes} />
        </section>
      )}

      {/* Body grid */}
      <div
        data-guide-body
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          gap: 56,
          padding: '32px 32px 80px',
          alignItems: 'start',
        }}
      >
        <GuideTOC items={toc} riverSlug={post.river_slug} riverName={riverName} />

        <main style={{ maxWidth: 760, minWidth: 0 }}>
          {/* On a river run by a hydro dam, the dam card is today's reading. The
              river card under it showed the same release an hour apart, labelled
              as a gauge, with an "Unknown" verdict. The dam card replaces it. */}
          {dam?.hydro ? damSection : (
            <>
              {/* Today — Eddy's live take, condition-aware */}
              <div id="today" style={{ scrollMarginTop: 80 }}>
                <SectionTitle eyebrow="Live conditions">Today on the {riverName}</SectionTitle>
                <p style={{ fontSize: 17, color: 'var(--color-neutral-700)', marginBottom: 6, lineHeight: 1.65 }}>
                  Check the latest reading and trend, then confirm conditions on your stretch with the land manager or outfitter.
                </p>
              </div>

              <EddySaysCallout callout={g.callouts.hero} riverSlug={slug} />
            </>
          )}

          {/* Why different */}
          <SectionTitle id="different" eyebrow="Get to know the river">
            What to expect on the {riverName}
          </SectionTitle>
          <div
            style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--color-neutral-800)' }}
            dangerouslySetInnerHTML={{ __html: g.intro_html }}
          />
          <ul style={{ marginTop: 18, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {g.why_different.map((b) => (
              <li
                key={b.strong}
                style={{
                  fontSize: 17,
                  lineHeight: 1.6,
                  color: 'var(--color-neutral-800)',
                  paddingLeft: 28,
                  position: 'relative',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 11,
                    width: 14,
                    height: 2,
                    background: 'var(--color-accent-500)',
                  }}
                />
                <strong style={{ color: 'var(--color-neutral-900)', fontWeight: 700 }}>{b.strong}</strong>{' '}
                {b.body}
              </li>
            ))}
          </ul>

          {/* Pick float */}
          {g.sections.length > 0 && <>
          <SectionTitle id="pick" eyebrow="Float sections">
            Pick your float
          </SectionTitle>
          <p style={{ fontSize: 17, color: 'var(--color-neutral-700)', marginBottom: 24, lineHeight: 1.65 }}>
            Choose a stretch for your group, your time, and today&rsquo;s water.{g.sections.some(s => s.time) ? ' Typical paddling times are for a canoe or kayak at normal water; stops, low water, rafts and tubes all add to them. Ask a card for a float time estimate to get the planner’s figure for today’s level.' : ''}
          </p>
          <GuideOverview routes={overview} riverName={riverName} riverPath={riverLine} riverSlug={post.river_slug ?? null} geo={overviewGeo} bounds={overviewBounds}
            plannerUrls={Object.fromEntries(g.sections.flatMap(s => { const url = buildPlannerUrl(slug, s, aps); return url ? [[s.id, url]] : []; }))} />
          {floatSearchLaunch().web && <Link href={`/find-float?river=${encodeURIComponent(slug)}`} className="mb-6 inline-flex min-h-11 items-center font-semibold text-primary-700 underline underline-offset-4">Find a float for your time and vessel →</Link>}
          {(() => {
            // Render section cards with optional segment headers between groups.
            // The index prop on FloatSectionCard stays globally sequential so the
            // numbered badge counts 1..N across the whole guide.
            let globalIdx = 0;
            return grouped.map(({ segment, sections: segSections }, gi) => (
              <div key={segment?.id ?? `flat-${gi}`}>
                {segment && <SegmentHeader segment={segment} />}
                {segSections.map((s) => {
                  const idx = globalIdx++;
                  return (
                    <FloatSectionCard
                      key={s.id}
                      section={s}
                      index={idx}
                      estimateEndpoints={buildPlannerUrl(slug, s, aps) ? { riverId: aps.get(s.from_slug!)!.riverId, startId: aps.get(s.from_slug!)!.id, endId: aps.get(s.to_slug!)!.id } : undefined}
                      plannerUrl={buildPlannerUrl(slug, s, aps)}
                      fromHref={riverState && s.from_slug && aps.has(s.from_slug) ? riverAccessPath(riverState, slug, s.from_slug) : undefined}
                      toHref={riverState && s.to_slug && aps.has(s.to_slug) ? riverAccessPath(riverState, slug, s.to_slug) : undefined}
                      photoFallback={g.use_access_photos === false ? undefined : resolveSectionPhoto(s, aps)}
                    />
                  );
                })}
              </div>
            ));
          })()}

          </>}

          {/* Springs */}
          {g.springs.length > 0 && <>
          <SectionTitle id="springs" eyebrow="Off-river stops">
            {g.sights_heading ?? 'Springs & sights worth stopping for'}
          </SectionTitle>
          <div
            style={{
              background: 'var(--color-secondary-50)',
              border: '2px solid var(--color-primary-700)',
              borderRadius: 8,
              boxShadow: '2px 2px 0 var(--color-neutral-300)',
              overflow: 'hidden',
            }}
          >
            {g.springs.map((sp, i) => (
              <div
                key={sp.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: sp.mile ? '100px 1fr' : '1fr',
                  gap: 0,
                  padding: '16px 22px',
                  borderTop: i ? '1px dashed var(--color-neutral-300)' : 'none',
                  alignItems: 'center',
                }}
              >
                {sp.mile && <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    color: 'var(--color-accent-600)',
                    fontWeight: 700,
                  }}
                >
                  mile {sp.mile}
                </div>}
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: 'var(--color-neutral-900)',
                      marginBottom: 2,
                    }}
                  >
                    {sp.name}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--color-neutral-700)', lineHeight: 1.5 }}>
                    {sp.note}
                  </div>
                  {sp.photo && <GuidePhoto photo={sp.photo} />}
                </div>
              </div>
            ))}
          </div>

          </>}

          {directory}

          {/* Gauge */}
          <SectionTitle id="gauge" eyebrow={dam?.hydro ? 'Dam release and river gauges' : 'River gauges'}>
            Water levels &amp; gauge
          </SectionTitle>
          <Link href={reportHref} className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 underline">Open the full river report →</Link>
          <p style={{ fontSize: 17, color: 'var(--color-neutral-700)', marginBottom: 18, lineHeight: 1.65 }}>
            {dam?.hydro
              ? `The first number in this report is the total release from ${dam.name}, reported by the Corps of Engineers at the dam. It is not a river gauge, and it tells you what left the dam, not what has reached your access. Gauges on the river itself are listed under “Other gauges”.`
              : 'Check the gauge before you load the truck. Look at the current level, its trend, and recent rain together. A falling gauge alone does not establish suitable conditions; check the reach and current local advisories too.'}
          </p>
          {/* Hydro tailwaters only: the Black below Clearwater Dam is rated. */}
          {dam?.hydro && (
            <p style={{ fontSize: 15, color: 'var(--color-neutral-700)', marginBottom: 18, lineHeight: 1.6 }}>
              {dam.name} controls this river, so Eddy does not rate it good, low or too high the way it rates a free-flowing river. That is why the readings below say “Not rated”.
            </p>
          )}
          <iframe
            data-eddy-embed
            src={`/embed/gauge-report/${slug}?theme=light&days=14`}
            width="100%"
            loading="lazy"
            title={`${riverName} gauge report`}
            style={{
              border: 0,
              borderRadius: 12,
              display: 'block',
              width: '100%',
              maxWidth: '100%',
              height: 520,
            }}
          />

          {/* Dam releases for a dam without a schedule sit here; a hydro dam's are at the top. */}
          {dam && !dam.hydro && damSection}

          {/* Regulations */}
          {g.regulations && g.regulations.length > 0 && (
            <>
              <SectionTitle id="regulations" eyebrow="Park rules">
                Regulations
              </SectionTitle>
              <RegulationsCard regulations={g.regulations} />
            </>
          )}

          {/* When */}
          <SectionTitle id="when" eyebrow="By the season">
            When to go
          </SectionTitle>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
              background: '#fff',
              border: '2px solid var(--color-primary-700)',
              borderRadius: 8,
              boxShadow: '2px 2px 0 var(--color-neutral-300)',
              overflow: 'hidden',
            }}
          >
            {g.seasons.map((s, i) => (
              <div
                key={s.m}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 1.2fr',
                  gap: 18,
                  padding: '14px 20px',
                  borderTop: i ? '1px solid var(--color-neutral-200)' : 'none',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--color-primary-700)',
                  }}
                >
                  {s.m}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-neutral-900)' }}>{s.t}</div>
                <div style={{ fontSize: 14, color: 'var(--color-neutral-600)' }}>{s.note}</div>
              </div>
            ))}
          </div>

          {/* Drive times */}
          {g.drive_times && g.drive_times.length > 0 && (
            <>
              <SectionTitle id="drive" eyebrow="Getting there">
                Drive times
              </SectionTitle>
              <DriveTimesStrip
                driveTimes={g.drive_times}
                riverState={riverState}
                riverName={riverMeta.name}
              />
            </>
          )}

          {/* Pack & plan — merged "what to bring" + "pro tips" so readers
              don't slog through two stacked bullet lists in a row. */}
          <SectionTitle id="pack-and-plan" eyebrow="Pack & plan">
            Before you launch & on the water
          </SectionTitle>
          <div data-guide-pack-plan style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            <div>
              <div
                className="eyebrow"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--color-primary-700)',
                  marginBottom: 10,
                }}
              >
                Pack
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {g.what_to_bring.map((line) => (
                  <li
                    key={line}
                    style={{
                      fontSize: 15,
                      lineHeight: 1.55,
                      color: 'var(--color-neutral-800)',
                      paddingLeft: 22,
                      position: 'relative',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 10,
                        width: 12,
                        height: 2,
                        background: 'var(--color-accent-500)',
                      }}
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div
                className="eyebrow"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--color-primary-700)',
                  marginBottom: 10,
                }}
              >
                Plan
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {g.pro_tips.map((b) => (
                  <li
                    key={b.strong}
                    style={{
                      fontSize: 15,
                      lineHeight: 1.55,
                      color: 'var(--color-neutral-800)',
                      paddingLeft: 22,
                      position: 'relative',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 10,
                        width: 12,
                        height: 2,
                        background: 'var(--color-accent-500)',
                      }}
                    />
                    <strong style={{ color: 'var(--color-neutral-900)', fontWeight: 700 }}>{b.strong}</strong>{' '}
                    {b.body}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Nearby attractions */}
          {g.nearby_attractions && g.nearby_attractions.length > 0 && (
            <>
              <SectionTitle id="nearby" eyebrow="In the area">
                Nearby attractions
              </SectionTitle>
              <NearbyAttractionsList
                attractions={g.nearby_attractions}
                riverState={riverState}
              />
            </>
          )}

          {g.sources?.length ? <section aria-label="Guide sources" style={{ marginTop: 32, marginBottom: 24 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 10 }}>Sources &amp; local information</h3>
            {g.checked_at ? <p style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>Editorial sources checked {g.checked_at}.</p> : null}
            <ul style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
              {g.sources.map(source => <li key={source.url}><a href={source.url} style={{ textDecoration: 'underline' }}>{source.label}</a></li>)}
            </ul>
          </section> : null}

          <EddySaysCallout callout={g.callouts.footer} riverSlug={slug} />

          {/* FAQ */}
          <SectionTitle id="faq" eyebrow="Quick answers">
            FAQ
          </SectionTitle>
          <div id="faq-list">
            <FaqAccordion items={g.faq} />
          </div>

          {/* Related rivers */}
          {g.related_rivers && g.related_rivers.length > 0 && (
            <RelatedRiversStrip rivers={g.related_rivers} />
          )}

          {/* CTA */}
          <div
            data-guide-cta
            style={{
              marginTop: 56,
              padding: '32px 36px',
              backgroundImage: 'linear-gradient(135deg, #0F2D35 0%, #163F4A 40%, #1A4F5C 100%)',
              borderRadius: 12,
              border: '2px solid var(--color-neutral-900)',
              boxShadow: '4px 4px 0 var(--color-neutral-500)',
              display: 'grid',
              gridTemplateColumns: '1fr 120px',
              gap: 20,
              alignItems: 'center',
            }}
          >
            <div>
              <div
                className="eyebrow"
                style={{
                  color: 'var(--color-accent-300)',
                  marginBottom: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.12em',
                }}
              >
                Ready to launch?
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 28,
                  fontWeight: 600,
                  color: '#fff',
                  marginBottom: 12,
                  margin: 0,
                }}
              >
                Plan your {riverName} trip on Eddy
              </h3>
              <Link
                href={`/plan?river=${slug}`}
                style={{
                  display: 'inline-block',
                  marginTop: 14,
                  padding: '12px 22px',
                  background: 'var(--color-accent-500)',
                  color: '#fff',
                  border: '2px solid var(--color-neutral-900)',
                  borderRadius: 6,
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: '3px 3px 0 var(--color-neutral-900)',
                }}
              >
                Open the {riverName} planner →
              </Link>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={EDDY_CANOE}
              alt=""
              style={{
                width: 120,
                height: 120,
                objectFit: 'contain',
                filter: 'drop-shadow(0 8px 24px rgba(240,112,82,.4))',
              }}
            />
          </div>

        </main>
      </div>
    </article>
  );
}

// Inlined responsive overrides — needed because the design uses inline styles
// (no class names available for media queries). Scoped to the layout root via
// the `.eddy-guide-root` selector.
function ResponsiveStyles() {
  const css = `
    @media (max-width: 1023px) {
      .eddy-guide-root [data-guide-hero] {
        grid-template-columns: 1fr !important;
        gap: 24px !important;
      }
      .eddy-guide-root [data-guide-title] {
        font-size: 44px !important;
      }
      .eddy-guide-root [data-guide-body] {
        grid-template-columns: 1fr !important;
        gap: 24px !important;
        padding: 24px 20px 60px !important;
      }
      .eddy-guide-root [data-guide-toc] {
        display: none !important;
      }
      /* Clear the header and the sticky jump nav on a #hash landing. */
      .eddy-guide-root [id] {
        scroll-margin-top: 128px !important;
      }
      .eddy-guide-root [data-guide-mile-strip] {
        grid-template-columns: repeat(3, 1fr) !important;
      }
    }
    @media (max-width: 1023px) {
      .eddy-guide-root [data-guide-tldr] {
        grid-template-columns: repeat(2, 1fr) !important;
      }
      .eddy-guide-root [data-guide-tldr] > div {
        border-right: none !important;
        border-bottom: 1px dashed var(--color-neutral-300) !important;
      }
      .eddy-guide-root [data-guide-drive-times] {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 12px !important;
      }
    }
    @media (max-width: 880px) {
      .eddy-guide-root [data-guide-section-stats] {
        grid-template-columns: repeat(2, 1fr) !important;
        row-gap: 12px !important;
      }
      .eddy-guide-root [data-guide-section-stats] > div:nth-child(2) {
        border-right: none !important;
      }
      .eddy-guide-root [data-guide-section-stats] > div:nth-child(3),
      .eddy-guide-root [data-guide-section-stats] > div:nth-child(4) {
        padding-top: 8px;
      }
    }
    @media (max-width: 767px) {
      .eddy-guide-root [data-guide-meta] {
        row-gap: 4px !important;
      }
      .eddy-guide-root [data-guide-byline] {
        order: 1;
        flex-basis: 100%;
      }
      .eddy-guide-root [data-byline-separator] {
        display: none;
      }
      .eddy-guide-root [data-guide-section-grid] {
        grid-template-columns: 1fr !important;
      }
      .eddy-guide-root [data-guide-section-card] [data-guide-section-grid] > div:first-child {
        border-right: none !important;
        border-bottom: 2px solid var(--color-primary-700) !important;
      }
      .eddy-guide-root [data-guide-mile-strip] {
        grid-template-columns: repeat(2, 1fr) !important;
      }
      .eddy-guide-root [data-guide-cta] {
        grid-template-columns: 1fr !important;
      }
      .eddy-guide-root [data-guide-cta] img {
        display: none;
      }
      .eddy-guide-root [data-guide-title] {
        font-size: 36px !important;
      }
      .eddy-guide-root [data-guide-tldr] {
        grid-template-columns: 1fr !important;
      }
      .eddy-guide-root [data-guide-pack-plan] {
        grid-template-columns: 1fr !important;
        gap: 24px !important;
      }
    }
  `;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
