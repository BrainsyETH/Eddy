// src/lib/social/types.ts
// Shared types for social media posting system

export type SocialPlatform = 'instagram' | 'facebook';
export type PostType = 'daily_digest' | 'river_highlight';
export type PostStatus = 'pending' | 'publishing' | 'published' | 'failed' | 'skipped';
export type CustomContentType = 'promo' | 'tip' | 'seasonal' | 'cta';

export interface SocialPost {
  id: string;
  post_type: PostType;
  platform: SocialPlatform;
  river_slug: string | null;
  caption: string;
  image_url: string | null;
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
  imageUrl: string;
}

export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  error?: string;
}

// What the scheduler produces for the cron to process
export interface ScheduledPost {
  postType: PostType;
  riverSlug: string | null;
  caption: string;
  imageUrl: string;
  hashtags: string[];
  eddyUpdateId: string | null;
}
