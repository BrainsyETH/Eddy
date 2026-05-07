// src/components/blog/RiverGuideLayout.tsx
// Field Notebook layout for River Guide blog posts. Pulls structured data
// from blog_posts.guide_data and renders the design from variation-a.jsx in
// the bundled handoff.

import Link from 'next/link';
import Image from 'next/image';
import type { RiverGuidePost, FloatSection, GuideSegment } from '@/types/blog';
import { createAdminClient } from '@/lib/supabase/admin';
import SectionTitle from './SectionTitle';
import FloatSectionCard from './FloatSectionCard';
import EddySaysCallout from './EddySaysCallout';
import GuideTOC, { type TocItem } from './GuideTOC';
import GuideProgressBar from './GuideProgressBar';
import FaqAccordion from './FaqAccordion';
import DirectoryCards from './DirectoryCards';
import GuideTldr from './GuideTldr';
import SegmentHeader from './SegmentHeader';
import RegulationsCard from './RegulationsCard';
import PreLaunchCard from './PreLaunchCard';
import DriveTimesStrip from './DriveTimesStrip';
import NearbyAttractionsList from './NearbyAttractionsList';
import RelatedRiversStrip from './RelatedRiversStrip';

const EDDY_CANOE =
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

function buildToc(post: RiverGuidePost): TocItem[] {
  const g = post.guide_data;
  const items: TocItem[] = [];
  if (g.tldr) items.push({ id: 'tldr', label: 'TL;DR' });
  if (g.pre_launch_notes?.length) items.push({ id: 'pre-launch', label: 'Before you launch' });
  items.push(
    { id: 'today',      label: 'Today on the river' },
    { id: 'different',  label: 'Why this river is different' },
    { id: 'pick',       label: 'Pick your float' },
  );
  items.push(
    { id: 'springs',    label: 'Springs & sights' },
    { id: 'outfitters', label: 'Outfitters & lodging' },
    { id: 'gauge',      label: 'Water levels & gauge' },
  );
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

function formatDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

async function resolveAccessPointIds(
  riverSlug: string,
  sections: FloatSection[],
): Promise<Map<string, string>> {
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
    .select('slug, id')
    .eq('river_id', river.id)
    .in('slug', Array.from(slugs));

  return new Map(((aps ?? []) as { slug: string; id: string }[]).map((a) => [a.slug, a.id]));
}

function buildPlannerUrl(
  riverSlug: string,
  section: FloatSection,
  apIds: Map<string, string>,
): string | undefined {
  if (!section.from_slug || !section.to_slug) return undefined;
  const putIn = apIds.get(section.from_slug);
  const takeOut = apIds.get(section.to_slug);
  if (!putIn || !takeOut) return undefined;
  return `/plan?river=${riverSlug}&putIn=${putIn}&takeOut=${takeOut}`;
}

export default async function RiverGuideLayout({ post }: Props) {
  const g = post.guide_data;
  const slug = post.river_slug ?? post.slug;
  const riverName = g.hero.title_top;
  const toc = buildToc(post);
  const grouped = groupSectionsBySegment(g.sections, g.segments);
  const apIds = await resolveAccessPointIds(slug, g.sections);

  return (
    <article className="eddy-guide-root" style={{ background: 'var(--color-neutral-50)' }}>
      <GuideProgressBar />
      <ResponsiveStyles />

      {/* Top breadcrumb / meta strip */}
      <div
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
          href="/blog"
          style={{
            color: 'var(--color-primary-600)',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          ← Back to Blog
        </Link>
        {post.published_at && (
          <>
            <span>·</span>
            <span>{formatDate(post.published_at)}</span>
          </>
        )}
        {post.read_time_minutes && (
          <>
            <span>·</span>
            <span>{post.read_time_minutes} min read</span>
          </>
        )}
        <span
          style={{
            marginLeft: 'auto',
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
              src={g.hero.photo_url}
              alt={`${riverName} hero`}
              fill
              priority
              sizes="(max-width: 1023px) 100vw, 580px"
              style={{ objectFit: 'cover' }}
            />
          </div>
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
          {/* Today — Eddy's live take, condition-aware */}
          <div id="today" style={{ scrollMarginTop: 80 }}>
            <SectionTitle eyebrow="Live conditions">Today on the {riverName.replace(/ River$/, '')}</SectionTitle>
            <p style={{ fontSize: 17, color: 'var(--color-neutral-700)', marginBottom: 6, lineHeight: 1.65 }}>
              Eddy reads the gauge, the trend, and the forecast and writes a fresh take a few times a day. Use it as one input alongside your own judgment, the outfitter you&rsquo;re renting from, and the most recent NPS advisories.
            </p>
          </div>

          <EddySaysCallout callout={g.callouts.hero} riverSlug={slug} />

          {/* Why different */}
          <SectionTitle id="different" eyebrow="The pitch">
            Why the {riverName.replace(/ River$/, '')} is different
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
          <SectionTitle id="pick" eyebrow="Float sections">
            Pick your float
          </SectionTitle>
          <p style={{ fontSize: 17, color: 'var(--color-neutral-700)', marginBottom: 24, lineHeight: 1.65 }}>
            The {riverName.replace(/ River$/, '')} divides cleanly into character zones. Pick by how much time you have, who you&rsquo;re paddling with, and what you want to see.
          </p>
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
                      plannerUrl={buildPlannerUrl(slug, s, apIds)}
                    />
                  );
                })}
              </div>
            ));
          })()}

          {/* Springs */}
          <SectionTitle id="springs" eyebrow="Off-river stops">
            Springs &amp; sights worth stopping for
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
                  gridTemplateColumns: '100px 1fr',
                  gap: 0,
                  padding: '16px 22px',
                  borderTop: i ? '1px dashed var(--color-neutral-300)' : 'none',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    color: 'var(--color-accent-600)',
                    fontWeight: 700,
                  }}
                >
                  mile {sp.mile}
                </div>
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
                </div>
              </div>
            ))}
          </div>

          {/* Outfitters — full inline directory, no off-page redirects */}
          <SectionTitle id="outfitters" eyebrow="Directory">
            Outfitters, campgrounds &amp; lodging
          </SectionTitle>
          <p style={{ fontSize: 15, color: 'var(--color-neutral-600)', marginBottom: 18, lineHeight: 1.55 }}>
            Every active service that operates on the {riverName.replace(/ River$/, '')}. Tap a phone number to call; tap Reserve to book.
          </p>
          <DirectoryCards riverSlug={slug} />

          {/* Gauge */}
          <SectionTitle id="gauge" eyebrow="USGS data">
            Water levels &amp; gauge
          </SectionTitle>
          <p style={{ fontSize: 17, color: 'var(--color-neutral-700)', marginBottom: 18, lineHeight: 1.65 }}>
            Check the gauge before you load the truck. The trend over the last week matters more than today&rsquo;s number — a falling river after a flood is fine; a rising river isn&rsquo;t.
          </p>
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
              <DriveTimesStrip driveTimes={g.drive_times} />
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
              <NearbyAttractionsList attractions={g.nearby_attractions} />
            </>
          )}

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

          <div
            style={{
              marginTop: 24,
              padding: '16px 20px',
              background: 'var(--color-secondary-50)',
              borderLeft: '4px solid var(--color-accent-500)',
              borderRadius: 4,
              fontSize: 14,
              lineHeight: 1.55,
              color: 'var(--color-neutral-700)',
            }}
          >
            <strong style={{ color: 'var(--color-neutral-900)' }}>Safety first:</strong> Eddy is a planning guide only. Always consult local outfitters and authorities for current conditions before floating. Water levels can change rapidly. Wear life jackets and never float alone.
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
      .eddy-guide-root [data-guide-directory-grid] {
        grid-template-columns: repeat(2, 1fr) !important;
      }
    }
    @media (max-width: 767px) {
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
      .eddy-guide-root [data-guide-directory-grid] {
        grid-template-columns: 1fr !important;
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
