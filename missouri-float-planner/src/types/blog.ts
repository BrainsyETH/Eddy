// src/types/blog.ts
// Structured payload for River Guide blog posts. Persisted as JSONB in
// blog_posts.guide_data; rendered by src/components/blog/RiverGuideLayout.tsx.

export interface GuideMileStat {
  label: string;
  value: string;
}

export interface GuideHero {
  eyebrow: string;
  title_top: string;
  title_accent: string;
  lede: string;
  photo_url: string;
  mile_stats: GuideMileStat[];
}

export interface GuideBullet {
  strong: string;
  body: string;
}

export type FloatDifficulty = 'I' | 'I–II' | 'II';

export type SegmentId = 'upper' | 'middle' | 'lower';

export interface FloatSection {
  id: number;
  name: string;
  from: string;
  to: string;
  miles: string;
  time: string;
  diff: FloatDifficulty;
  crowd: string;
  best: string;
  photo: string | null;
  body: string;
  segment?: SegmentId;
  best_for_tags?: string[];
  /** Access point slug for the put-in. Used to build the planner deep link. */
  from_slug?: string;
  /** Access point slug for the take-out. Used to build the planner deep link. */
  to_slug?: string;
  /** Marks this section as one of "Eddy's Favorite Floats". When ANY section
   *  across all guides sets this, the Favorite Float social post narrows its
   *  daily rotation to only flagged sections; otherwise every guide section is
   *  a candidate. */
  eddy_favorite?: boolean;
}

export interface SpringStop {
  name: string;
  mile: string;
  note: string;
  rank?: string;
  flow?: string;
}

export interface SeasonRow {
  m: string;
  t: string;
  note: string;
}

export type CalloutTone = 'good' | 'note' | 'warn';

export type CalloutContent =
  | { live_quote: true; tone: 'good' | 'note' }
  | { live_quote?: false; tone: CalloutTone; quote: string };

export interface GuideCallouts {
  hero: CalloutContent;
  footer: CalloutContent;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface GuideTldr {
  typical_distance: string;
  best_for_beginners: string;
  primary_gauge: string;
  recommended_outfitter?: string;
}

export interface GuideSegment {
  id: SegmentId;
  label: string;
  character: string;
  best_for: string[];
  section_ids: number[];
}

export interface Regulation {
  topic: string;
  rule: string;
  /** Optional canonical authority URL (e.g. nps.gov/ozar page). */
  url?: string;
}

export interface DriveTime {
  city: string;
  hours: string;
}

export interface NearbyAttraction {
  name: string;
  kind: string;
  note: string;
  /** Optional canonical URL (e.g. mostateparks.com page, NPS page). */
  url?: string;
}

export interface RelatedRiver {
  slug: string;
  label: string;
}

export interface GuideData {
  hero: GuideHero;
  intro_html: string;
  why_different: GuideBullet[];
  sections: FloatSection[];
  springs: SpringStop[];
  seasons: SeasonRow[];
  what_to_bring: string[];
  pro_tips: GuideBullet[];
  callouts: GuideCallouts;
  faq: FaqItem[];
  tldr?: GuideTldr;
  segments?: GuideSegment[];
  regulations?: Regulation[];
  drive_times?: DriveTime[];
  nearby_attractions?: NearbyAttraction[];
  related_rivers?: RelatedRiver[];
  /** "Things to know before you launch" — surfaced under TL;DR. Use for
   *  facts a reader will regret missing (permits, cell service, shuttle
   *  logistics). 3 bullets is plenty. */
  pre_launch_notes?: GuideBullet[];
}

export interface RiverGuidePost {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  featured_image_url: string | null;
  og_image_url: string | null;
  meta_keywords: string[] | null;
  read_time_minutes: number | null;
  published_at: string | null;
  river_slug: string | null;
  guide_data: GuideData;
}

// =====================================================================
// General "Guides" articles (non-river). These reuse the River Guide
// Field Notebook look (src/components/blog/GuideArticleLayout.tsx) but are
// not tied to a single river, so they swap the river-specific sections
// (live gauge, springs, outfitter directory, access-point planner links)
// for a flexible ordered list of content blocks. Persisted as JSONB in
// blog_posts.guide_data with kind:'article' as the discriminator.
// =====================================================================

export interface ArticleTldrTile {
  label: string;
  value: string;
}

export interface ArticleStat {
  label: string;
  value: string;
}

export interface ArticleCard {
  title: string;
  /** Italic sub-line under the title, e.g. "Closest to St. Louis". */
  subtitle?: string;
  body: string;
  /** Optional 2–4 mini stats rendered in the field-notebook stat strip. */
  stats?: ArticleStat[];
  /** Small pill tags, e.g. "Beginner", "Outfitter shuttle". */
  tags?: string[];
  /** Optional internal link (e.g. /blog/<river-guide> or /rivers/<slug>). */
  href?: string;
  href_label?: string;
}

export interface ArticleStep {
  name: string;
  body: string;
}

export interface ArticleTable {
  columns: string[];
  rows: string[][];
}

/** Ordered content blocks rendered by GuideArticleLayout. Each carries an
 *  `id` (used for the section anchor + table of contents) except `callout`,
 *  which is an inline aside. */
export type ArticleBlock =
  | { type: 'prose'; id: string; toc: string; eyebrow?: string; title: string; html: string }
  | { type: 'bullets'; id: string; toc: string; eyebrow?: string; title: string; intro_html?: string; bullets: GuideBullet[] }
  | { type: 'checklist'; id: string; toc: string; eyebrow?: string; title: string; intro_html?: string; columns?: { heading: string; items: string[] }[]; items?: string[] }
  | { type: 'steps'; id: string; toc: string; eyebrow?: string; title: string; intro_html?: string; steps: ArticleStep[] }
  | { type: 'cards'; id: string; toc: string; eyebrow?: string; title: string; intro_html?: string; cards: ArticleCard[] }
  | { type: 'table'; id: string; toc: string; eyebrow?: string; title: string; intro_html?: string; table: ArticleTable }
  | { type: 'callout'; tone: CalloutTone; quote: string };

export interface ArticleCta {
  eyebrow?: string;
  title: string;
  body?: string;
  href: string;
  button: string;
}

export interface ArticleGuideData {
  /** Discriminator: routes the post to GuideArticleLayout instead of the
   *  river-specific RiverGuideLayout. */
  kind: 'article';
  hero: GuideHero;
  tldr?: ArticleTldrTile[];
  pre_launch_notes?: GuideBullet[];
  intro_html: string;
  blocks: ArticleBlock[];
  faq: FaqItem[];
  cta?: ArticleCta;
}

export interface ArticleGuidePost {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  featured_image_url: string | null;
  og_image_url: string | null;
  meta_keywords: string[] | null;
  read_time_minutes: number | null;
  published_at: string | null;
  guide_data: ArticleGuideData;
}

