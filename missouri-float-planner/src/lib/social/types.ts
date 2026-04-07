// src/lib/social/types.ts
// Shared types for social media posting system

export type SocialPlatform = 'instagram' | 'facebook';
export type PostType = 'daily_digest' | 'river_highlight' | 'manual' | 'condition_change';
export type PostStatus = 'pending' | 'rendering' | 'publishing' | 'published' | 'failed' | 'skipped';
export type CustomContentType = 'promo' | 'tip' | 'seasonal' | 'cta';

export type MediaType = 'image' | 'video';

export interface SocialPost {
  id: string;
  post_type: PostType;
  platform: SocialPlatform;
  river_slug: string | null;
  caption: string;
  image_url: string | null;
  video_url: string | null;
  media_type: MediaType;
  hashtags: string[];
  platform_post_id: string | null;
  status: PostStatus;
  error_message: string | null;
  retry_count: number;
  eddy_update_id: string | null;
  created_at: string;
  published_at: string | null;
  updated_at: string;
}

export interface SocialConfig {
  id: string;
  posting_enabled: boolean;
  posting_frequency_hours: number;
  digest_enabled: boolean;
  digest_time_utc: string;
  highlights_per_run: number;
  highlight_cooldown_hours: number;
  enabled_rivers: string[] | null;
  disabled_rivers: string[];
  highlight_conditions: string[];
  weekend_boost_enabled: boolean;
  river_schedules: Record<string, Record<string, string | null>>; // { river_slug: { mon: "HH:MM", tue: null, ... } }
  updated_at: string;
}

export interface SocialCustomContent {
  id: string;
  content_type: CustomContentType;
  text: string;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  platforms: SocialPlatform[];
  created_at: string;
  updated_at: string;
}

// Platform adapter interface — extensible for future platforms (Twitter/X, etc.)
export interface PlatformAdapter {
  platform: SocialPlatform;
  publishPost(params: PublishParams): Promise<PublishResult>;
  validateCredentials(): Promise<boolean>;
}

export interface PublishParams {
  caption: string;
  imageUrl?: string;
  videoUrl?: string;
  coverUrl?: string;
  mediaType?: MediaType;
}

export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  error?: string;
}

// ─── ClipEngine types ───

export type ContentCategory = 'conditions' | 'educational' | 'engagement' | 'promotional';
export type AudienceSegment = 'paddler' | 'angler' | 'family' | 'general';
export type HookStyle = 'question' | 'stat' | 'urgency' | 'story';
export type BrandCheckStatus = 'pending' | 'approved' | 'rejected' | 'review';
export type ClipOrientation = 'landscape' | 'portrait';
export type ContentFormat = 'single' | 'highlights' | 'montage';

export interface ClipLibraryItem {
  id: string;
  youtube_video_id: string;
  youtube_channel: string | null;
  river_slug: string | null;
  clip_url: string;
  thumbnail_url: string | null;
  duration_secs: number | null;
  clip_start_secs: number | null;
  clip_end_secs: number | null;
  orientation: ClipOrientation;
  heatmap_score: number | null;
  brand_check_status: BrandCheckStatus;
  brand_check_result: Record<string, unknown> | null;
  source_creator: string | null;
  source_url: string | null;
  content_tags: string[];
  content_type: string | null;
  tone: string | null;
  used_in_posts: string[];
  created_at: string;
  updated_at: string;
}

export interface ContentDecision {
  postType: PostType;
  format: ContentFormat;
  contentCategory: ContentCategory;
  audienceSegment: AudienceSegment;
  hookStyle: HookStyle;
  riverSlug: string | null;
  clipId: string | null;
  clipIds: string[];
  montageTheme: string | null;
  montageTitle: string | null;
  reasoning: string;
}

export interface ContentMixStatus {
  actual: Record<ContentCategory, number>;
  target: Record<ContentCategory, number>;
  deviation: Record<ContentCategory, number>;
}

export interface WeeklyReview {
  id: string;
  week_start: string;
  week_end: string;
  review_data: Record<string, unknown>;
  content_mix: ContentMixStatus | null;
  top_performers: Array<{ post_id: string; engagement_rate: number; content_type: string }>;
  learnings: string | null;
  bias_guidance: string | null;
  created_at: string;
}

// What the scheduler produces for the cron to process
export interface ScheduledPost {
  postType: PostType;
  platform: SocialPlatform;
  riverSlug: string | null;
  caption: string;
  imageUrl: string;
  videoUrl?: string;
  mediaType: MediaType;
  hashtags: string[];
  eddyUpdateId: string | null;
}
