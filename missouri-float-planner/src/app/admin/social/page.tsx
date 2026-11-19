'use client';

// src/app/admin/social/page.tsx
// Admin dashboard for social media posting — settings, filters, custom content, post history

import DamScheduleExport from '@/components/admin/social/DamScheduleExport';
import DamVideoDownload from '@/components/admin/social/DamVideoDownload';
import { isDamStory, isMeasuredReleaseVideo } from '@shared/social-dam-schedule';
import CarouselPreview from '@/components/admin/social/CarouselPreview';
import { isDailyReport, reportImageUrls, reportNeedsRender } from '@/lib/social/daily-report';
import { DestinationFields, PublishingPlanner, RuleEditor } from '@/components/admin/social/PublishingPlanner';
import studio from '@/components/admin/social/publishing.module.css';
import { nextHalfHourInput } from '@/lib/social/local-time';
import { type PlanRule, type Weekday, type Delivery } from '@/lib/social/publishing-plan';
import type { MediaSchedule } from '@/lib/social/types';
import { destinationLabel, isStoryRender, renderPlacement, type PlacementChoices } from '@/lib/social/placements';
import { CoverPreview } from '@/components/admin/social/CoverPreview';
import { videoSafeInsets } from '@shared/social-brand';
import styles from './review.module.css';
import { useEffect, useState, useCallback, useRef } from 'react';
import { adminFetch, useAdminAuth } from '@/hooks/useAdminAuth';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  RefreshCw,
  Settings,
  CalendarDays,
  Inbox,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RotateCcw,
  Plus,
  Trash2,
  Save,
  Send,
  X,

  Play,
  Copy,
} from 'lucide-react';

type Tab = 'planner' | 'queue' | 'history' | 'content' | 'settings' | 'create';
const screens: { key: Exclude<Tab, 'create'>; label: string; icon: typeof Clock }[] = [
  { key: 'planner', label: 'Planner', icon: CalendarDays }, { key: 'queue', label: 'Queue', icon: Inbox },
  { key: 'history', label: 'History', icon: Clock }, { key: 'content', label: 'Library', icon: FileText },
  { key: 'settings', label: 'Settings', icon: Settings },
];
const formatFor = { digest: 'daily_digest', highlight: 'river_highlight', section_guide: 'section_guide', weekly_forecast: 'weekly_forecast' } as const;
type ComposerKind = keyof typeof formatFor | 'tip' | 'dam' | 'custom';

interface PlatformHealthStats {
  platform: string;
  videoPublished: number;
  imagePublished: number;
  failed: number;
  rendering: number;
  fallbackToImage: number;
  lastSuccessfulVideoAt: string | null;
}

interface HealthSnapshot {
  windowDays: number;
  generatedAt: string;
  videoPipelineHealthy: boolean;
  hoursSinceLastSuccessfulVideo: number | null;
  byPlatform: PlatformHealthStats[];
  recentFallbackReasons: Array<{ reason: string; count: number; mostRecentAt: string }>;
}

interface PreflightOutcome {
  ok: boolean;
  status: number;
  body: { reason?: string | null; checks?: Record<string, unknown>; config?: Record<string, unknown> };
}

interface VideoFeatures {
  condition_alerts_as_video: boolean;
}

interface WeeklyReelConfig {
  enabled: boolean;
  day_of_week: number; // 0=Sun..6=Sat
  time_cst: string;
  media: 'video' | 'image';
}
interface SocialConfig {
  updated_at: string;
  timezone?: string;
  daily_report_auto_publish_enabled?: boolean;
  meta_accounts?: { facebook: boolean; instagram: boolean };
  id: string;
  posting_enabled: boolean;
  posting_frequency_hours: number;
  digest_enabled: boolean;
  digest_time_cst: string;
  highlights_per_run: number;
  highlight_cooldown_hours: number;
  enabled_rivers: string[] | null;
  disabled_rivers: string[];
  highlight_conditions: string[];
  weekend_boost_enabled: boolean;
  river_schedules: Record<string, Record<string, string | null>>;
  video_features: VideoFeatures;
  media_schedule: MediaSchedule;
  weekly_forecast: WeeklyReelConfig;
  section_guide: WeeklyReelConfig & { placements?: PlacementChoices };
  weekly_trend: WeeklyReelConfig;
}

interface PreviewPost {
  placement?: 'reel' | 'story';
  postType: string;
  platform: string;
  riverSlug: string | null;
  caption: string;
  imageUrl: string;
  mediaType: string;
  hashtags: string[];
}

interface PreviewData {
  posts: PreviewPost[];
  diagnostics: {
    posting_enabled: boolean;
    digest_enabled: boolean;
    rivers: string[];
    eligible_rivers: string[];
    due_rivers: string[];
    skipped_reasons: string[];
    highlight_conditions: string[];
    river_schedules: Record<string, Record<string, string | null>>;
  };
}

interface SocialPost {
  scheduled_at?: string | null;
  id: string;
  post_type: string;
  platform: string;
  river_slug: string | null;
  caption: string;
  status: string;
  error_message: string | null;
  retry_count: number;
  platform_post_id: string | null;
  image_url: string | null;
  video_url: string | null;
  media_type: string;
  render_request?: unknown;
  created_at: string;
  published_at: string | null;
}

interface CustomContent {
  id: string;
  content_type: string;
  text: string;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  platforms: string[];
}

// Fallback used while rivers are loading from the API
const FALLBACK_RIVERS = [
  { slug: 'meramec', name: 'Meramec River' },
  { slug: 'current', name: 'Current River' },
  { slug: 'eleven-point', name: 'Eleven Point River' },
  { slug: 'jacks-fork', name: 'Jacks Fork River' },
  { slug: 'niangua', name: 'Niangua River' },
  { slug: 'big-piney', name: 'Big Piney River' },
  { slug: 'huzzah', name: 'Huzzah Creek' },
  { slug: 'courtois', name: 'Courtois Creek' },
];

function deliveryStamp(at?: string | null) {
  return at ? new Date(at).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT' : '';
}

function postTypeLabel(post: SocialPost) {
  if (isDamStory(post.render_request)) return post.render_request.inputProps?.snapshot?.dam?.name ?? 'Dam update';
  return POST_TYPE_LABELS[post.post_type] ?? post.post_type;
}

function postDestination(post: SocialPost) {
  if (isDamStory(post.render_request) && post.platform === 'instagram') return 'Instagram Story';
  if (post.media_type === 'video') return destinationLabel(post.platform, renderPlacement(post.render_request));
  return post.platform === 'instagram' ? 'Instagram' : post.platform === 'facebook' ? 'Facebook' : 'TikTok';
}

const ALL_CONDITIONS = [
  { code: 'flowing', label: 'Flowing', color: 'bg-emerald-500' },
  { code: 'good', label: 'Good', color: 'bg-lime-500' },
  { code: 'low', label: 'Low', color: 'bg-yellow-500' },
  { code: 'too_low', label: 'Too Low', color: 'bg-gray-500' },
  { code: 'high', label: 'High', color: 'bg-orange-500' },
  { code: 'dangerous', label: 'Dangerous/Flood', color: 'bg-red-500' },
];

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  review: { label: 'Ready for review', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  inbox: { label: 'Sent to TikTok inbox', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  published: { label: 'Published', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  failed: { label: 'Failed', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  unknown: { label: 'Outcome unknown', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  pending: { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  publishing: { label: 'Publishing', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  rendering: { label: 'Rendering', className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  skipped: { label: 'Skipped', className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

// Display names for post_type values — aligned with the post formats we ship.
// eddy_says / favorite_float / route_draw are retired types kept only so
// historical rows in the post table still render a label.
const POST_TYPE_LABELS: Record<string, string> = {
  daily_digest: 'Daily Report',
  river_highlight: 'Eddy’s Read',
  eddy_says: 'Eddy Says (legacy)',
  weekly_forecast: 'Weekend Forecast',
  section_guide: 'Float Pick',
  favorite_float: 'Favorite Float (legacy)',
  weekly_trend: 'Weekly Trend (retired)',
  route_draw: 'Float of the Day (legacy)',
  condition_change: 'Alert',
  condition_easing: 'Easing',
  condition_recovery: 'All Clear',
  storm_digest: 'Storm Digest',
  manual: 'Custom post',
};

export default function SocialAdminPage() {
  const {identity}=useAdminAuth();
  const isOwner = identity?.role === 'owner';
  const [activeTab, setActiveTab] = useState<Tab>('planner');
  const [config, setConfig] = useState<SocialConfig | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [customContent, setCustomContent] = useState<CustomContent[]>([]);
  const [rivers, setRivers] = useState<{ slug: string; name: string }[]>(FALLBACK_RIVERS);
  const [loading, setLoading] = useState(true);
  const [addingSnippet, setAddingSnippet] = useState(false);
  const [readyCount, setReadyCount] = useState(0);
  const [preferences, setPreferences] = useState<Partial<Pick<SocialConfig, 'disabled_rivers' | 'highlight_conditions' | 'video_features'>>>({});
  const prefs = config ? { ...config, ...preferences } : null;
  const [saving, setSaving] = useState(false);
  const [offset, setOffset] = useState(0);
  const [postTotal, setPostTotal] = useState(0);
  const [postLoading, setPostLoading] = useState(false);
  const [postError, setPostError] = useState('');
  const postRequest = useRef(0);
  const [postFilter, setPostFilter] = useState<{ platform: string; status: string }>({
    platform: '',
    status: '',
  });

  // Video pipeline health — surfaces silent fallbacks (image instead of
  // video) and PAT/scope failures before they pile up.
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [preflightResult, setPreflightResult] = useState<PreflightOutcome | null>(null);
  const [preflightChecking, setPreflightChecking] = useState(false);

  // New content form state
  const [newContent, setNewContent] = useState({
    content_type: 'tip',
    text: '',
    start_date: '',
    end_date: '',
    platforms: ['instagram', 'facebook'] as string[],
  });

  // Compose post state

  const [composeForm, setComposeForm] = useState({
    caption: '',
    imageUrl: '',
    platforms: ['facebook', 'instagram'] as string[],
  });
  const [publishing, setPublishing] = useState(false);
  // Publish Now posts publicly at once, so it takes a second, explicit click.
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  // What each platform actually did with the last publish. Kept on screen
  // (not a 4-second toast) until the operator acts on it.
  const [publishOutcome, setPublishOutcome] = useState<{
    sent: string[];
    notSent: Array<{ platform: string; error: string }>;
    requestError?: string;
  } | null>(null);
  const [savingPostingSwitch, setSavingPostingSwitch] = useState(false);

  // Quick post state
  const [quickPostType, setQuickPostType] = useState<ComposerKind>('digest');
  const [repeat, setRepeat] = useState(false);
  const [initialDay, setInitialDay] = useState<Weekday>();
  const [editing, setEditing] = useState<PlanRule>();
  const format = quickPostType in formatFor ? formatFor[quickPostType as keyof typeof formatFor] : undefined;
  const [quickPostContentId, setQuickPostContentId] = useState('');
  const [quickPostPlatforms, setQuickPostPlatforms] = useState<string[]>(['facebook', 'instagram']);
  const [quickPlacements, setQuickPlacements] = useState<PlacementChoices>();
  const [quickPosting, setQuickPosting] = useState(false);

  // Preview modal state
  const [showPreview, setShowPreview] = useState(false);
  const previewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = previewDialog.current;
    if (!showPreview || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [showPreview]);
  const [previewOverlay, setPreviewOverlay] = useState<'off' | 'safe'>('off');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [scheduleLater, setScheduleLater] = useState(false);
  const [sendTime, setSendTime] = useState('');
  const [earliestSend, setEarliestSend] = useState('');
  const [upcoming, setUpcoming] = useState<SocialPost[]>([]);
  const [upcomingError, setUpcomingError] = useState(false);
  const [staleRelease, setStaleRelease] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const videoPreviewPost = posts.find(post => post.id === reviewId);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const reviewOpen = Boolean(videoPreviewPost);
  useEffect(() => {
    const dialog = reviewDialog.current;
    if (!reviewOpen || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [reviewOpen]);
  const damPreview = isDamStory(videoPreviewPost?.render_request) ? videoPreviewPost.render_request : null;
  const measuredRelease = isMeasuredReleaseVideo(damPreview);
  const canScheduleReview = videoPreviewPost?.status === 'review' && !measuredRelease;
  const storyPreview = (damPreview && videoPreviewPost?.platform === 'instagram') || isStoryRender(videoPreviewPost?.render_request);
  const previewSafe = videoSafeInsets(videoPreviewPost?.platform, storyPreview ? 'story' : 'reel');

  // TikTok connection status
  const [tiktokStatus, setTiktokStatus] = useState<{
    configured: boolean;
    connected: boolean;
    openId: string | null;
    accessTokenExpiresAt: string | null;
    refreshTokenExpiresAt: string | null;
    scope: string | null;
    redirectUri?: string;
    directPost?: boolean;
  } | null>(null);
  const [tiktokBusy, setTiktokBusy] = useState(false);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchConfig = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/social/config?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          setConfig(data);
        } else {
          console.error('Config response was empty or invalid:', data);
          showToast('Settings loaded but appear empty — check server logs', 'error');
        }
      } else {
        console.error('Failed to fetch config:', res.status);
        showToast(`Failed to load settings (${res.status})`, 'error');
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
      showToast('Could not connect to server', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPosts = useCallback(async () => {
    if (activeTab !== 'queue' && activeTab !== 'history') return;
    const serial = ++postRequest.current;
    setPostLoading(true); setPostError('');
    try {
      const params = new URLSearchParams({ limit: '50', offset: String(offset), view: activeTab });
      if (postFilter.platform) params.set('platform', postFilter.platform);
      if (postFilter.status) params.set('status', postFilter.status);
      const response = await adminFetch(`/api/admin/social/posts?${params}`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (serial !== postRequest.current) return;
      if (offset && !data.posts.length && offset >= data.total) { setOffset(Math.max(0, offset - 50)); return; }
      setPosts(data.posts); setPostTotal(data.total);
    } catch {
      if (serial === postRequest.current) setPostError('Could not load posts. Refresh to try again.');
    } finally { if (serial === postRequest.current) setPostLoading(false); }
  }, [activeTab, offset, postFilter]);

  function navigate(tab: Tab) {
    setReviewId(null); ++postRequest.current; setPosts([]); setPostTotal(0); setPostError('');
    setOffset(0); setPostFilter({ platform: '', status: '' }); setActiveTab(tab);
    if (window.location.hash !== '#' + tab) window.history.pushState(null, '', '#' + tab);
    window.scrollTo(0, 0);
  }

  function openComposer(recurring = false, rule?: PlanRule, day?: Weekday) {
    setInitialDay(day);
    const kind = rule ? (Object.keys(formatFor) as (keyof typeof formatFor)[]).find(k => formatFor[k] === rule.format)! : recurring ? 'section_guide' : 'digest';
    setQuickPostType(kind); setEditing(recurring ? rule : undefined); setRepeat(recurring); setQuickPlacements(undefined);
    setQuickPostPlatforms(['instagram', 'facebook']); setConfirmingPublish(false);
    if (rule && !recurring) setDraftDelivery(rule.delivery);
    navigate('create');
  }

  useEffect(() => {
    function readHash() {
      const key = window.location.hash.slice(1);
      if (key === 'create' || screens.some(tab => tab.key === key)) {
        setActiveTab(key as Tab); setOffset(0); setPostFilter({ platform: '', status: '' });
      } else if (!key) setActiveTab('planner');
    }
    readHash();
    window.addEventListener('popstate', readHash);
    window.addEventListener('hashchange', readHash);
    return () => {
      window.removeEventListener('popstate', readHash);
      window.removeEventListener('hashchange', readHash);
    };
  }, []);

  const fetchReadyCount = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/social/posts?status=review&limit=1');
      if (res.ok) { const data = await res.json(); setReadyCount(data.total ?? 0); }
    } catch { /* The queue remains accessible if the count is unavailable. */ }
  }, []);

  const fetchUpcoming = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/social/posts?view=scheduled&limit=12');
      if (!res.ok) throw new Error();
      setUpcoming((await res.json()).posts); setUpcomingError(false);
    } catch { setUpcomingError(true); }
  }, []);
  useEffect(() => { if (activeTab === 'planner') void fetchUpcoming(); }, [activeTab, fetchUpcoming]);

  const fetchContent = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/social/content?_t=${Date.now()}`);
      if (res.ok) {
        setCustomContent(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch content:', err);
    }
  }, []);

  const fetchRivers = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/rivers');
      if (res.ok) {
        const data = await res.json();
        if (data.rivers && data.rivers.length > 0) {
          setRivers(data.rivers.map((r: { slug: string; name: string }) => ({ slug: r.slug, name: r.name })));
        }
      }
    } catch {
      // Keep fallback rivers on error
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/social/health?_t=${Date.now()}`);
      if (res.ok) {
        setHealth(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch health:', err);
    }
  }, []);

  const fetchTikTokStatus = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/social/tiktok/status?_t=${Date.now()}`);
      if (res.ok) setTiktokStatus(await res.json());
    } catch (err) {
      console.error('Failed to fetch TikTok status:', err);
    }
  }, []);

  const connectTikTok = async () => {
    setTiktokBusy(true);
    try {
      const res = await adminFetch('/api/admin/social/tiktok/connect');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url; // hand off to TikTok's authorize page
      } else {
        showToast(data.error || 'Could not start TikTok connect', 'error');
        setTiktokBusy(false);
      }
    } catch {
      showToast('Could not start TikTok connect', 'error');
      setTiktokBusy(false);
    }
  };

  const disconnectTikTok = async () => {
    setTiktokBusy(true);
    try {
      const res = await adminFetch('/api/admin/social/tiktok/status', { method: 'DELETE' });
      if (res.ok) {
        showToast('TikTok disconnected', 'success');
        fetchTikTokStatus();
      } else {
        showToast('Failed to disconnect TikTok', 'error');
      }
    } catch {
      showToast('Failed to disconnect TikTok', 'error');
    } finally {
      setTiktokBusy(false);
    }
  };

  const runPreflight = useCallback(async () => {
    setPreflightChecking(true);
    try {
      const res = await adminFetch(`/api/admin/social/preflight?_t=${Date.now()}`);
      const body = await res.json();
      setPreflightResult({ ok: res.ok, status: res.status, body });
    } catch (err) {
      setPreflightResult({
        ok: false,
        status: 0,
        body: { reason: err instanceof Error ? err.message : 'Network error' },
      });
    } finally {
      setPreflightChecking(false);
    }
  }, []);

  // Initial load — run once on mount
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchConfig(), fetchContent(), fetchRivers(), fetchHealth(), fetchReadyCount()]).finally(() =>
      setLoading(false)
    );
    fetchTikTokStatus();
    // Surface the TikTok OAuth round-trip result (set by the callback redirect).
    const p = new URLSearchParams(window.location.search);
    const tk = p.get('tiktok');
    if (tk === 'connected') showToast('TikTok connected', 'success');
    else if (tk === 'error') showToast(`TikTok connect failed: ${p.get('reason') || 'unknown'}`, 'error');
    if (tk) window.history.replaceState({}, '', window.location.pathname + '#settings');
    if (tk) setActiveTab('settings');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch posts when filter changes (don't re-fetch config — would overwrite unsaved edits)
  useEffect(() => {
    void fetchPosts();
    if (activeTab !== 'queue') return;
    const timer = window.setInterval(() => { if (!document.hidden) { void fetchPosts(); void fetchReadyCount(); } }, 15000);
    return () => window.clearInterval(timer);
  }, [activeTab, fetchPosts, fetchReadyCount]);

  const saveConfig = async () => {
    if (!config || !prefs) return;
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/social/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_preferences', version: config.updated_at, disabled_rivers: prefs.disabled_rivers,
          highlight_conditions: prefs.highlight_conditions, video_features: { condition_alerts_as_video: prefs.video_features?.condition_alerts_as_video ?? false } }) });
      const data = await res.json();
      if (res.status === 409) {
        setPreferences({}); await fetchConfig(); showToast('Settings changed in another session. Review the latest settings and make your change again.', 'error'); return;
      }
      if (!res.ok) throw new Error(data.error || 'Could not save settings.');
      setConfig(data); setPreferences({}); showToast('Settings saved', 'success');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Could not save settings.', 'error'); }
    finally { setSaving(false); }
  };

  const retryPost = async (
    postId: string,
    action: 'retry' | 'approve' | 'render' | 'resolve' | 'schedule' | 'unschedule' | 'regenerate' = 'retry',
    outcome?: 'published' | 'failed',
  ) => {
    if (sendingId) return;
    setSendingId(postId);
    setReviewError('');
    try {
      const res = await adminFetch('/api/admin/social/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId, action, outcome,
          ...(damPreview && videoPreviewPost?.id === postId && { expectedAttempt: damPreview.attemptId ?? null }),
          time: action === 'schedule' ? sendTime : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'stale_release' || data.code === 'stale_dam') setStaleRelease(true);
        throw new Error(data.error || 'Could not confirm delivery. Check the queue.');
      }
      reviewDialog.current?.close();
      setReviewId(null); setScheduleLater(false); setSendTime('');
      const receipt = data.delivery === 'inbox' ? 'Sent to the TikTok inbox' : 'Published';
      showToast(
        action === 'schedule' ? 'Post scheduled' : action === 'unschedule' ? 'Returned to review' :
        action === 'render' || action === 'regenerate' ? 'Rendering a new draft for review'
          : action === 'resolve' ? (outcome === 'published' ? 'Marked as published' : 'Marked as not published')
          : receipt,
        'success',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not confirm delivery. Check the queue.';
      setReviewError(message);
      showToast(message, 'error');
    } finally {
      await Promise.all([fetchPosts(), fetchReadyCount()]);
      setSendingId(null);
    }
  };

  const addContent = async () => {
    if (!newContent.text.trim()) return;
    try {
      const res = await adminFetch('/api/admin/social/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_type: newContent.content_type,
          text: newContent.text,
          start_date: newContent.start_date || null,
          end_date: newContent.end_date || null,
          platforms: newContent.platforms,
        }),
      });
      if (res.ok) {
        setAddingSnippet(false);
        setNewContent({ content_type: 'tip', text: '', start_date: '', end_date: '', platforms: ['instagram', 'facebook'] });
        fetchContent();
        showToast('Content snippet added', 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || `Failed to add content (${res.status})`, 'error');
      }
    } catch (err) {
      console.error('Failed to add content:', err);
      showToast('Network error — could not add content', 'error');
    }
  };

  const toggleContentActive = async (item: CustomContent) => {
    try {
      const res = await adminFetch(`/api/admin/social/content/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, active: !item.active }),
      });
      if (res.ok) {
        fetchContent();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || `Toggle failed (${res.status})`, 'error');
      }
    } catch (err) {
      console.error('Failed to toggle content:', err);
      showToast('Network error — could not update', 'error');
    }
  };

  const deleteContent = async (id: string) => {
    try {
      const res = await adminFetch(`/api/admin/social/content/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchContent();
        showToast('Content deleted', 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || `Delete failed (${res.status})`, 'error');
      }
    } catch (err) {
      console.error('Failed to delete content:', err);
      showToast('Network error — could not delete', 'error');
    }
  };

  const publishManualPost = async (draft = false) => {
    if (!composeForm.caption.trim()) return;
    setPublishing(true);
    setConfirmingPublish(false);
    setPublishOutcome(null);
    try {
      const res = await adminFetch('/api/admin/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: draft ? 'draft' : 'publish',
          caption: composeForm.caption,
          imageUrl: composeForm.imageUrl || undefined,
          platforms: composeForm.platforms,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.results)) {
        // Nothing is known to have been sent; keep the draft exactly as typed.
        setPublishOutcome({ sent: [], notSent: [], requestError: data?.error || `Publish failed (${res.status})` });
        return;
      }

      // The route reports one { platform, success, error } per platform.
      const results = data.results as Array<{ platform: string; success: boolean; error?: string }>;
      const sent = results.filter((r) => r.success).map((r) => r.platform);
      const notSent = results
        .filter((r) => !r.success)
        .map((r) => ({ platform: r.platform, error: r.error || 'No reason given' }));
      fetchPosts();

      if (notSent.length === 0) {
        showToast(draft ? 'Draft saved for review' : `Published to ${sent.join(' and ')}`, 'success');
        navigate(draft ? 'queue' : 'history');
        setComposeForm({ caption: '', imageUrl: '', platforms: ['facebook', 'instagram'] });
        return;
      }

      // Something did not go out: keep the draft, and leave only the platforms
      // that still need it selected so a retry cannot re-send the ones that worked.
      setPublishOutcome({ sent, notSent });
      setComposeForm((form) => ({ ...form, platforms: notSent.map((r) => r.platform) }));
    } catch {
      setPublishOutcome({
        sent: [],
        notSent: [],
        requestError: 'Network error — the outcome is not known. Check the queue or history before trying again.',
      });
    } finally {
      setPublishing(false);
    }
  };

  // The posting switch saves the moment it is flipped, and shows the value the
  // server stored. Other unsaved settings on the page are left untouched.
  const togglePosting = async () => {
    if (!config || savingPostingSwitch) return;
    const wanted = !config.posting_enabled;
    setSavingPostingSwitch(true);
    try {
      const res = await adminFetch('/api/admin/social/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posting_enabled: wanted }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.posting_enabled !== 'boolean') {
        showToast(data?.error || `Could not ${wanted ? 'resume' : 'pause'} posting (${res.status}) — nothing changed`, 'error');
        return;
      }
      setConfig((current) => (current ? { ...current, posting_enabled: data.posting_enabled, updated_at: data.updated_at } : current));
      showToast(data.posting_enabled ? 'Automatic posting resumed' : 'Automatic posting paused', 'success');
    } catch {
      showToast(`Network error — posting is still ${config.posting_enabled ? 'active' : 'paused'}`, 'error');
    } finally {
      setSavingPostingSwitch(false);
    }
  };

  // TikTok draft (inbox) mode can't receive a caption via the API, so the reel
  // lands blank and you write the caption in-app. This copies the caption Eddy
  // already generated for the post so you can paste it when finishing the draft.
  // (Direct-post mode, once audited, sends the caption automatically instead.)
  const copyCaption = async (post: SocialPost) => {
    try {
      await navigator.clipboard.writeText(post.caption || '');
      showToast('Caption copied — paste it when you finish the TikTok draft', 'success');
    } catch {
      showToast('Could not copy caption', 'error');
    }
  };

  const publishQuickPost = async () => {
    if (quickPostType === 'tip' && !quickPostContentId) return;
    if (quickPostPlatforms.length === 0) return;

    setQuickPosting(true);
    try {
      const res = await adminFetch('/api/admin/social/quick-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: quickPostType,
          contentId: quickPostType === 'tip' ? quickPostContentId : undefined,
          ...(quickPostType === 'section_guide' && { placements: quickPlacements ?? config?.section_guide?.placements }),
          platforms: quickPostPlatforms.filter(p => p !== 'tiktok' || draftDelivery.tiktok),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rendering) {
          showToast(data.warnings?.length ? `Preparing ${data.rendering} drafts. Check the queue for failed renders.`
            : `Preparing ${data.rendering} draft(s) for review`, data.warnings?.length ? 'error' : 'success');
        } else {
          const successes = data.results?.filter((r: { status: string }) => r.status === 'review').length || 0;
          const failures = data.results?.filter((r: { status: string }) => r.status === 'failed') || [];
          if (failures.length) {
            const detail = failures.map((f: { platform: string; error?: string }) => `${f.platform}: ${f.error}`).join('. ');
            showToast(`${successes} drafts ready. ${detail}`, 'error');
            if (!successes) return;
          } else {
            showToast(`${successes} ${successes === 1 ? 'draft' : 'drafts'} ready for review`, 'success');
          }
        }
        navigate('queue');
        void fetchReadyCount();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || `Quick post failed (${res.status})`, 'error');
      }
    } catch (err) {
      console.error('Failed to quick post:', err);
      showToast('Network error — could not publish', 'error');
    } finally {
      setQuickPosting(false);
    }
  };

  const loadPreview = async (fullDay = false) => {
    setPreviewLoading(true);
    setShowPreview(true);
    try {
      const res = await adminFetch(`/api/admin/social/preview?skip_time_check=${fullDay}&_t=${Date.now()}`);
      if (res.ok) {
        setPreviewData(await res.json());
      } else {
        showToast('Failed to load preview', 'error');
        setShowPreview(false);
      }
    } catch (err) {
      console.error('Failed to load preview:', err);
      showToast('Network error — could not load preview', 'error');
      setShowPreview(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const chosen = quickPlacements ?? config?.section_guide?.placements;
  const draftDelivery: Delivery = { time: '', instagram: quickPostPlatforms.includes('instagram') ? (quickPostType === 'section_guide' ? chosen?.instagram ?? 'regular' : 'regular') : 'off',
    facebook: quickPostPlatforms.includes('facebook') ? (quickPostType === 'section_guide' ? chosen?.facebook ?? 'regular' : 'regular') : 'off',
    tiktok: quickPostPlatforms.includes('tiktok') && Boolean(tiktokStatus?.connected) && quickPostType !== 'tip' && quickPostType !== 'digest' };
  function setDraftDelivery(value: Delivery) {
    setQuickPostPlatforms([...(value.instagram !== 'off' ? ['instagram'] : []), ...(value.facebook !== 'off' ? ['facebook'] : []), ...(value.tiktok ? ['tiktok'] : [])]);
    setQuickPlacements({ instagram: value.instagram === 'off' ? undefined : value.instagram, facebook: value.facebook === 'off' ? undefined : value.facebook });
  }

  return (
    <AdminLayout
      title="Social publishing" hideHeader
    >
      {/* Toast notification */}
      {toast && (
        <div role="status" className={studio.toast} data-feedback={toast.type}>
          {toast.message}
        </div>
      )}
      {/* Preview Modal */}
      {showPreview && (
        <dialog ref={previewDialog} aria-label="Schedule preview" onClose={e => { if (!e.currentTarget.open) setShowPreview(false); }} className={studio.preview}>
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl w-full max-w-3xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-neutral-700">
              <h3 className="text-lg font-semibold text-white">Today’s recurring posts</h3>
              <button aria-label="Close schedule preview" onClick={() => previewDialog.current?.close()} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex gap-3"><button onClick={() => loadPreview(false)} className="text-sm text-primary-400">Due now</button><button onClick={() => loadPreview(true)} className="text-sm text-primary-400">Today’s schedule</button></div>
              <p className="text-xs text-neutral-400">Schedule preview uses current data. Inspect the rendered draft before publishing manually.</p>
              {previewLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-neutral-400" />
                </div>
              ) : previewData ? (
                <>
                  {previewData.posts.length === 0 ? (
                    <p className="text-neutral-400 text-sm">No recurring posts are due today.</p>
                  ) : (
                    previewData.posts.map((post, i) => (
                      <div key={i} className="bg-neutral-700/50 rounded-lg p-4 border border-neutral-600">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary-500/20 text-primary-400 uppercase">
                            {destinationLabel(post.platform, post.placement)}
                          </span>
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-neutral-700 text-neutral-300 uppercase">
                            {post.postType === 'daily_digest' ? 'Daily Report' : POST_TYPE_LABELS[post.postType] ?? post.postType}
                          </span>
                          {post.postType === 'daily_digest' && <span className="text-xs text-primary-300">Carousel</span>}
                          {post.mediaType === 'video' && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                              Video
                            </span>
                          )}
                          {post.riverSlug && (
                            <span className="text-xs text-neutral-400">{post.riverSlug}</span>
                          )}
                        </div>
                        {post.placement !== 'story' && post.imageUrl && <details className="mb-3 text-sm text-neutral-300"><summary className="cursor-pointer">Inspect cover</summary>{/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={post.imageUrl} alt="Scheduled post cover" className="mt-2 max-h-96 object-contain" /></details>}
                        {post.placement !== 'story' && <p className="text-sm text-neutral-200 whitespace-pre-line break-words">{post.caption}</p>}
                        {post.postType === 'daily_digest' && <p className="mt-2 text-xs text-neutral-400">Generate a draft to review every widget slide.</p>}
                      </div>
                    ))
                  )}
                  {/* Diagnostics */}
                  <div className="bg-neutral-900/50 rounded-lg p-4 border border-neutral-700">
                    <h4 className="text-sm font-semibold text-neutral-300 mb-2">Diagnostics</h4>
                    <div className="text-xs text-neutral-400 space-y-1">
                      <p>Posting enabled: {previewData.diagnostics.posting_enabled ? 'Yes' : 'No'}</p>
                      <p>Digest enabled: {previewData.diagnostics.digest_enabled ? 'Yes' : 'No'}</p>
                      <p>Rivers: {previewData.diagnostics.rivers.join(', ') || 'none'}</p>
                      <p>Eligible: {previewData.diagnostics.eligible_rivers.join(', ') || 'none'}</p>
                      <p>Due now: {previewData.diagnostics.due_rivers?.join(', ') || 'none'}</p>
                      {previewData.diagnostics.skipped_reasons.length > 0 && (
                        <p>Skipped: {previewData.diagnostics.skipped_reasons.join(', ')}</p>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </dialog>
      )}

      {/* Video Preview Modal */}
      {videoPreviewPost && (
        <dialog ref={reviewDialog} aria-labelledby="social-review-title"
          onClose={event => { if (!event.currentTarget.open) setReviewId(null); }}
          className={`${styles.dialog} bg-neutral-800 border border-neutral-700 rounded-xl`}>
          <div className={styles.reviewFrame}>
            <div className="flex items-center justify-between gap-2 p-4 border-b border-neutral-700">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="social-review-title" className="text-lg font-semibold text-white">Review Post</h3>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary-500/20 text-primary-400 uppercase">
                  {destinationLabel(videoPreviewPost.platform, storyPreview ? 'story' : renderPlacement(videoPreviewPost.render_request))}
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-neutral-700 text-neutral-300 uppercase">
                  {damPreview ? damPreview.inputProps?.snapshot?.dam?.name ?? 'Dam update' : POST_TYPE_LABELS[videoPreviewPost.post_type] ?? videoPreviewPost.post_type}
                </span>
              </div>
              <button aria-label="Close review" onClick={() => reviewDialog.current?.close()} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className={`${styles.reviewBody} ${damPreview || storyPreview ? styles.verticalReview : 'p-4'}`}>
              {/* The cover beside the video: on Instagram the OG image IS the
                  Reel's grid thumbnail, so drift between the two shows up here
                  before it shows up in the feed. */}
              {reportImageUrls(videoPreviewPost.render_request) ? <CarouselPreview key={videoPreviewPost.id} urls={reportImageUrls(videoPreviewPost.render_request)!} /> : isDailyReport(videoPreviewPost.render_request) ? <p className="text-neutral-300">The carousel is still being prepared. All slides will appear here when rendering finishes.</p> : <div className={`grid gap-4 ${damPreview || storyPreview ? styles.verticalPlayer : videoPreviewPost.image_url || videoPreviewPost.video_url ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {videoPreviewPost.video_url && <div>
                  <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-1">{storyPreview ? 'Story preview' : 'Video'}</p>
                  <div className="relative bg-black rounded-lg overflow-hidden aspect-[9/16]">
                    <video
                      src={videoPreviewPost.video_url}
                      controls
                      playsInline
                      className="w-full h-full object-contain"
                    />
                    {previewOverlay !== 'off' && <div aria-hidden="true" className="absolute pointer-events-none border-2 border-dashed border-yellow-400" style={{ top: `${previewSafe.top / 1920 * 100}%`, bottom: `${previewSafe.bottom / 1920 * 100}%`, left: `${previewSafe.left / 1080 * 100}%`, right: `${previewSafe.right / 1080 * 100}%` }} />}
                  </div>
                  <label className="block mt-2 text-xs text-neutral-300">Preview guide <select value={previewOverlay} onChange={e => setPreviewOverlay(e.target.value as 'off' | 'safe')} className="bg-neutral-700 rounded p-1"><option value="off">Off</option><option value="safe">Text safe area</option></select></label>
                  <p className="mt-1 text-xs text-neutral-400">Guides are approximate; platform controls and crops vary.</p>
                </div>}
                {!damPreview && !storyPreview && <CoverPreview
                  key={videoPreviewPost.id}
                  src={videoPreviewPost.image_url}
                  platform={videoPreviewPost.platform}
                  videoUrl={videoPreviewPost.video_url}
                  directPost={tiktokStatus?.directPost}
                  gridNeighbors={posts
                    .filter(p => p.platform === 'instagram' && !isStoryRender(p.render_request) && !isDamStory(p.render_request) && p.id !== videoPreviewPost.id && p.status !== 'failed' && p.image_url && p.created_at < videoPreviewPost.created_at)
                    .sort((a, b) => b.created_at.localeCompare(a.created_at))
                    .map(p => p.image_url as string)}
                />}
              </div>
              }
              <div className="min-w-0">
                {storyPreview && !damPreview
                  ? <p className="text-sm text-neutral-300">Music · Ed-dy Dot Guide</p>
                  : <p className="text-sm text-neutral-200 whitespace-pre-wrap break-words">{videoPreviewPost.caption}</p>}
                {videoPreviewPost.platform === 'tiktok' && tiktokStatus?.directPost === false && (
                  <p className="mt-3 text-sm text-neutral-400">Finish posting from the TikTok inbox.</p>
                )}
                <p className="text-xs text-neutral-500 mt-2">
                  {new Date(videoPreviewPost.created_at).toLocaleString()} {videoPreviewPost.river_slug ? `\u2022 ${videoPreviewPost.river_slug}` : ''}
                </p>
              </div>
            </div>
            {((damPreview && isOwner && (videoPreviewPost.video_url || videoPreviewPost.status === 'failed')) || (!damPreview && videoPreviewPost.status === 'review')) && (
              <footer className={styles.reviewActions}>
                {reviewError && <p role="alert" className="w-full text-sm text-red-400">{reviewError}</p>}
                {canScheduleReview && scheduleLater && <label className={studio.field}>Send at (Central)
                  <input type="datetime-local" step="1800" min={earliestSend} max={damPreview?.inputProps?.snapshot ? damPreview.inputProps.snapshot.scheduleDate + 'T23:30' : undefined} value={sendTime} onChange={e => setSendTime(e.target.value)}/>
                  <small>{config?.posting_enabled === false ? 'Automatic posting is paused. Scheduled posts wait until it resumes.' : 'Choose an hour or half hour.'}</small>
                </label>}
                {measuredRelease && videoPreviewPost.status === 'review' && !reviewError && <p className={studio.note}>Send now · Ameren updates the reading hourly.</p>}
                {damPreview && videoPreviewPost.video_url && <DamVideoDownload id={videoPreviewPost.id} />}
                {canScheduleReview && <button className="admin-secondary" disabled={Boolean(sendingId)} onClick={() => { setEarliestSend(nextHalfHourInput('America/Chicago')); setScheduleLater(!scheduleLater); }}>{scheduleLater ? 'Back to send now' : 'Schedule for later'}</button>}
                {damPreview && (staleRelease || (videoPreviewPost.status === 'failed' && !videoPreviewPost.video_url)) ?
                  <button className="admin-primary" disabled={Boolean(sendingId)} onClick={() => retryPost(videoPreviewPost.id, 'regenerate')}>Regenerate draft</button>
                : scheduleLater && canScheduleReview ? <button className="admin-primary" disabled={!sendTime || Boolean(sendingId)}
                  onClick={() => retryPost(videoPreviewPost.id, 'schedule')}>Approve &amp; schedule</button> : ['review', 'failed'].includes(videoPreviewPost.status) && (
                  <button className="admin-primary" disabled={sendingId !== null}
                    onClick={() => retryPost(videoPreviewPost.id, videoPreviewPost.status === 'failed' ? 'retry' : 'approve')}>
                    {sendingId === videoPreviewPost.id ? 'Sending…' : 'Approve & send'}
                  </button>
                )}
              </footer>
            )}
          </div>
        </dialog>
      )}

      <div className={studio.workspace}>
        <header className={studio.mast}><h1>Social publishing</h1>
          {activeTab !== 'create' && <button className="admin-primary" onClick={() => openComposer()}><Plus size={17}/> Create post</button>}
        </header>
        <nav className={studio.nav} aria-label="Social publishing">
          {screens.map(({ key, label, icon: Icon }) => <button key={key} aria-current={activeTab === key ? 'page' : undefined} onClick={() => navigate(key)}><Icon size={16}/>{label}{key === 'queue' && readyCount > 0 && <span className={studio.count} aria-label={readyCount + ' ready for review'}>{readyCount}</span>}</button>)}
        </nav>
        {activeTab === 'planner' && (config ? <PublishingPlanner config={config} draft={rule => openComposer(false, rule)} edit={rule => openComposer(true, rule)} create={day => openComposer(true, undefined, day)}
          owner={isOwner} tiktokConnected={tiktokStatus?.connected} settings={() => navigate('settings')} preview={() => loadPreview(true)} /> : <p>{loading ? 'Loading schedule…' : <button className="admin-secondary" onClick={fetchConfig}>Reload schedule</button>}</p>)}

        {activeTab === 'planner' && (upcoming.length > 0 || upcomingError) && <section className={studio.upcoming} aria-label="Scheduled one-time posts">
          <div className={studio.sectionHead}><h2>Scheduled posts</h2><button className={studio.inline} onClick={() => navigate('queue')}>Open queue</button></div>
          {upcomingError ? <button className="admin-secondary" onClick={fetchUpcoming}>Reload scheduled posts</button> : upcoming.map(post => <div key={post.id} className={studio.upcomingRow}>
            <strong>{deliveryStamp(post.scheduled_at)}</strong><span>{postTypeLabel(post)} · {postDestination(post)}{post.status === 'rendering' ? ' · Rendering' : ''}</span>
          </div>)}
        </section>}

        {activeTab === 'create' && <section className={studio.editor} aria-label="Post editor">
          <div className={studio.formHead}><h2>{editing ? 'Edit schedule' : repeat ? 'New schedule' : 'Create post'}</h2>
            <label className={studio.field}>Post type<select aria-label="Post type" value={quickPostType} disabled={Boolean(editing) || quickPosting || publishing} onChange={e => {
              const kind = e.target.value as ComposerKind;
              setQuickPostType(kind); setQuickPostContentId(''); setConfirmingPublish(false); setQuickPlacements(undefined);
              if (!(kind in formatFor)) setRepeat(false);
            }}>
              <option value="digest">Daily Report</option><option value="highlight">Eddy’s Read</option>
              <option value="weekly_forecast">Weekend Forecast</option><option value="section_guide">Float Pick</option>
              {isOwner && <option value="dam">Dam generation</option>}<option value="tip">Tip or seasonal quote</option><option value="custom">Custom post</option>
            </select></label>
            {format && isOwner && !editing && <div className={studio.mode} role="group" aria-label="Posting frequency">
              <button aria-pressed={!repeat} onClick={() => setRepeat(false)}>One-time draft</button>
              <button aria-pressed={repeat} onClick={() => setRepeat(true)}>Recurring schedule</button>
            </div>}
          </div>
          {repeat && isOwner && format ? config && <RuleEditor key={format + (editing?.days.join() ?? '')} config={config} format={format} original={editing} initialDay={initialDay}
            cancel={() => navigate('planner')} reload={() => { void fetchConfig(); navigate('planner'); }}
            onSave={data => { setConfig(data as SocialConfig); showToast('Schedule saved', 'success'); navigate('planner'); }}/>
          : quickPostType === 'dam' && isOwner ? <DamScheduleExport onQueued={(message, partial) => { showToast(message, partial ? 'error' : 'success'); navigate('queue'); }}/>
          : quickPostType !== 'custom' ? <div className={studio.formBody}>
            {/* Content selector (for tips) */}
            {quickPostType === 'digest' && <p className={studio.note}>River and dam widgets in a swipeable carousel.</p>}
            {quickPostType === 'tip' && (
              <div>
                <label htmlFor="tip-snippet" className="block text-sm text-neutral-300 mb-1">Content snippet</label>
                <select
                  id="tip-snippet" value={quickPostContentId}
                  onChange={(e) => setQuickPostContentId(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                >
                  <option value="">Select content...</option>
                  {customContent.filter(c => c.active).map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.content_type}] {c.text.slice(0, 60)}{c.text.length > 60 ? '...' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <DestinationFields value={draftDelivery} onChange={setDraftDelivery} story={quickPostType === 'section_guide'} carousel={quickPostType === 'digest'}
              image={quickPostType === 'tip'} tiktok={Boolean(tiktokStatus?.connected) && quickPostType !== 'digest' && quickPostType !== 'tip'}/>
            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={publishQuickPost}
                disabled={
                  quickPosting ||
                  draftDelivery.instagram === 'off' && draftDelivery.facebook === 'off' && !draftDelivery.tiktok ||
                  (quickPostType === 'tip' && !quickPostContentId)
                }
                className="admin-primary inline-flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {quickPosting
                  ? 'Preparing…'
                  : 'Generate draft'}
              </button>
              <button
                onClick={() => navigate('planner')}
                className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div> : <div className={studio.formBody}>
            <div>
              <label htmlFor="custom-caption" className="block text-sm text-neutral-300 mb-1">Caption</label>
              <textarea
                id="custom-caption" value={composeForm.caption}
                onChange={(e) => setComposeForm({ ...composeForm, caption: e.target.value })}
                rows={4}
                placeholder="Write your post caption..."
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 resize-none"
              />
            </div>
            <div>
              <label htmlFor="custom-image" className="block text-sm text-neutral-300 mb-1">Image URL (optional)</label>
              <input
                type="url"
                id="custom-image" value={composeForm.imageUrl}
                onChange={(e) => setComposeForm({ ...composeForm, imageUrl: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500"
              />
              <p className="text-xs text-neutral-500 mt-1">Required for Instagram. Leave empty for text-only Facebook posts.</p>
            </div>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={composeForm.platforms.includes('facebook')}
                  onChange={(e) => {
                    const p = e.target.checked
                      ? [...composeForm.platforms, 'facebook']
                      : composeForm.platforms.filter((x) => x !== 'facebook');
                    setComposeForm({ ...composeForm, platforms: p });
                  }}
                  className="rounded bg-neutral-900 border-neutral-600"
                />
                Facebook
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={composeForm.platforms.includes('instagram')}
                  onChange={(e) => {
                    const p = e.target.checked
                      ? [...composeForm.platforms, 'instagram']
                      : composeForm.platforms.filter((x) => x !== 'instagram');
                    setComposeForm({ ...composeForm, platforms: p });
                  }}
                  className="rounded bg-neutral-900 border-neutral-600"
                />
                Instagram
              </label>
            </div>
            {publishOutcome && (
              <div role="alert" className="rounded-lg border border-red-700 bg-red-900/40 p-3 text-sm text-red-100 space-y-1">
                {publishOutcome.requestError && <p>{publishOutcome.requestError}</p>}
                {publishOutcome.sent.length > 0 && (
                  <p className="text-green-200">Published to {publishOutcome.sent.join(' and ')}.</p>
                )}
                {publishOutcome.notSent.map((r) => (
                  <p key={r.platform}>
                    <span className="font-semibold capitalize">{r.platform}</span> was not published: {r.error}
                  </p>
                ))}
                <p className="text-red-200/80">Your draft is kept below.</p>
              </div>
            )}
            {confirmingPublish ? (
              <div role="group" aria-label="Confirm publish" className="rounded-lg border border-amber-600 bg-amber-900/30 p-3 space-y-3">
                <p className="text-sm text-amber-100">
                  This posts publicly to {composeForm.platforms.join(' and ')} right now. It cannot be undone from here.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => publishManualPost()}
                    disabled={publishing}
                    className="admin-primary inline-flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Yes, publish
                  </button>
                  <button
                    onClick={() => setConfirmingPublish(false)}
                    className="px-4 py-2 text-neutral-300 hover:text-white transition-colors"
                  >
                    Back to editing
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button className="admin-primary" onClick={() => publishManualPost(true)}
                  disabled={publishing || !composeForm.caption.trim() || !composeForm.platforms.length || (composeForm.platforms.includes('instagram') && !composeForm.imageUrl.trim())}>Save draft</button>
                <button
                  onClick={() => setConfirmingPublish(true)}
                  disabled={publishing || !composeForm.caption.trim() || composeForm.platforms.length === 0 || (composeForm.platforms.includes('instagram') && !composeForm.imageUrl.trim())}
                  className="admin-secondary inline-flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {publishing ? 'Publishing...' : 'Publish Now'}
                </button>
                <button
                  onClick={() => {
                    navigate('history');
                    setConfirmingPublish(false);
                  }}
                  className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>}
        </section>}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        ) : (
          <>
            {/* Settings Tab */}
            {isOwner && activeTab === 'settings' && config && prefs && (
              <div className="space-y-6">
                <div className={studio.sectionHead}><h2>Publishing settings</h2></div>
                {/* Global toggle */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Automatic posting</h3>
                      <p className="text-sm text-neutral-400">Applies immediately to scheduled posts.</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={config.posting_enabled}
                      aria-label="Automatic social posting"
                      aria-busy={savingPostingSwitch}
                      disabled={savingPostingSwitch}
                      onClick={togglePosting}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-60 ${
                        config.posting_enabled ? 'bg-green-500' : 'bg-neutral-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                          config.posting_enabled ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className={`text-sm font-medium ${config.posting_enabled ? 'text-green-400' : 'text-red-400'}`}>
                    {savingPostingSwitch
                      ? 'Saving…'
                      : config.posting_enabled
                        ? 'Active — saved. Scheduled posts publish automatically.'
                        : 'Paused — saved. No scheduled or automatic posts will go out. Posts you publish by hand still do.'}
                  </div>
                </div>

                {config.meta_accounts && <section><h3 className="font-semibold">Publishing accounts</h3>
                  {(['instagram', 'facebook'] as const).map(account => <div key={account} className={studio.upcomingRow}>
                    <strong className="capitalize">{account}</strong><span>{config.meta_accounts?.[account] ? 'Credentials configured' : 'Credentials missing'}</span>
                  </div>)}
                </section>}
                {/* TikTok connection */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">TikTok</h3>
                      <p className="text-sm text-neutral-400">
                        {tiktokStatus?.directPost ? 'Videos publish to your profile.' : 'Finish publishing drafts from your TikTok inbox.'}
                      </p>
                    </div>
                    {tiktokStatus?.connected ? (
                      <button
                        onClick={disconnectTikTok}
                        disabled={tiktokBusy}
                        className="px-4 py-2 text-sm rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={connectTikTok}
                        disabled={tiktokBusy || !tiktokStatus?.configured}
                        className="px-4 py-2 text-sm rounded-lg bg-white/10 text-white border border-white/20 hover:bg-white/20 disabled:opacity-50"
                        title={tiktokStatus?.configured ? '' : 'Set TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET first'}
                      >
                        {tiktokBusy ? 'Connecting…' : 'Connect TikTok'}
                      </button>
                    )}
                  </div>
                  <div className="mt-3 text-sm">
                    {!tiktokStatus ? (
                      <span className="text-neutral-500">Checking…</span>
                    ) : !tiktokStatus.configured ? (
                      <span className="text-amber-400">App not configured — set TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET.</span>
                    ) : tiktokStatus.connected ? (
                      <span className="text-green-400">
                        Connected
                        {tiktokStatus.refreshTokenExpiresAt
                          ? ` · re-auth by ${new Date(tiktokStatus.refreshTokenExpiresAt).toLocaleDateString()}`
                          : ''}
                        {` · ${tiktokStatus.directPost ? 'direct post' : 'drafts'}`}
                      </span>
                    ) : (
                      <span className="text-neutral-400">Not connected.</span>
                    )}
                  </div>
                  {tiktokStatus?.configured && tiktokStatus?.redirectUri && (
                    <p className="mt-3 text-xs text-neutral-500 break-all">
                      Register this exact URL in TikTok → Login Kit → Redirect URI:{' '}
                      <code className="text-neutral-300 font-mono">{tiktokStatus.redirectUri}</code>
                    </p>
                  )}
                </div>

                {/* Video Features — opt-in reel variants */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2">Condition alerts</h3>
                  <label className="flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prefs.video_features?.condition_alerts_as_video ?? false}
                      onChange={(e) => {
                        setPreferences({
                          ...preferences,
                          video_features: {
                            ...(prefs.video_features || { condition_alerts_as_video: false }),
                            condition_alerts_as_video: e.target.checked,
                          },
                        });
                      }}
                      className="mt-1 rounded bg-neutral-900 border-neutral-600"
                    />
                    <div>
                      <div className="text-neutral-200 font-medium">
                        Condition-change alerts as Reels
                      </div>
                      <div className="text-sm text-neutral-400 mt-1">
                        When a river flips to high or dangerous, render a 12-second reel
                        with the current conditions. Leave off for image alerts.
                      </div>
                    </div>
                  </label>
                </div>

                <details className={studio.settingsGroup}><summary>Eddy’s Read sources and condition filters</summary>
                {/* River toggles */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2">River Selection</h3>
                  <p className="text-sm text-neutral-400 mb-4">
                    Select which rivers can appear in Eddy’s Read. Unchecked rivers will be excluded.
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {rivers.map((river) => {
                      const isDisabled = (prefs.disabled_rivers || []).includes(river.slug);
                      return (
                        <label
                          key={river.slug}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={!isDisabled}
                            onChange={(e) => {
                              const disabled = prefs.disabled_rivers || [];
                              if (e.target.checked) {
                                setPreferences({
                                  ...preferences,
                                  disabled_rivers: disabled.filter((s) => s !== river.slug),
                                });
                              } else {
                                setPreferences({
                                  ...preferences,
                                  disabled_rivers: [...disabled, river.slug],
                                });
                              }
                            }}
                            className="rounded bg-neutral-900 border-neutral-600"
                          />
                          <span className="text-neutral-200">{river.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Condition filters */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2">Condition Triggers</h3>
                  <p className="text-sm text-neutral-400 mb-4">
                    Include rivers in Eddy’s Read only when their current condition matches one of these:
                  </p>
                  <div className="grid gap-2 md:grid-cols-3">
                    {ALL_CONDITIONS.map((condition) => {
                      const isEnabled = (prefs.highlight_conditions || []).includes(condition.code);
                      return (
                        <label
                          key={condition.code}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={(e) => {
                              const conditions = prefs.highlight_conditions || [];
                              if (e.target.checked) {
                                setPreferences({
                                  ...preferences,
                                  highlight_conditions: [...conditions, condition.code],
                                });
                              } else {
                                setPreferences({
                                  ...preferences,
                                  highlight_conditions: conditions.filter((c) => c !== condition.code),
                                });
                              }
                            }}
                            className="rounded bg-neutral-900 border-neutral-600"
                          />
                          <span className={`w-3 h-3 rounded-full ${condition.color}`} />
                          <span className="text-neutral-200">{condition.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                </details>

                <button
                  onClick={saveConfig}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save settings'}
                </button>
              </div>
            )}

        {/* Video pipeline health */}
        {activeTab === 'settings' && health && (
          <details className={studio.settingsGroup}><summary>Video rendering and publisher checks</summary><div
            className={`mb-6 p-4 rounded-lg border ${
              health.videoPipelineHealthy
                ? 'bg-green-950/40 border-green-800 text-green-200'
                : 'bg-red-950/40 border-red-800 text-red-200'
            }`}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {health.videoPipelineHealthy ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  Video pipeline {health.videoPipelineHealthy ? 'healthy' : 'unhealthy'}
                </div>
                <div className="text-sm mt-1 opacity-80">
                  Last successful video:{' '}
                  {health.hoursSinceLastSuccessfulVideo === null
                    ? `none in the last ${health.windowDays}d`
                    : `${health.hoursSinceLastSuccessfulVideo}h ago`}
                </div>
                <div className="text-xs mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 opacity-80">
                  {health.byPlatform.map((p) => (
                    <div key={p.platform}>
                      <span className="font-medium capitalize">{p.platform}:</span>{' '}
                      {p.videoPublished} video / {p.imagePublished} image
                      {p.fallbackToImage > 0 && (
                        <span className="text-amber-300"> · {p.fallbackToImage} fallback</span>
                      )}
                      {p.failed > 0 && <span className="text-red-300"> · {p.failed} failed</span>}
                    </div>
                  ))}
                </div>
                {health.recentFallbackReasons.length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer opacity-80">
                      Recent error/fallback reasons ({health.recentFallbackReasons.length})
                    </summary>
                    <ul className="mt-1 space-y-1 ml-4 list-disc">
                      {health.recentFallbackReasons.slice(0, 5).map((r, i) => (
                        <li key={i}>
                          <span className="opacity-70">×{r.count}</span> {r.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <div className="flex flex-col gap-2 items-end">
                <button
                  onClick={runPreflight}
                  disabled={preflightChecking}
                  className="px-3 py-1.5 text-sm rounded bg-neutral-800 hover:bg-neutral-700 text-white disabled:opacity-50"
                >
                  {preflightChecking ? 'Checking…' : 'Run preflight'}
                </button>
                {preflightResult && (
                  <div
                    className={`text-xs max-w-xs text-right ${
                      preflightResult.ok ? 'text-green-300' : 'text-red-300'
                    }`}
                  >
                    {preflightResult.ok
                      ? `Preflight OK (${preflightResult.status})`
                      : `Preflight ${preflightResult.status}: ${preflightResult.body.reason ?? 'failed'}`}
                  </div>
                )}
              </div>
            </div>
          </div></details>
        )}

            {/* Custom Content Tab */}
            {activeTab === 'content' && (
              <div className="space-y-6">
                <div className={studio.sectionHead}><div><h2>Content library</h2><p>Reusable tips, seasonal notes, and captions.</p></div>
                  <button className="admin-secondary" onClick={() => setAddingSnippet(!addingSnippet)}>{addingSnippet ? 'Close editor' : 'Add snippet'}</button></div>
                {addingSnippet && <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Add Content Snippet</h3>
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label htmlFor="snippet-type" className="block text-sm text-neutral-300 mb-1">Type</label>
                        <select
                          id="snippet-type" value={newContent.content_type}
                          onChange={(e) => setNewContent({ ...newContent, content_type: e.target.value })}
                          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                        >
                          <option value="tip">Tip</option>
                          <option value="promo">Promo</option>
                          <option value="seasonal">Seasonal</option>
                          <option value="cta">Call to Action</option>
                        </select>
                      </div>
                      <div className="flex gap-4 items-end">
                        <div className="flex-1">
                          <label htmlFor="snippet-start" className="block text-sm text-neutral-300 mb-1">Start Date</label>
                          <input
                            type="date"
                            id="snippet-start" value={newContent.start_date}
                            onChange={(e) => setNewContent({ ...newContent, start_date: e.target.value })}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                          />
                        </div>
                        <div className="flex-1">
                          <label htmlFor="snippet-end" className="block text-sm text-neutral-300 mb-1">End Date</label>
                          <input
                            type="date"
                            id="snippet-end" value={newContent.end_date}
                            onChange={(e) => setNewContent({ ...newContent, end_date: e.target.value })}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="snippet-text" className="block text-sm text-neutral-300 mb-1">Text</label>
                      <textarea
                        id="snippet-text" value={newContent.text}
                        onChange={(e) => setNewContent({ ...newContent, text: e.target.value })}
                        rows={3}
                        placeholder="e.g., Summer special: Book your float at eddyfloat.com"
                        className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 resize-none"
                      />
                    </div>
                    <div className="flex gap-4 items-center">
                      <label className="flex items-center gap-2 text-sm text-neutral-300">
                        <input
                          type="checkbox"
                          checked={newContent.platforms.includes('instagram')}
                          onChange={(e) => {
                            const p = e.target.checked
                              ? [...newContent.platforms, 'instagram']
                              : newContent.platforms.filter((x) => x !== 'instagram');
                            setNewContent({ ...newContent, platforms: p });
                          }}
                          className="rounded bg-neutral-900 border-neutral-600"
                        />
                        Instagram
                      </label>
                      <label className="flex items-center gap-2 text-sm text-neutral-300">
                        <input
                          type="checkbox"
                          checked={newContent.platforms.includes('facebook')}
                          onChange={(e) => {
                            const p = e.target.checked
                              ? [...newContent.platforms, 'facebook']
                              : newContent.platforms.filter((x) => x !== 'facebook');
                            setNewContent({ ...newContent, platforms: p });
                          }}
                          className="rounded bg-neutral-900 border-neutral-600"
                        />
                        Facebook
                      </label>
                    </div>
                    <button
                      onClick={addContent}
                      disabled={!newContent.text.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      Add Snippet
                    </button>
                  </div>
                </div>

                }
                {/* Existing content */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Saved snippets</h3>
                  {customContent.length === 0 ? (
                    <p className="text-neutral-400 text-sm">No content snippets yet</p>
                  ) : (
                    <div className="space-y-3">
                      {customContent.map((item) => (
                        <div
                          key={item.id}
                          className={`flex flex-wrap items-start gap-4 p-4 rounded-lg border transition-colors ${
                            item.active
                              ? 'bg-neutral-700/50 border-neutral-600'
                              : 'bg-neutral-800 border-neutral-700 opacity-60'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium px-2 py-0.5 rounded bg-neutral-700 text-neutral-300 uppercase">
                                {item.content_type}
                              </span>
                              <span className="text-xs text-neutral-500">
                                {item.platforms.join(', ')}
                              </span>
                              {item.start_date && (
                                <span className="text-xs text-neutral-500">
                                  {item.start_date} - {item.end_date || 'ongoing'}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-neutral-200 [overflow-wrap:anywhere]">{item.text}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {item.active && <button className={studio.inline} onClick={() => { openComposer(); setQuickPostType('tip'); setQuickPostContentId(item.id); setQuickPostPlatforms(item.platforms.filter(p => p === 'facebook' || p === 'instagram')); }}>Use in post</button>}
                            <button
                              onClick={() => toggleContentActive(item)}
                              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                                item.active
                                  ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                  : 'bg-neutral-600 text-neutral-400 hover:bg-neutral-500'
                              }`}
                            >
                              {item.active ? 'Active' : 'Inactive'}
                            </button>
                            <button
                              aria-label="Delete snippet" onClick={() => deleteContent(item.id)}
                              className="p-1 text-neutral-500 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Queue and delivery history */}
            {(activeTab === 'history' || activeTab === 'queue') && (
              <div className={`space-y-4 ${styles.history}`}>
                <div className={studio.sectionHead}><div><h2>{activeTab === 'queue' ? 'Publishing queue' : 'Delivery history'}</h2>
                  <p>{activeTab === 'queue' ? 'Review drafts, track renders, and resolve delivery issues.' : 'Published posts, TikTok inbox deliveries, and skipped posts.'}</p></div></div>
                {/* Filters */}
                <div className={styles.filters}>
                  <select
                    aria-label="Filter by platform"
                    value={postFilter.platform}
                    onChange={(e) => { setOffset(0); setPostFilter({ ...postFilter, platform: e.target.value }); }}
                    className="px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
                  >
                    <option value="">All Platforms</option>
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                    <option value="tiktok">TikTok</option>
                  </select>
                  <select
                    aria-label="Filter by status"
                    value={postFilter.status}
                    onChange={(e) => { setOffset(0); setPostFilter({ ...postFilter, status: e.target.value }); }}
                    className="px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
                  >
                    <option value="">All Statuses</option>
                    {(activeTab === 'queue' ? ['review', 'scheduled', 'rendering', 'pending', 'publishing', 'failed', 'unknown'] : ['published', 'inbox', 'skipped']).map(status =>
                      <option key={status} value={status}>{STATUS_BADGES[status].label}</option>)}
                  </select>
                  <button
                    aria-label="Refresh posts"
                    onClick={fetchPosts}
                    className="p-2 text-neutral-400 hover:text-white transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {/* Posts table */}
                {postError ? <p role="alert">{postError}</p> : postLoading && !posts.length ? <p role="status">Loading posts…</p> : posts.length === 0 ? (
                  <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-8 text-center">
                    <p className="text-neutral-400">{activeTab === 'queue' ? 'No posts waiting in this queue.' : 'No deliveries match these filters.'}</p>
                  </div>
                ) : (
                  <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table aria-label={activeTab === 'queue' ? 'Publishing queue' : 'Delivery history'} className={styles.table}>
                        <thead>
                          <tr className="border-b border-neutral-700">
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Date</th>
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Platform</th>
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Type</th>
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Status</th>
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Caption</th>
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {posts.map((post) => {
                            const badge = STATUS_BADGES[post.status] || STATUS_BADGES.pending;
                            const dam = isDamStory(post.render_request) ? post.render_request : null;
                            const reviewable = dam ? isOwner && (post.video_url || post.status === 'failed') && ['review', 'failed'].includes(post.status) : post.status === 'review';
                            const planned = post.status === 'scheduled' || (post.status === 'rendering' && Boolean(post.scheduled_at));
                            return (
                              <tr key={post.id} className="border-b border-neutral-700/50">
                                <td className="px-4 py-3 text-sm text-neutral-300 whitespace-nowrap">
                                  {new Date(post.created_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </td>
                                <td className="px-4 py-3 text-sm text-neutral-300 capitalize">{postDestination(post)}</td>
                                <td className="px-4 py-3 text-sm text-neutral-300">
                                  <strong>{postTypeLabel(post)}</strong>
                                  <span className="block text-xs text-neutral-400">
                                    {post.media_type === 'video' ? 'Video' : isDailyReport(post.render_request) ? `Carousel · ${post.render_request.slides.length}` : 'Image'}
                                    {post.river_slug && ` · ${post.river_slug}`}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border whitespace-nowrap ${badge.className}`}>
                                    {post.status === 'published' && <CheckCircle className="w-3 h-3" />}
                                    {post.status === 'failed' && <XCircle className="w-3 h-3" />}
                                    {post.status === 'pending' && <AlertCircle className="w-3 h-3" />}
                                    {badge.label}
                                  </span>
                                  {planned && <p className="text-xs mt-1">{post.status === 'rendering' ? 'Sends ' : ''}{deliveryStamp(post.scheduled_at)}</p>}
                                  {post.error_message && (
                                    <p className="text-xs text-red-400 mt-1 max-w-xs truncate" title={post.error_message}>
                                      {post.error_message}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-neutral-400">
                                  <span className="line-clamp-2 [overflow-wrap:anywhere]">{isStoryRender(post.render_request) ? '—' : post.caption}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {planned && (!dam || isOwner) && <button className={studio.inline} disabled={Boolean(sendingId)} onClick={() => retryPost(post.id, 'unschedule')}>{post.status === 'rendering' ? 'Review first' : 'Return to review'}</button>}
                                    {(post.video_url || post.image_url || post.caption) && (
                                      <button
                                        onClick={() => {
                                          setScheduleLater(false); setSendTime(''); setReviewError(''); setStaleRelease(false);
                                          setReviewId(post.id);
                                        }}
                                        className="admin-secondary flex items-center gap-1.5 px-3 py-1 text-sm rounded"
                                      >
                                        <Play className="w-3 h-3" />
                                        {reviewable ? 'Review draft' : 'Preview'}
                                      </button>
                                    )}
                                    {post.platform === 'tiktok' && post.caption && (
                                      <button
                                        onClick={() => copyCaption(post)}
                                        className="admin-link flex items-center gap-1.5 px-2 py-1 text-sm"
                                        title="Copy the generated caption to paste when finishing the TikTok draft"
                                      >
                                        <Copy className="w-3 h-3" />
                                        Copy caption
                                      </button>
                                    )}
                                    {post.status === 'unknown' && (!dam || isOwner) && (
                                      <>
                                        <button
                                          onClick={() => retryPost(post.id, 'resolve', 'published')}
                                          className="flex items-center gap-1 px-2 py-1 text-xs text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 rounded transition-colors"
                                          title="You checked the account and the post is live"
                                        >
                                          <CheckCircle className="w-3 h-3" />
                                          It is live
                                        </button>
                                        <button
                                          onClick={() => retryPost(post.id, 'resolve', 'failed')}
                                          className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded transition-colors"
                                          title="You checked the account and the post is NOT there; this allows a retry"
                                        >
                                          <XCircle className="w-3 h-3" />
                                          Not posted
                                        </button>
                                      </>
                                    )}
                                    {post.status === 'failed' && !dam && (
                                      <button
                                        onClick={() => retryPost(post.id, reportNeedsRender(post) ? 'render' : 'retry')}
                                        className="flex items-center gap-1 px-2 py-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded transition-colors"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        {reportNeedsRender(post) ? 'Render again' : 'Retry delivery'}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {(postTotal > 50 || offset > 0) && <div className={studio.actions}>
                  <button className="admin-secondary" disabled={offset === 0} onClick={() => setOffset(offset - 50)}>Previous</button>
                  <span>{offset + 1}–{Math.min(offset + 50, postTotal)} of {postTotal}</span>
                  <button className="admin-secondary" disabled={offset + 50 >= postTotal} onClick={() => setOffset(offset + 50)}>Next</button></div>}
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
