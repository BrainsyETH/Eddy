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
}

export interface SpringStop {
  name: string;
  mile: string;
  note: string;
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
