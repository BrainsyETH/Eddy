'use client';

// src/app/admin/social/page.tsx
// Admin dashboard for social media posting — settings, filters, custom content, post history

import { useEffect, useState, useCallback } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  RefreshCw,
  Settings,
  Filter,
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
  Eye,
  X,
  Zap,
  Play,
} from 'lucide-react';

type Tab = 'settings' | 'filters' | 'content' | 'history';

interface VideoFeatures {
  condition_alerts_as_video: boolean;
}

interface SocialConfig {
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
  river_schedules: Record<string, Record<string, string | null>>;
  video_features: VideoFeatures;
}

interface PreviewPost {
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

const ALL_CONDITIONS = [
  { code: 'flowing', label: 'Flowing', color: 'bg-emerald-500' },
  { code: 'good', label: 'Good', color: 'bg-lime-500' },
  { code: 'low', label: 'Low', color: 'bg-yellow-500' },
  { code: 'too_low', label: 'Too Low', color: 'bg-gray-500' },
  { code: 'high', label: 'High', color: 'bg-orange-500' },
  { code: 'dangerous', label: 'Dangerous/Flood', color: 'bg-red-500' },
];

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  published: { label: 'Published', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  failed: { label: 'Failed', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  pending: { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  publishing: { label: 'Publishing', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  rendering: { label: 'Rendering', className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  skipped: { label: 'Skipped', className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

export default function SocialAdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('settings');
  const [config, setConfig] = useState<SocialConfig | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [customContent, setCustomContent] = useState<CustomContent[]>([]);
  const [rivers, setRivers] = useState<{ slug: string; name: string }[]>(FALLBACK_RIVERS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [postFilter, setPostFilter] = useState<{ platform: string; status: string }>({
    platform: '',
    status: '',
  });

  // New content form state
  const [newContent, setNewContent] = useState({
    content_type: 'tip',
    text: '',
    start_date: '',
    end_date: '',
    platforms: ['instagram', 'facebook'] as string[],
  });

  // Compose post state
  const [showCompose, setShowCompose] = useState(false);
  const [composeForm, setComposeForm] = useState({
    caption: '',
    imageUrl: '',
    platforms: ['facebook', 'instagram'] as string[],
  });
  const [publishing, setPublishing] = useState(false);

  // Quick post state
  const [showQuickPost, setShowQuickPost] = useState(false);
  const [quickPostType, setQuickPostType] = useState<'digest' | 'highlight' | 'tip'>('digest');
  const [quickPostRiver, setQuickPostRiver] = useState('');
  const [quickPostContentId, setQuickPostContentId] = useState('');
  const [quickPostPlatforms, setQuickPostPlatforms] = useState<string[]>(['facebook', 'instagram']);
  const [quickPostAsVideo, setQuickPostAsVideo] = useState(false);
  const [quickPosting, setQuickPosting] = useState(false);

  // Preview modal state
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [videoPreviewPost, setVideoPreviewPost] = useState<SocialPost | null>(null);

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
    try {
      const params = new URLSearchParams();
      if (postFilter.platform) params.set('platform', postFilter.platform);
      if (postFilter.status) params.set('status', postFilter.status);
      params.set('limit', '50');
      params.set('_t', Date.now().toString());

      const res = await adminFetch(`/api/admin/social/posts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`[SocialAdmin] fetchPosts: ${data.posts?.length ?? 0} posts, total=${data.total}`);
        setPosts(data.posts || []);
      } else {
        console.error(`[SocialAdmin] fetchPosts failed: ${res.status}`);
        showToast(`Failed to load post history (${res.status})`, 'error');
      }
    } catch (err) {
      console.error('Failed to fetch posts:', err);
      showToast('Could not load post history', 'error');
    }
  }, [postFilter]);

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

  // Initial load — run once on mount
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchConfig(), fetchPosts(), fetchContent(), fetchRivers()]).finally(() =>
      setLoading(false)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch posts when filter changes (don't re-fetch config — would overwrite unsaved edits)
  useEffect(() => {
    fetchPosts();
  }, [postFilter, fetchPosts]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    console.log(`[SocialAdmin] Saving config: cooldown=${config.highlight_cooldown_hours}, conditions=[${config.highlight_conditions?.join(',')}]`);
    try {
      // Use POST (not PUT) to avoid any edge/CDN caching of write operations
      const res = await adminFetch(`/api/admin/social/config?_save=1&_t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        const saved = await res.json();
        if (saved && saved.id) {
          console.log(`[SocialAdmin] Save response: cooldown=${saved.highlight_cooldown_hours}, conditions=[${saved.highlight_conditions?.join(',')}]`);

          // Verification: do a fresh GET to confirm the save actually persisted
          const verifyRes = await adminFetch(`/api/admin/social/config?_verify=1&_t=${Date.now()}`);
          if (verifyRes.ok) {
            const verified = await verifyRes.json();
            if (verified && verified.id) {
              const cooldownOk = verified.highlight_cooldown_hours === config.highlight_cooldown_hours;
              const conditionsOk = JSON.stringify(verified.highlight_conditions?.sort()) === JSON.stringify(config.highlight_conditions?.sort());

              if (!cooldownOk || !conditionsOk) {
                console.error(
                  `[SocialAdmin] SAVE DID NOT PERSIST! ` +
                  `Sent cooldown=${config.highlight_cooldown_hours} but GET returned ${verified.highlight_cooldown_hours}. ` +
                  `Sent conditions=[${config.highlight_conditions?.join(',')}] but GET returned [${verified.highlight_conditions?.join(',')}]`
                );
                showToast('Save failed — changes did not persist. Check server logs.', 'error');
                setConfig(verified); // Show actual DB state
                return;
              }

              console.log(`[SocialAdmin] Save VERIFIED — DB matches: cooldown=${verified.highlight_cooldown_hours}, conditions=[${verified.highlight_conditions?.join(',')}]`);
              setConfig(verified);
              showToast('Settings saved and verified', 'success');
            } else {
              setConfig(saved);
              showToast('Settings saved (verification returned empty)', 'success');
            }
          } else {
            setConfig(saved);
            showToast('Settings saved (could not verify)', 'success');
          }
        } else {
          showToast('Save appeared to succeed but returned empty data — please refresh', 'error');
        }
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || `Save failed (${res.status})`, 'error');
      }
    } catch (err) {
      console.error('Failed to save config:', err);
      showToast('Network error — could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const retryPost = async (postId: string) => {
    try {
      const res = await adminFetch('/api/admin/social/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId }),
      });
      if (res.ok) {
        fetchPosts();
        showToast('Post queued for retry', 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || `Retry failed (${res.status})`, 'error');
      }
    } catch (err) {
      console.error('Failed to retry post:', err);
      showToast('Network error — could not retry', 'error');
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

  const publishManualPost = async () => {
    if (!composeForm.caption.trim()) return;
    setPublishing(true);
    try {
      const res = await adminFetch('/api/admin/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: composeForm.caption,
          imageUrl: composeForm.imageUrl || undefined,
          platforms: composeForm.platforms,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const successes = data.results?.filter((r: { success: boolean }) => r.success).length || 0;
        const failures = data.results?.filter((r: { success: boolean }) => !r.success) || [];
        if (failures.length > 0) {
          showToast(`Published to ${successes} platform(s). ${failures.length} failed: ${failures.map((f: { platform: string; error?: string }) => `${f.platform}: ${f.error}`).join('; ')}`, failures.length === data.results?.length ? 'error' : 'success');
        } else {
          showToast(`Published to ${successes} platform(s)`, 'success');
        }
        setShowCompose(false);
        setComposeForm({ caption: '', imageUrl: '', platforms: ['facebook', 'instagram'] });
        fetchPosts();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || `Publish failed (${res.status})`, 'error');
      }
    } catch (err) {
      console.error('Failed to publish:', err);
      showToast('Network error — could not publish', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const publishQuickPost = async () => {
    if (quickPostType === 'highlight' && !quickPostRiver) return;
    if (quickPostType === 'tip' && !quickPostContentId) return;
    if (quickPostPlatforms.length === 0) return;

    setQuickPosting(true);
    try {
      const res = await adminFetch('/api/admin/social/quick-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: quickPostType,
          riverSlug: quickPostType === 'highlight' ? quickPostRiver : undefined,
          contentId: quickPostType === 'tip' ? quickPostContentId : undefined,
          platforms: quickPostPlatforms,
          asVideo: quickPostAsVideo && quickPostType !== 'tip',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rendering) {
          showToast(`Video render dispatched for ${data.rendering} platform(s) — will publish in ~3-5 min`, 'success');
        } else {
          const successes = data.results?.filter((r: { success: boolean }) => r.success).length || 0;
          const failures = data.results?.filter((r: { success: boolean }) => !r.success) || [];
          if (failures.length > 0) {
            showToast(`Published to ${successes} platform(s). ${failures.length} failed: ${failures.map((f: { platform: string; error?: string }) => `${f.platform}: ${f.error}`).join('; ')}`, failures.length === data.results?.length ? 'error' : 'success');
          } else {
            showToast(`Published to ${successes} platform(s)`, 'success');
          }
        }
        setShowQuickPost(false);
        fetchPosts();
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

  const loadPreview = async () => {
    setPreviewLoading(true);
    setShowPreview(true);
    try {
      const res = await adminFetch(`/api/admin/social/preview?_t=${Date.now()}`);
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

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'settings', label: 'Settings', icon: Settings },
    { key: 'filters', label: 'River Filters', icon: Filter },
    { key: 'content', label: 'Custom Content', icon: FileText },
    { key: 'history', label: 'Post History', icon: Clock },
  ];

  return (
    <AdminLayout
      title="Social Media"
      description="Manage Instagram and Facebook posting for Eddy"
    >
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium transition-all ${
          toast.type === 'success'
            ? 'bg-green-900/90 text-green-200 border-green-700'
            : 'bg-red-900/90 text-red-200 border-red-700'
        }`}>
          {toast.message}
        </div>
      )}
      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl w-full max-w-3xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-neutral-700">
              <h3 className="text-lg font-semibold text-white">Preview Next Posts</h3>
              <button onClick={() => setShowPreview(false)} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {previewLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-neutral-400" />
                </div>
              ) : previewData ? (
                <>
                  {previewData.posts.length === 0 ? (
                    <p className="text-neutral-400 text-sm">No posts would be scheduled right now.</p>
                  ) : (
                    previewData.posts.map((post, i) => (
                      <div key={i} className="bg-neutral-700/50 rounded-lg p-4 border border-neutral-600">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary-500/20 text-primary-400 uppercase">
                            {post.platform}
                          </span>
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-neutral-600 text-neutral-300 uppercase">
                            {post.postType === 'daily_digest' ? 'Digest' : post.postType === 'river_highlight' ? 'Highlight' : post.postType}
                          </span>
                          {post.mediaType === 'video' && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                              Video
                            </span>
                          )}
                          {post.riverSlug && (
                            <span className="text-xs text-neutral-400">{post.riverSlug}</span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-200 whitespace-pre-line line-clamp-4">{post.caption}</p>
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
        </div>
      )}

      {/* Video Preview Modal */}
      {videoPreviewPost && videoPreviewPost.video_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl w-full max-w-2xl">
            <div className="flex items-center justify-between p-4 border-b border-neutral-700">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white">Video Preview</h3>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary-500/20 text-primary-400 uppercase">
                  {videoPreviewPost.platform}
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-neutral-600 text-neutral-300 uppercase">
                  {videoPreviewPost.post_type === 'daily_digest' ? 'Digest' : videoPreviewPost.post_type === 'river_highlight' ? 'Highlight' : videoPreviewPost.post_type}
                </span>
              </div>
              <button onClick={() => setVideoPreviewPost(null)} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="bg-black rounded-lg overflow-hidden">
                <video
                  src={videoPreviewPost.video_url}
                  controls
                  autoPlay
                  playsInline
                  className="w-full max-h-[500px]"
                />
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                {new Date(videoPreviewPost.created_at).toLocaleString()} {videoPreviewPost.river_slug ? `\u2022 ${videoPreviewPost.river_slug}` : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 max-w-5xl mx-auto">
        {/* Action buttons */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => { setShowQuickPost(!showQuickPost); setShowCompose(false); }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            <Zap className="w-4 h-4" />
            Quick Post
          </button>
          <button
            onClick={() => { setShowCompose(!showCompose); setShowQuickPost(false); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
          >
            <Send className="w-4 h-4" />
            Compose Post
          </button>
          <button
            onClick={loadPreview}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-700 text-white rounded-lg font-medium hover:bg-neutral-600 transition-colors"
          >
            <Eye className="w-4 h-4" />
            Preview Next Posts
          </button>
        </div>

        {/* Quick Post form */}
        {showQuickPost && (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 mb-6 space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-green-400" />
              Quick Post
            </h3>
            <p className="text-sm text-neutral-400">
              Auto-generates caption and branded image, then publishes immediately.
            </p>

            {/* Post type selector */}
            <div>
              <label className="block text-sm text-neutral-300 mb-1">Post Type</label>
              <select
                value={quickPostType}
                onChange={(e) => {
                  setQuickPostType(e.target.value as 'digest' | 'highlight' | 'tip');
                  setQuickPostRiver('');
                  setQuickPostContentId('');
                }}
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
              >
                <option value="digest">Daily Digest (all rivers)</option>
                <option value="highlight">River Highlight</option>
                <option value="tip">Tip / Seasonal Quote</option>
              </select>
            </div>

            {/* River selector (for highlights) */}
            {quickPostType === 'highlight' && (
              <div>
                <label className="block text-sm text-neutral-300 mb-1">River</label>
                <select
                  value={quickPostRiver}
                  onChange={(e) => setQuickPostRiver(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                >
                  <option value="">Select a river...</option>
                  {rivers.map((r) => (
                    <option key={r.slug} value={r.slug}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Content selector (for tips) */}
            {quickPostType === 'tip' && (
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Content</label>
                <select
                  value={quickPostContentId}
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

            {/* Platform checkboxes */}
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={quickPostPlatforms.includes('facebook')}
                  onChange={(e) => {
                    setQuickPostPlatforms(e.target.checked
                      ? [...quickPostPlatforms, 'facebook']
                      : quickPostPlatforms.filter(x => x !== 'facebook'));
                  }}
                  className="rounded bg-neutral-900 border-neutral-600"
                />
                Facebook
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={quickPostPlatforms.includes('instagram')}
                  onChange={(e) => {
                    setQuickPostPlatforms(e.target.checked
                      ? [...quickPostPlatforms, 'instagram']
                      : quickPostPlatforms.filter(x => x !== 'instagram'));
                  }}
                  className="rounded bg-neutral-900 border-neutral-600"
                />
                Instagram
              </label>
            </div>

            {/* Video toggle (digest & highlight only) */}
            {quickPostType !== 'tip' && (
              <div className="flex items-center gap-3 p-3 bg-neutral-900/50 border border-neutral-700 rounded-lg">
                <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quickPostAsVideo}
                    onChange={(e) => setQuickPostAsVideo(e.target.checked)}
                    className="rounded bg-neutral-900 border-neutral-600"
                  />
                  Post as animated video
                </label>
                <span className="text-xs text-neutral-500">
                  {quickPostAsVideo
                    ? 'Renders via GitHub Actions (~3-5 min), then publishes automatically'
                    : 'Posts static branded image immediately'}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={publishQuickPost}
                disabled={
                  quickPosting ||
                  quickPostPlatforms.length === 0 ||
                  (quickPostType === 'highlight' && !quickPostRiver) ||
                  (quickPostType === 'tip' && !quickPostContentId)
                }
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {quickPosting
                  ? (quickPostAsVideo ? 'Dispatching...' : 'Publishing...')
                  : (quickPostAsVideo ? 'Render & Publish' : 'Publish Now')}
              </button>
              <button
                onClick={() => setShowQuickPost(false)}
                className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Compose form */}
        {showCompose && (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 mb-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Compose Post</h3>
            <div>
              <label className="block text-sm text-neutral-300 mb-1">Caption</label>
              <textarea
                value={composeForm.caption}
                onChange={(e) => setComposeForm({ ...composeForm, caption: e.target.value })}
                rows={4}
                placeholder="Write your post caption..."
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-neutral-300 mb-1">Image URL (optional)</label>
              <input
                type="url"
                value={composeForm.imageUrl}
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
            <div className="flex gap-3">
              <button
                onClick={publishManualPost}
                disabled={publishing || !composeForm.caption.trim() || composeForm.platforms.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {publishing ? 'Publishing...' : 'Publish Now'}
              </button>
              <button
                onClick={() => setShowCompose(false)}
                className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-neutral-700 pb-2 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-primary-600 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        ) : (
          <>
            {/* Settings Tab */}
            {activeTab === 'settings' && config && (
              <div className="space-y-6">
                {/* Global toggle */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Posting Status</h3>
                      <p className="text-sm text-neutral-400">Enable or disable all social media posting</p>
                    </div>
                    <button
                      onClick={() => setConfig({ ...config, posting_enabled: !config.posting_enabled })}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
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
                    {config.posting_enabled ? 'Active - Posts will be published automatically' : 'Paused - No posts will be published'}
                  </div>
                </div>

                {/* Daily Digest */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Daily Digest</h3>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 text-sm text-neutral-300">
                      <input
                        type="checkbox"
                        checked={config.digest_enabled}
                        onChange={(e) => setConfig({ ...config, digest_enabled: e.target.checked })}
                        className="rounded bg-neutral-900 border-neutral-600"
                      />
                      Enable daily digest
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-neutral-300">Time (UTC)</label>
                      <input
                        type="time"
                        value={config.digest_time_utc}
                        onChange={(e) => setConfig({ ...config, digest_time_utc: e.target.value })}
                        className="px-3 py-1.5 bg-neutral-900 border border-neutral-600 rounded-lg text-white text-sm"
                        disabled={!config.digest_enabled}
                      />
                    </div>
                  </div>
                </div>

                {/* River Posting Schedule — Weekly Grid */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2">River Posting Schedule</h3>
                  <p className="text-sm text-neutral-400 mb-4">
                    Set the posting time (CST) for each river per day of the week.
                    Clear a time to skip that day. Toggle the switch to enable/disable a river entirely.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="text-left text-xs font-medium text-neutral-400 uppercase px-2 py-2 w-8"></th>
                          <th className="text-left text-xs font-medium text-neutral-400 uppercase px-2 py-2 min-w-[100px]">River</th>
                          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                            <th key={day} className="text-center text-xs font-medium text-neutral-400 uppercase px-1 py-2 min-w-[80px]">{day}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rivers.map((river) => {
                          const isDisabled = (config.disabled_rivers || []).includes(river.slug);
                          const riverSched = (config.river_schedules || {})[river.slug] || {};
                          const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
                          return (
                            <tr
                              key={river.slug}
                              className={`border-t border-neutral-700/50 ${isDisabled ? 'opacity-40' : ''}`}
                            >
                              <td className="px-2 py-2">
                                <button
                                  onClick={() => {
                                    const disabled = config.disabled_rivers || [];
                                    if (isDisabled) {
                                      setConfig({
                                        ...config,
                                        disabled_rivers: disabled.filter((s) => s !== river.slug),
                                      });
                                    } else {
                                      setConfig({
                                        ...config,
                                        disabled_rivers: [...disabled, river.slug],
                                      });
                                    }
                                  }}
                                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                    !isDisabled ? 'bg-green-500' : 'bg-neutral-600'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                      !isDisabled ? 'translate-x-4' : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              </td>
                              <td className={`px-2 py-2 font-medium whitespace-nowrap ${isDisabled ? 'text-neutral-500' : 'text-neutral-200'}`}>
                                {river.name}
                              </td>
                              {DAY_KEYS.map((dayKey) => {
                                // Handle both nested (new) and flat (legacy) formats
                                const timeVal = typeof riverSched === 'string'
                                  ? riverSched
                                  : (riverSched as Record<string, string | null>)?.[dayKey] ?? '';
                                const isSkipped = timeVal === '' || timeVal === null;
                                const updateDay = (value: string | null) => {
                                  const currentSched = typeof riverSched === 'string'
                                    ? DAY_KEYS.reduce((acc, d) => ({ ...acc, [d]: riverSched }), {} as Record<string, string | null>)
                                    : { ...riverSched as Record<string, string | null> };
                                  currentSched[dayKey] = value;
                                  setConfig({
                                    ...config,
                                    river_schedules: {
                                      ...(config.river_schedules || {}),
                                      [river.slug]: currentSched,
                                    },
                                  });
                                };
                                return (
                                  <td key={dayKey} className="px-1 py-2 text-center">
                                    {isSkipped && !isDisabled ? (
                                      <button
                                        onClick={() => updateDay('08:00')}
                                        className="w-[74px] px-1 py-1 bg-neutral-800 border border-dashed border-neutral-600 rounded text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-300 transition-colors"
                                        title="Click to enable this day"
                                      >
                                        skip
                                      </button>
                                    ) : (
                                      <div className="relative inline-flex items-center">
                                        <input
                                          type="time"
                                          value={timeVal || ''}
                                          onChange={(e) => updateDay(e.target.value || null)}
                                          disabled={isDisabled}
                                          className={`w-[74px] px-1 py-0.5 bg-neutral-900 border border-neutral-700 rounded text-xs text-center ${
                                            isDisabled ? 'text-neutral-600' : 'text-white'
                                          }`}
                                        />
                                        {!isDisabled && (
                                          <button
                                            onClick={() => updateDay(null)}
                                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-neutral-700 text-neutral-400 hover:bg-red-600 hover:text-white text-[10px] leading-none flex items-center justify-center transition-colors"
                                            title="Skip this day"
                                          >
                                            x
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-neutral-500 mt-3">All times are CST (UTC-6). Click &quot;skip&quot; to enable a day, or click the x to disable it.</p>
                </div>

                {/* Save button */}
                <button
                  onClick={saveConfig}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            )}

            {/* River Filters Tab */}
            {activeTab === 'filters' && config && (
              <div className="space-y-6">
                {/* River toggles */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2">River Selection</h3>
                  <p className="text-sm text-neutral-400 mb-4">
                    Select which rivers can appear in highlight posts. Unchecked rivers will be excluded.
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {rivers.map((river) => {
                      const isDisabled = (config.disabled_rivers || []).includes(river.slug);
                      return (
                        <label
                          key={river.slug}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={!isDisabled}
                            onChange={(e) => {
                              const disabled = config.disabled_rivers || [];
                              if (e.target.checked) {
                                setConfig({
                                  ...config,
                                  disabled_rivers: disabled.filter((s) => s !== river.slug),
                                });
                              } else {
                                setConfig({
                                  ...config,
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
                    Only post river highlights when the condition matches one of these:
                  </p>
                  <div className="grid gap-2 md:grid-cols-3">
                    {ALL_CONDITIONS.map((condition) => {
                      const isEnabled = (config.highlight_conditions || []).includes(condition.code);
                      return (
                        <label
                          key={condition.code}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={(e) => {
                              const conditions = config.highlight_conditions || [];
                              if (e.target.checked) {
                                setConfig({
                                  ...config,
                                  highlight_conditions: [...conditions, condition.code],
                                });
                              } else {
                                setConfig({
                                  ...config,
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

                {/* Video Features — opt-in reel variants */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2">Video Features</h3>
                  <p className="text-sm text-neutral-400 mb-4">
                    Opt-in reel variants. Renders go through GitHub Actions, add ~5–10 min latency,
                    and are gated by the audio verification step.
                  </p>
                  <label className="flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.video_features?.condition_alerts_as_video ?? false}
                      onChange={(e) => {
                        setConfig({
                          ...config,
                          video_features: {
                            ...(config.video_features || { condition_alerts_as_video: false }),
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
                        When a river flips to flowing, high, or dangerous, render a 12-second reel
                        instead of posting a static image. Off = fast image alert; on = higher
                        engagement, slower publish.
                      </div>
                    </div>
                  </label>
                </div>

                <button
                  onClick={saveConfig}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Filters'}
                </button>
              </div>
            )}

            {/* Custom Content Tab */}
            {activeTab === 'content' && (
              <div className="space-y-6">
                {/* Add new */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Add Content Snippet</h3>
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm text-neutral-300 mb-1">Type</label>
                        <select
                          value={newContent.content_type}
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
                          <label className="block text-sm text-neutral-300 mb-1">Start Date</label>
                          <input
                            type="date"
                            value={newContent.start_date}
                            onChange={(e) => setNewContent({ ...newContent, start_date: e.target.value })}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm text-neutral-300 mb-1">End Date</label>
                          <input
                            type="date"
                            value={newContent.end_date}
                            onChange={(e) => setNewContent({ ...newContent, end_date: e.target.value })}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">Text</label>
                      <textarea
                        value={newContent.text}
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

                {/* Existing content */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Active Snippets</h3>
                  {customContent.length === 0 ? (
                    <p className="text-neutral-400 text-sm">No content snippets yet</p>
                  ) : (
                    <div className="space-y-3">
                      {customContent.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                            item.active
                              ? 'bg-neutral-700/50 border-neutral-600'
                              : 'bg-neutral-800 border-neutral-700 opacity-60'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium px-2 py-0.5 rounded bg-neutral-600 text-neutral-300 uppercase">
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
                            <p className="text-sm text-neutral-200 truncate">{item.text}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
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
                              onClick={() => deleteContent(item.id)}
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

            {/* Post History Tab */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                {/* Filters */}
                <div className="flex gap-3 items-center">
                  <select
                    value={postFilter.platform}
                    onChange={(e) => setPostFilter({ ...postFilter, platform: e.target.value })}
                    className="px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
                  >
                    <option value="">All Platforms</option>
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                  </select>
                  <select
                    value={postFilter.status}
                    onChange={(e) => setPostFilter({ ...postFilter, status: e.target.value })}
                    className="px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
                  >
                    <option value="">All Statuses</option>
                    <option value="published">Published</option>
                    <option value="failed">Failed</option>
                    <option value="rendering">Rendering</option>
                    <option value="pending">Pending</option>
                    <option value="skipped">Skipped</option>
                  </select>
                  <button
                    onClick={fetchPosts}
                    className="p-2 text-neutral-400 hover:text-white transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {/* Posts table */}
                {posts.length === 0 ? (
                  <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-8 text-center">
                    <p className="text-neutral-400">No posts found</p>
                  </div>
                ) : (
                  <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-neutral-700">
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Date</th>
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Platform</th>
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Type</th>
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Media</th>
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">River</th>
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Status</th>
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Caption</th>
                            <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {posts.map((post) => {
                            const badge = STATUS_BADGES[post.status] || STATUS_BADGES.pending;
                            return (
                              <tr key={post.id} className="border-b border-neutral-700/50 hover:bg-neutral-700/30">
                                <td className="px-4 py-3 text-sm text-neutral-300 whitespace-nowrap">
                                  {new Date(post.created_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </td>
                                <td className="px-4 py-3 text-sm text-neutral-300 capitalize">{post.platform}</td>
                                <td className="px-4 py-3 text-sm text-neutral-300">
                                  {post.post_type === 'daily_digest' ? 'Digest' : post.post_type === 'river_highlight' ? 'Highlight' : post.post_type === 'manual' ? 'Manual' : post.post_type === 'condition_change' ? 'Alert' : post.post_type}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  {post.media_type === 'video' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">Video</span>
                                  ) : (
                                    <span className="text-neutral-400">Image</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-neutral-300">{post.river_slug || '-'}</td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${badge.className}`}>
                                    {post.status === 'published' && <CheckCircle className="w-3 h-3" />}
                                    {post.status === 'failed' && <XCircle className="w-3 h-3" />}
                                    {post.status === 'pending' && <AlertCircle className="w-3 h-3" />}
                                    {badge.label}
                                  </span>
                                  {post.error_message && (
                                    <p className="text-xs text-red-400 mt-1 max-w-xs truncate" title={post.error_message}>
                                      {post.error_message}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-neutral-400 max-w-xs truncate">
                                  {(post.caption || '').slice(0, 80)}...
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    {post.video_url && (
                                      <button
                                        onClick={() => setVideoPreviewPost(post)}
                                        className="flex items-center gap-1 px-2 py-1 text-xs text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 rounded transition-colors"
                                      >
                                        <Play className="w-3 h-3" />
                                        Preview
                                      </button>
                                    )}
                                    {post.status === 'failed' && (
                                      <button
                                        onClick={() => retryPost(post.id)}
                                        className="flex items-center gap-1 px-2 py-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded transition-colors"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        Retry
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
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
