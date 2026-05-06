// src/components/blog/RiverGuideLayout.tsx
// Field Notebook layout for River Guide blog posts. Pulls structured data
// from blog_posts.guide_data and renders the design from variation-a.jsx in
// the bundled handoff.

import Link from 'next/link';
import type { RiverGuidePost } from '@/types/blog';
import SectionTitle from './SectionTitle';
import FloatSectionCard from './FloatSectionCard';
import EddySaysCallout from './EddySaysCallout';
import GuideTOC, { type TocItem } from './GuideTOC';
import GuideProgressBar from './GuideProgressBar';
import FaqAccordion from './FaqAccordion';

const EDDY_CANOE =
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

const TOC: TocItem[] = [
  { id: 'today', label: 'Today on the river' },
  { id: 'different', label: 'Why this river is different' },
  { id: 'pick', label: 'Pick your float' },
  { id: 'plan', label: 'Plan your trip' },
  { id: 'springs', label: 'Springs & sights' },
  { id: 'outfitters', label: 'Outfitters & lodging' },
  { id: 'gauge', label: 'Water levels & gauge' },
  { id: 'when', label: 'When to go' },
  { id: 'bring', label: 'What to bring' },
  { id: 'tips', label: 'Pro tips' },
  { id: 'faq', label: 'FAQ' },
];

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

export default function RiverGuideLayout({ post }: Props) {
  const g = post.guide_data;
  const slug = post.river_slug ?? post.slug;
  const riverName = g.hero.title_top;

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
              aspectRatio: '4/3',
              borderRadius: 8,
              overflow: 'hidden',
              border: '2px solid var(--color-primary-700)',
              boxShadow: '3px 3px 0 var(--color-neutral-400)',
              backgroundImage: `url(${g.hero.photo_url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
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
        <GuideTOC items={TOC} riverSlug={post.river_slug} riverName={riverName} />

        <main style={{ maxWidth: 760, minWidth: 0 }}>
          {/* Today */}
          <div id="today" style={{ scrollMarginTop: 80 }}>
            <SectionTitle eyebrow="Live conditions">Today on the {riverName.replace(/ River$/, '')}</SectionTitle>
            <p style={{ fontSize: 17, color: 'var(--color-neutral-700)', marginBottom: 18, lineHeight: 1.65 }}>
              Conditions update automatically. If the widget says <em>good</em> or <em>flowing</em>, you&rsquo;re cleared to launch — the rest of this guide picks the float section.
            </p>
            <iframe
              data-eddy-embed
              src={`/embed/widget/${slug}?theme=light`}
              width="100%"
              loading="lazy"
              title={`${riverName} live conditions`}
              style={{
                border: 0,
                borderRadius: 12,
                display: 'block',
                width: '100%',
                maxWidth: '100%',
                height: 480,
              }}
            />
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
          {g.sections.map((s, i) => (
            <FloatSectionCard key={s.id} section={s} index={i} />
          ))}

          {/* Plan */}
          <SectionTitle id="plan" eyebrow="Built-in planner">
            Plan your exact trip
          </SectionTitle>
          <p style={{ fontSize: 17, color: 'var(--color-neutral-700)', marginBottom: 18, lineHeight: 1.65 }}>
            Pick a put-in and take-out and we&rsquo;ll calculate distance, an estimated float time for your boat, current conditions, and the outfitters that serve those access points.
          </p>
          <iframe
            data-eddy-embed
            src={`/embed/planner?river=${slug}&theme=light`}
            width="100%"
            loading="lazy"
            title={`Plan a ${riverName} float trip`}
            style={{
              border: 0,
              borderRadius: 12,
              display: 'block',
              width: '100%',
              maxWidth: '100%',
              height: 420,
            }}
          />

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

          {/* Outfitters */}
          <SectionTitle id="outfitters" eyebrow="Directory">
            Outfitters, campgrounds &amp; lodging
          </SectionTitle>
          <p style={{ fontSize: 17, color: 'var(--color-neutral-700)', marginBottom: 18, lineHeight: 1.65 }}>
            Every active service that operates on the {riverName.replace(/ River$/, '')}, with phone, website, reservation links, and Google Maps directions. Filter by type below.
          </p>
          <iframe
            data-eddy-embed
            src={`/embed/services/${slug}?theme=light`}
            width="100%"
            loading="lazy"
            title={`${riverName} outfitters and campgrounds`}
            style={{
              border: 0,
              borderRadius: 12,
              display: 'block',
              width: '100%',
              maxWidth: '100%',
              height: 520,
            }}
          />

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

          {/* Bring */}
          <SectionTitle id="bring" eyebrow="Packing list">
            What to bring
          </SectionTitle>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {g.what_to_bring.map((line) => (
              <li
                key={line}
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
                {line}
              </li>
            ))}
          </ul>

          {/* Pro tips */}
          <SectionTitle id="tips" eyebrow="Eddy's playbook">
            Pro tips
          </SectionTitle>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {g.pro_tips.map((b) => (
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

          <EddySaysCallout callout={g.callouts.footer} riverSlug={slug} />

          {/* FAQ */}
          <SectionTitle id="faq" eyebrow="Quick answers">
            FAQ
          </SectionTitle>
          <div id="faq-list">
            <FaqAccordion items={g.faq} />
          </div>

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
                href={`/rivers/${slug}`}
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
    }
  `;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
