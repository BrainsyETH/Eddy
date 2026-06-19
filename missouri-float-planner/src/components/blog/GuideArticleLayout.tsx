// src/components/blog/GuideArticleLayout.tsx
// Field Notebook layout for general "Guides" articles (non-river). Shares the
// look of RiverGuideLayout — progress bar, eyebrow section titles, sticky TOC,
// TL;DR tiles, Eddy-says callouts, FAQ accordion, dark CTA — but renders a
// flexible, river-agnostic list of content blocks from blog_posts.guide_data
// (ArticleGuideData, kind:'article').

import Link from 'next/link';
import Image from 'next/image';
import type {
  ArticleGuidePost,
  ArticleBlock,
  ArticleCard,
  GuideBullet,
} from '@/types/blog';
import SectionTitle from './SectionTitle';
import GuideTOC, { type TocItem } from './GuideTOC';
import GuideProgressBar from './GuideProgressBar';
import FaqAccordion from './FaqAccordion';
import PreLaunchCard from './PreLaunchCard';
import EddySaysCallout from './EddySaysCallout';

const EDDY_CANOE =
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

interface Props {
  post: ArticleGuidePost;
}

function formatDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildToc(post: ArticleGuidePost): TocItem[] {
  const g = post.guide_data;
  const items: TocItem[] = [];
  if (g.tldr?.length) items.push({ id: 'tldr', label: 'TL;DR' });
  if (g.pre_launch_notes?.length) items.push({ id: 'pre-launch', label: 'Before you go' });
  for (const b of g.blocks) {
    if (b.type === 'callout') continue;
    items.push({ id: b.id, label: b.toc });
  }
  if (g.faq?.length) items.push({ id: 'faq', label: 'FAQ' });
  return items;
}

// Shared coral-dash bullet, matching RiverGuideLayout's "why different" list.
function DashBullet({ bullet }: { bullet: GuideBullet }) {
  return (
    <li
      style={{
        fontSize: 16,
        lineHeight: 1.6,
        color: 'var(--color-neutral-800)',
        paddingLeft: 28,
        position: 'relative',
      }}
    >
      <span
        aria-hidden
        style={{ position: 'absolute', left: 0, top: 11, width: 14, height: 2, background: 'var(--color-accent-500)' }}
      />
      <strong style={{ color: 'var(--color-neutral-900)', fontWeight: 700 }}>{bullet.strong}</strong>{' '}
      {bullet.body}
    </li>
  );
}

function PlainBullet({ text }: { text: string }) {
  return (
    <li
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
        style={{ position: 'absolute', left: 0, top: 10, width: 12, height: 2, background: 'var(--color-accent-500)' }}
      />
      {text}
    </li>
  );
}

function ArticleCardItem({ card }: { card: ArticleCard }) {
  return (
    <article
      style={{
        background: '#fff',
        border: '2px solid var(--color-primary-700)',
        borderRadius: 8,
        boxShadow: '3px 3px 0 var(--color-neutral-400)',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-.01em',
          lineHeight: 1.2,
          color: 'var(--color-neutral-900)',
          margin: 0,
        }}
      >
        {card.title}
      </h3>
      {card.subtitle && (
        <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', fontStyle: 'italic', margin: '4px 0 0' }}>
          {card.subtitle}
        </p>
      )}

      {card.stats && card.stats.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${card.stats.length}, 1fr)`,
            gap: 0,
            margin: '14px 0',
            padding: '10px 0',
            borderTop: '1px solid var(--color-neutral-200)',
            borderBottom: '1px solid var(--color-neutral-200)',
          }}
        >
          {card.stats.map((st, i) => (
            <div
              key={st.label}
              style={{
                padding: '0 12px',
                borderRight: i < card.stats!.length - 1 ? '1px dashed var(--color-neutral-300)' : 'none',
                minWidth: 0,
              }}
            >
              <div
                className="eyebrow"
                style={{
                  marginBottom: 4,
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.12em',
                  color: 'var(--color-neutral-500)',
                }}
              >
                {st.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--color-neutral-900)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {st.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--color-neutral-700)', margin: card.stats?.length ? 0 : '14px 0 0' }}>
        {card.body}
      </p>

      {card.tags && card.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
          {card.tags.map((t) => (
            <span
              key={t}
              style={{
                padding: '3px 10px',
                background: 'var(--color-accent-50)',
                color: 'var(--color-accent-700)',
                border: '1.5px solid var(--color-accent-300)',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.04em',
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {card.href && (
        <Link
          href={card.href}
          style={{
            marginTop: 16,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-accent-600)',
            textDecoration: 'none',
            letterSpacing: '.02em',
          }}
        >
          {card.href_label ?? 'Read more'} →
        </Link>
      )}
    </article>
  );
}

function BlockBody({ block }: { block: ArticleBlock }) {
  switch (block.type) {
    case 'prose':
      return (
        <div
          style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--color-neutral-800)' }}
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      );

    case 'bullets':
      return (
        <>
          {block.intro_html && (
            <div
              style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--color-neutral-800)', marginBottom: 18 }}
              dangerouslySetInnerHTML={{ __html: block.intro_html }}
            />
          )}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {block.bullets.map((b) => (
              <DashBullet key={b.strong} bullet={b} />
            ))}
          </ul>
        </>
      );

    case 'checklist':
      return (
        <>
          {block.intro_html && (
            <div
              style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--color-neutral-800)', marginBottom: 18 }}
              dangerouslySetInnerHTML={{ __html: block.intro_html }}
            />
          )}
          {block.columns && block.columns.length > 0 ? (
            <div data-article-checklist style={{ display: 'grid', gridTemplateColumns: `repeat(${block.columns.length}, 1fr)`, gap: 32 }}>
              {block.columns.map((col) => (
                <div key={col.heading}>
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
                    {col.heading}
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {col.items.map((it) => (
                      <PlainBullet key={it} text={it} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(block.items ?? []).map((it) => (
                <PlainBullet key={it} text={it} />
              ))}
            </ul>
          )}
        </>
      );

    case 'steps':
      return (
        <>
          {block.intro_html && (
            <div
              style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--color-neutral-800)', marginBottom: 18 }}
              dangerouslySetInnerHTML={{ __html: block.intro_html }}
            />
          )}
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {block.steps.map((s, i) => (
              <li
                key={s.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '52px 1fr',
                  gap: 16,
                  alignItems: 'start',
                  background: '#fff',
                  border: '2px solid var(--color-primary-700)',
                  borderRadius: 8,
                  boxShadow: '2px 2px 0 var(--color-neutral-300)',
                  padding: '16px 18px',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 40,
                    height: 40,
                    background: 'var(--color-accent-500)',
                    color: '#fff',
                    border: '2px solid var(--color-neutral-900)',
                    borderRadius: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 17,
                    fontWeight: 700,
                    fontFamily: 'var(--font-display)',
                    boxShadow: '2px 2px 0 var(--color-neutral-900)',
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-neutral-900)', marginBottom: 4 }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--color-neutral-700)' }}>{s.body}</div>
                </div>
              </li>
            ))}
          </ol>
        </>
      );

    case 'cards':
      return (
        <>
          {block.intro_html && (
            <div
              style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--color-neutral-800)', marginBottom: 18 }}
              dangerouslySetInnerHTML={{ __html: block.intro_html }}
            />
          )}
          <div data-article-cards style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
            {block.cards.map((c) => (
              <ArticleCardItem key={c.title} card={c} />
            ))}
          </div>
        </>
      );

    case 'table':
      return (
        <>
          {block.intro_html && (
            <div
              style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--color-neutral-800)', marginBottom: 18 }}
              dangerouslySetInnerHTML={{ __html: block.intro_html }}
            />
          )}
          <div
            data-article-table
            style={{
              background: '#fff',
              border: '2px solid var(--color-primary-700)',
              borderRadius: 8,
              boxShadow: '2px 2px 0 var(--color-neutral-300)',
              overflowX: 'auto',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr>
                  {block.table.columns.map((c) => (
                    <th
                      key={c}
                      className="eyebrow"
                      style={{
                        textAlign: 'left',
                        padding: '12px 18px',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '.12em',
                        textTransform: 'uppercase',
                        color: 'var(--color-neutral-500)',
                        background: 'var(--color-secondary-50)',
                        borderBottom: '2px solid var(--color-primary-700)',
                      }}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.table.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: '12px 18px',
                          borderTop: ri ? '1px solid var(--color-neutral-200)' : 'none',
                          fontSize: ci === 0 ? 14 : 14,
                          fontFamily: ci === 0 ? 'var(--font-mono)' : 'inherit',
                          fontWeight: ci === 0 ? 700 : 400,
                          color: ci === 0 ? 'var(--color-primary-700)' : 'var(--color-neutral-700)',
                          lineHeight: 1.5,
                          verticalAlign: 'top',
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );

    case 'callout':
      return <EddySaysCallout callout={{ tone: block.tone, quote: block.quote }} riverSlug="" />;

    default:
      return null;
  }
}

export default function GuideArticleLayout({ post }: Props) {
  const g = post.guide_data;
  const toc = buildToc(post);

  return (
    <article className="eddy-guide-article-root" style={{ background: 'var(--color-neutral-50)' }}>
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
        <Link href="/blog" style={{ color: 'var(--color-primary-600)', textDecoration: 'none', fontWeight: 600 }}>
          ← All guides
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
        <div data-article-hero style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 48, alignItems: 'end' }}>
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
              data-article-title
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 64,
                fontWeight: 600,
                lineHeight: 1.02,
                letterSpacing: '-.02em',
                color: 'var(--color-neutral-900)',
                margin: 0,
              }}
            >
              {g.hero.title_top}
              <br />
              <span style={{ color: 'var(--color-accent-500)' }}>{g.hero.title_accent}</span>
            </h1>
            <p style={{ fontSize: 19, lineHeight: 1.55, color: 'var(--color-neutral-700)', maxWidth: 540, marginTop: 24 }}>
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
              alt={post.title}
              fill
              priority
              sizes="(max-width: 1023px) 100vw, 580px"
              style={{ objectFit: 'cover' }}
            />
          </div>
        </div>

        {/* Mile-marker stat strip */}
        {g.hero.mile_stats.length > 0 && (
          <div
            data-article-mile-strip
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
                  borderRight: i < g.hero.mile_stats.length - 1 ? '1px dashed var(--color-neutral-300)' : 'none',
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
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 600, color: 'var(--color-neutral-900)' }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* TL;DR */}
      {g.tldr && g.tldr.length > 0 && (
        <section id="tldr" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px', scrollMarginTop: 80 }}>
          <div
            data-article-tldr
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${g.tldr.length}, 1fr)`,
              gap: 0,
              background: '#fff',
              border: '2px solid var(--color-primary-700)',
              borderRadius: 8,
              boxShadow: '3px 3px 0 var(--color-neutral-400)',
              margin: '24px 0 0',
              overflow: 'hidden',
            }}
          >
            {g.tldr.map((t, i) => (
              <div
                key={t.label}
                style={{
                  padding: '16px 18px',
                  borderRight: i < g.tldr!.length - 1 ? '1px dashed var(--color-neutral-300)' : 'none',
                }}
              >
                <div
                  className="eyebrow"
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: 'var(--color-accent-600)',
                    marginBottom: 6,
                  }}
                >
                  {t.label}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-neutral-900)', lineHeight: 1.35 }}>
                  {t.value}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pre-launch notes */}
      {g.pre_launch_notes && g.pre_launch_notes.length > 0 && (
        <section id="pre-launch" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px', scrollMarginTop: 80 }}>
          <PreLaunchCard notes={g.pre_launch_notes} />
        </section>
      )}

      {/* Body grid */}
      <div
        data-article-body
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
        <GuideTOC items={toc} riverSlug={null} riverName="" />

        <main style={{ maxWidth: 760, minWidth: 0 }}>
          {/* Intro lede */}
          {g.intro_html && (
            <div
              style={{ fontSize: 18, lineHeight: 1.7, color: 'var(--color-neutral-800)' }}
              dangerouslySetInnerHTML={{ __html: g.intro_html }}
            />
          )}

          {/* Content blocks */}
          {g.blocks.map((block, i) =>
            block.type === 'callout' ? (
              <BlockBody key={`callout-${i}`} block={block} />
            ) : (
              <div key={block.id} id={block.id} style={{ scrollMarginTop: 80 }}>
                <SectionTitle eyebrow={block.eyebrow}>{block.title}</SectionTitle>
                <BlockBody block={block} />
              </div>
            ),
          )}

          {/* FAQ */}
          {g.faq && g.faq.length > 0 && (
            <>
              <SectionTitle id="faq" eyebrow="Quick answers">
                FAQ
              </SectionTitle>
              <div id="faq-list">
                <FaqAccordion items={g.faq} />
              </div>
            </>
          )}

          {/* CTA */}
          <div
            data-article-cta
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
                {g.cta?.eyebrow ?? 'Ready to launch?'}
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 28,
                  fontWeight: 600,
                  color: '#fff',
                  margin: 0,
                }}
              >
                {g.cta?.title ?? 'Plan your float trip on Eddy'}
              </h3>
              {g.cta?.body && (
                <p style={{ color: 'rgba(255,255,255,.82)', fontSize: 15, lineHeight: 1.55, marginTop: 10, marginBottom: 0, maxWidth: 460 }}>
                  {g.cta.body}
                </p>
              )}
              <Link
                href={g.cta?.href ?? '/'}
                style={{
                  display: 'inline-block',
                  marginTop: 16,
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
                {g.cta?.button ?? 'Start planning'} →
              </Link>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={EDDY_CANOE}
              alt=""
              style={{ width: 120, height: 120, objectFit: 'contain', filter: 'drop-shadow(0 8px 24px rgba(240,112,82,.4))' }}
            />
          </div>

          {/* Safety note */}
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
            <strong style={{ color: 'var(--color-neutral-900)' }}>Safety first:</strong> Eddy is a planning guide only.
            Always check current conditions with local outfitters and authorities before you float. Water levels can change
            rapidly. Wear a life jacket and never float alone.
          </div>
        </main>
      </div>
    </article>
  );
}

// Inlined responsive overrides — the design uses inline styles (no class hooks
// for media queries), so we scope rules to `.eddy-guide-article-root` and the
// data-attributes set on the responsive containers above.
function ResponsiveStyles() {
  const css = `
    @media (max-width: 1023px) {
      .eddy-guide-article-root [data-article-hero] {
        grid-template-columns: 1fr !important;
        gap: 24px !important;
      }
      .eddy-guide-article-root [data-article-title] { font-size: 44px !important; }
      .eddy-guide-article-root [data-article-body] {
        grid-template-columns: 1fr !important;
        gap: 24px !important;
        padding: 24px 20px 60px !important;
      }
      .eddy-guide-article-root [data-guide-toc] { display: none !important; }
      .eddy-guide-article-root [data-article-mile-strip] { grid-template-columns: repeat(2, 1fr) !important; row-gap: 14px; }
      .eddy-guide-article-root [data-article-tldr] { grid-template-columns: repeat(2, 1fr) !important; }
      .eddy-guide-article-root [data-article-tldr] > div { border-right: none !important; border-bottom: 1px dashed var(--color-neutral-300) !important; }
      .eddy-guide-article-root [data-article-cards] { grid-template-columns: 1fr !important; }
    }
    @media (max-width: 767px) {
      .eddy-guide-article-root [data-article-title] { font-size: 36px !important; }
      .eddy-guide-article-root [data-article-mile-strip] { grid-template-columns: repeat(2, 1fr) !important; }
      .eddy-guide-article-root [data-article-tldr] { grid-template-columns: 1fr !important; }
      .eddy-guide-article-root [data-article-checklist] { grid-template-columns: 1fr !important; gap: 24px !important; }
      .eddy-guide-article-root [data-article-cta] { grid-template-columns: 1fr !important; }
      .eddy-guide-article-root [data-article-cta] img { display: none; }
    }
  `;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
