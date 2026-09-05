'use client';

// src/app/admin/clips/page.tsx
// Admin dashboard for ClipEngine — clip library, pipeline triggers, brand checks,
// montage compilation, content decision preview, and weekly review.

import { useEffect, useState, useCallback } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  RefreshCw,
  Film,
  Play,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Scissors,
  ShieldCheck,
  BarChart3,
  Lightbulb,
  ExternalLink,
  Layers,
  Send,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

type Tab = 'library' | 'pipeline' | 'montage' | 'decisions' | 'review';

interface ClipItem {
  id: string;
  youtube_video_id: string;
  youtube_channel: string | null;
  river_slug: string | null;
  clip_url: string;
  thumbnail_url: string | null;
  duration_secs: number | null;
  clip_start_secs: number | null;
  clip_end_secs: number | null;
  orientation: string;
  heatmap_score: number | null;
  brand_check_status: string;
  brand_check_result: Record<string, unknown> | null;
  brand_check_error: string | null;
  source_creator: string | null;
  source_url: string | null;
  content_tags: string[];
  content_type: string | null;
  tone: string | null;
  used_in_posts: string[];
  post_state: 'unposted' | 'published' | 'posting' | 'failed' | 'orphaned';
  posts: Array<{
    id: string;
    status?: string;
    platform?: string;
    platform_post_id?: string | null;
    published_at?: string | null;
    error_message?: string | null;
    missing?: boolean;
  }>;
  last_posted_at: string | null;
  posted_platforms: string[];
  created_at: string;
  updated_at: string;
}

interface ContentDecisionPreview {
  postType: string;
  format: string;
  contentCategory: string;
  audienceSegment: string;
  hookStyle: string;
  riverSlug: string | null;
  clipId: string | null;
  clipIds: string[];
  montageTheme: string | null;
  montageTitle: string | null;
  reasoning: string;
}

interface WeeklyReviewData {
  weekStart: string;
  weekEnd: string;
  totalPosts: number;
  biasGuidance: string | null;
  topPerformers: number;
}

interface RiverOption {
  slug: string;
  name: string;
}

const BRAND_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  approved: { label: 'Approved', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  rejected: { label: 'Rejected', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  review: { label: 'In Review', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  failed: { label: 'Failed', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
};

// Posting state derived from the clip's real social_posts (not brand status).
const POST_BADGES: Record<string, { label: string; className: string }> = {
  unposted: { label: 'Unposted', className: 'bg-neutral-600/20 text-neutral-400 border-neutral-500/30' },
  published: { label: 'Posted', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  posting: { label: 'Posting…', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  failed: { label: 'Post failed', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  orphaned: { label: 'Orphaned', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};
const POST_STATUS_CLASS: Record<string, string> = {
  published: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  publishing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
};
const PLATFORM_ABBR: Record<string, string> = { instagram: 'IG', facebook: 'FB', tiktok: 'TT' };
const PLATFORM_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };

// Rows per library page. The API caps `limit` at 100, so this must stay <= 100.
const PAGE_SIZE = 50;

const TAB_ITEMS: { key: Tab; label: string; icon: typeof Film }[] = [
  { key: 'library', label: 'Clip Library', icon: Film },
  { key: 'pipeline', label: 'Extract Clips', icon: Scissors },
  { key: 'montage', label: 'Compile Montage', icon: Layers },
  { key: 'decisions', label: 'Decision Engine', icon: Lightbulb },
  { key: 'review', label: 'Weekly Review', icon: BarChart3 },
];

export default function ClipsAdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('library');
  const [loading, setLoading] = useState(false);

  // ─── Library state ───
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [riverOptions, setRiverOptions] = useState<RiverOption[]>([]);
  const [clipCount, setClipCount] = useState(0);
  const [clipOffset, setClipOffset] = useState(0);
  const [clipFilter, setClipFilter] = useState({ brand_status: '', river_slug: '' });
  // Selection is keyed by id but holds the whole clip, so a montage can span
  // pages — the Montage tab still has the metadata for a clip scrolled off the
  // current page.
  const [selectedClips, setSelectedClips] = useState<Map<string, ClipItem>>(new Map());
  const [previewClip, setPreviewClip] = useState<ClipItem | null>(null);
  const [brandCheckingClip, setBrandCheckingClip] = useState<string | null>(null);
  const [brandCheckError, setBrandCheckError] = useState<{ clipId: string; message: string } | null>(null);

  // ─── Pipeline state ───
  const [pipelineUrl, setPipelineUrl] = useState('');
  const [pipelineRiver, setPipelineRiver] = useState('');
  const [pipelinePeak, setPipelinePeak] = useState('1');
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);

  // ─── Montage state ───
  const [montageTitle, setMontageTitle] = useState('');
  const [montageStatus, setMontageStatus] = useState<string | null>(null);

  // ─── Decision engine state ───
  const [decision, setDecision] = useState<ContentDecisionPreview | null>(null);
  const [decisionLoading, setDecisionLoading] = useState(false);

  // ─── Weekly review state ───
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReviewData | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  // ─── Fetch clips ───
  const fetchClips = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (clipFilter.brand_status) params.set('brand_status', clipFilter.brand_status);
      if (clipFilter.river_slug) params.set('river_slug', clipFilter.river_slug);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(clipOffset));

      const res = await adminFetch(`/api/admin/clips?${params}`);
      if (res.ok) {
        const data = await res.json();
        const page: ClipItem[] = data.clips || [];
        // The library shrank under us (clips deleted, filter narrowed) and this
        // offset is now past the end — fall back to page 1 rather than showing
        // an empty table over a non-zero count.
        if (page.length === 0 && clipOffset > 0) {
          setClipOffset(0);
          return;
        }
        setClips(page);
        setClipCount(data.total || 0);
        setRiverOptions(data.riverOptions || []);
      }
    } catch (err) {
      console.error('Failed to fetch clips:', err);
    } finally {
      setLoading(false);
    }
  }, [clipFilter, clipOffset]);

  useEffect(() => {
    if (activeTab === 'library') fetchClips();
  }, [activeTab, fetchClips]);

  // Any filter change invalidates the current page number.
  const updateClipFilter = (patch: Partial<typeof clipFilter>) => {
    setClipFilter((f) => ({ ...f, ...patch }));
    setClipOffset(0);
  };

  const pageStart = clipCount === 0 ? 0 : clipOffset + 1;
  const pageEnd = Math.min(clipOffset + clips.length, clipCount);
  const totalPages = Math.max(1, Math.ceil(clipCount / PAGE_SIZE));
  const currentPage = Math.floor(clipOffset / PAGE_SIZE) + 1;
  const allOnPageSelected = clips.length > 0 && clips.every((c) => selectedClips.has(c.id));

  // ─── Trigger pipeline ───
  const triggerPipeline = async () => {
    if (!pipelineUrl && !confirm('No URL provided. This will run the scheduled channel scan. Continue?')) return;
    setPipelineStatus('dispatching');
    try {
      const res = await adminFetch('/api/admin/clips/trigger-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          youtubeUrl: pipelineUrl || undefined,
          riverSlug: pipelineRiver || undefined,
          peakNumber: parseInt(pipelinePeak) || 1,
        }),
      });
      if (res.ok) {
        setPipelineStatus('dispatched');
      } else {
        const err = await res.json();
        setPipelineStatus(`error: ${err.error || 'Unknown error'}`);
      }
    } catch {
      setPipelineStatus('error: Network error');
    }
  };

  // ─── Brand check ───
  const triggerBrandCheck = async (clipId: string) => {
    setBrandCheckingClip(clipId);
    setBrandCheckError(null);
    try {
      const res = await adminFetch('/api/admin/clips/brand-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const inReview = {
          brand_check_status: 'review',
          brand_check_result: null,
          brand_check_error: null,
        };
        setClips((prev) =>
          prev.map((c) => (c.id === clipId ? { ...c, ...inReview } : c)),
        );
        setPreviewClip((clip) => (clip?.id === clipId ? { ...clip, ...inReview } : clip));
      } else {
        const message = data.error || `Brand check failed (${res.status})`;
        const failed = { brand_check_status: 'failed', brand_check_error: message };
        setBrandCheckError({ clipId, message });
        setClips((prev) => prev.map((clip) => (clip.id === clipId ? { ...clip, ...failed } : clip)));
        setPreviewClip((clip) => (clip?.id === clipId ? { ...clip, ...failed } : clip));
        await fetchClips();
      }
    } catch (err) {
      console.error('Brand check failed:', err);
      const message = 'Brand check failed: network error';
      setBrandCheckError({ clipId, message });
      setClips((prev) => prev.map((clip) => (
        clip.id === clipId ? { ...clip, brand_check_status: 'failed', brand_check_error: message } : clip
      )));
      setPreviewClip((clip) => (
        clip?.id === clipId ? { ...clip, brand_check_status: 'failed', brand_check_error: message } : clip
      ));
    } finally {
      setBrandCheckingClip(null);
    }
  };

  // ─── Post an approved clip straight to the connected platforms ───
  const [postingClip, setPostingClip] = useState<string | null>(null);
  const postClip = async (clip: ClipItem) => {
    const already = clip.post_state === 'published';
    const confirmMsg = already
      ? `This clip was already posted${clip.last_posted_at ? ' on ' + new Date(clip.last_posted_at).toLocaleDateString() : ''}. Post it again anyway?`
      : 'Post this clip to the connected platforms (Facebook, Instagram, and TikTok when connected) now?';
    if (!confirm(confirmMsg)) return;
    setPostingClip(clip.id);
    try {
      const res = await adminFetch('/api/admin/clips/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // TikTok is included; the API drops it when TikTok isn't connected or its
        // 24h draft cap is reached, so this never records a guaranteed-fail row.
        body: JSON.stringify({ clipId: clip.id, platforms: ['instagram', 'facebook', 'tiktok'] }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const ok = (data.results || []).filter((r: { success: boolean }) => r.success).map((r: { platform: string }) => r.platform);
        alert(`Posted to: ${ok.join(', ') || 'none'}`);
        fetchClips(); // refresh so the Posted column reflects the new post
      } else {
        const errs = (data.results || []).map((r: { platform: string; error?: string }) => `${r.platform}: ${r.error}`).join('\n');
        alert(`Post failed:\n${errs || data.error || 'Unknown error'}`);
      }
    } catch {
      alert('Post failed: network error');
    } finally {
      setPostingClip(null);
    }
  };

  // ─── Manage a clip: override the verdict (approve/reject), fix river/metadata ───
  const [savingClip, setSavingClip] = useState<string | null>(null);
  const patchClip = async (id: string, fields: Record<string, unknown>) => {
    setSavingClip(id);
    try {
      const res = await adminFetch('/api/admin/clips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...fields }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Update failed: ${err.error || res.status}`);
        return;
      }
      const { clip } = await res.json();
      setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...clip } : c)));
      setPreviewClip((p) => (p && p.id === id ? { ...p, ...clip } : p));
    } catch {
      alert('Update failed: network error');
    } finally {
      setSavingClip(null);
    }
  };
  const setClipStatus = (id: string, status: string) => patchClip(id, { brand_check_status: status });

  // ─── Compile montage ───
  const compileMontage = async () => {
    const ids = Array.from(selectedClips.keys());
    if (ids.length < 2) {
      setMontageStatus('Select at least 2 clips');
      return;
    }
    setMontageStatus('dispatching');
    try {
      const res = await adminFetch('/api/admin/clips/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipIds: ids,
          title: montageTitle || undefined,
        }),
      });
      if (res.ok) {
        setMontageStatus('dispatched');
        setSelectedClips(new Map());
      } else {
        const err = await res.json();
        setMontageStatus(`error: ${err.error || 'Unknown error'}`);
      }
    } catch {
      setMontageStatus('error: Network error');
    }
  };

  // ─── Content decision preview ───
  const fetchDecision = async () => {
    setDecisionLoading(true);
    try {
      const res = await adminFetch('/api/admin/clips/decide');
      if (res.ok) {
        const data = await res.json();
        setDecision(data.decision || null);
      }
    } catch (err) {
      console.error('Failed to fetch decision:', err);
    } finally {
      setDecisionLoading(false);
    }
  };

  // ─── Weekly review ───
  const fetchWeeklyReview = async () => {
    setReviewLoading(true);
    try {
      const res = await adminFetch('/api/cron/weekly-review');
      if (res.ok) {
        const data = await res.json();
        setWeeklyReview(data);
      }
    } catch (err) {
      console.error('Failed to fetch weekly review:', err);
    } finally {
      setReviewLoading(false);
    }
  };

  // ─── Toggle clip selection ───
  const toggleClipSelection = (clip: ClipItem) => {
    setSelectedClips((prev) => {
      const next = new Map(prev);
      if (next.has(clip.id)) next.delete(clip.id);
      else next.set(clip.id, clip);
      return next;
    });
  };

  // Header checkbox acts on the current page only — selections made on other
  // pages are left alone.
  const togglePageSelection = (checked: boolean) => {
    setSelectedClips((prev) => {
      const next = new Map(prev);
      for (const c of clips) {
        if (checked) next.set(c.id, c);
        else next.delete(c.id);
      }
      return next;
    });
  };

  return (
    <AdminLayout title="Clip Library" description="ClipEngine — YouTube clip extraction, brand checks, and montage compilation">
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-neutral-800 rounded-xl p-1 overflow-x-auto">
          {TAB_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === key
                  ? 'bg-primary-500 text-white'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════
            Clip Library Tab
            ═══════════════════════════════════════════ */}
        {activeTab === 'library' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <select
                value={clipFilter.brand_status}
                onChange={(e) => updateClipFilter({ brand_status: e.target.value })}
                className="px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="review">In Review</option>
                <option value="failed">Failed</option>
              </select>
              <select
                value={clipFilter.river_slug}
                onChange={(e) => updateClipFilter({ river_slug: e.target.value })}
                className="px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
              >
                <option value="">All Rivers</option>
                {riverOptions.map((river) => (
                  <option key={river.slug} value={river.slug}>{river.name}</option>
                ))}
              </select>
              <button
                onClick={fetchClips}
                disabled={loading}
                className="p-2 text-neutral-400 hover:text-white transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <span className="text-sm text-neutral-400 ml-auto">
                {clipCount > 0 && clipCount > clips.length
                  ? `${pageStart}–${pageEnd} of ${clipCount} clips`
                  : `${clipCount} clip${clipCount !== 1 ? 's' : ''}`}
                {selectedClips.size > 0 && (
                  <span className="ml-2 text-primary-400">
                    ({selectedClips.size} selected)
                  </span>
                )}
              </span>
            </div>

            {brandCheckError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
                {brandCheckError.message}
              </div>
            )}

            {/* Clips table */}
            {clips.length === 0 ? (
              <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-8 text-center">
                <Film className="w-8 h-8 text-neutral-500 mx-auto mb-2" />
                <p className="text-neutral-400">No clips found</p>
                <p className="text-sm text-neutral-500 mt-1">
                  Extract clips from YouTube using the Pipeline tab
                </p>
              </div>
            ) : (
              <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-700">
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={allOnPageSelected}
                            onChange={(e) => togglePageSelection(e.target.checked)}
                            className="rounded bg-neutral-900 border-neutral-600"
                          />
                        </th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Source</th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">River</th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Duration</th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Score</th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Brand</th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Posted</th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Added</th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clips.map((clip) => {
                        const badge = BRAND_BADGES[clip.brand_check_status] || BRAND_BADGES.pending;
                        const postBadge = POST_BADGES[clip.post_state] || POST_BADGES.unposted;
                        return (
                          <tr
                            key={clip.id}
                            className={`border-b border-neutral-700/50 hover:bg-neutral-700/30 ${
                              selectedClips.has(clip.id) ? 'bg-primary-500/5' : ''
                            }`}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedClips.has(clip.id)}
                                onChange={() => toggleClipSelection(clip)}
                                className="rounded bg-neutral-900 border-neutral-600"
                              />
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="text-neutral-200 font-medium truncate max-w-[200px]">
                                {clip.source_creator || clip.youtube_channel || 'Unknown'}
                              </div>
                              <div className="text-xs text-neutral-500 font-mono">
                                {clip.youtube_video_id}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-neutral-300">
                              {clip.river_slug || <span className="text-neutral-500">-</span>}
                            </td>
                            <td className="px-4 py-3 text-sm text-neutral-300 whitespace-nowrap">
                              {clip.duration_secs ? `${clip.duration_secs}s` : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {clip.heatmap_score != null ? (
                                <span className="text-amber-400 font-medium">
                                  {Number(clip.heatmap_score).toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-neutral-500">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${badge.className}`}
                              >
                                {clip.brand_check_status === 'approved' && <CheckCircle className="w-3 h-3" />}
                                {clip.brand_check_status === 'rejected' && <XCircle className="w-3 h-3" />}
                                {clip.brand_check_status === 'pending' && <AlertCircle className="w-3 h-3" />}
                                {clip.brand_check_status === 'review' && <Eye className="w-3 h-3" />}
                                {clip.brand_check_status === 'failed' && <AlertCircle className="w-3 h-3" />}
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-0.5">
                                <span
                                  className={`inline-flex w-fit items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${postBadge.className}`}
                                >
                                  {clip.post_state === 'published' && <CheckCircle className="w-3 h-3" />}
                                  {clip.post_state === 'failed' && <XCircle className="w-3 h-3" />}
                                  {clip.post_state === 'orphaned' && <AlertCircle className="w-3 h-3" />}
                                  {postBadge.label}
                                </span>
                                {clip.post_state === 'published' && clip.last_posted_at && (
                                  <span className="text-[11px] text-neutral-500 whitespace-nowrap">
                                    {new Date(clip.last_posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    {clip.posted_platforms.length > 0 &&
                                      ` · ${clip.posted_platforms.map((p) => PLATFORM_ABBR[p] || p).join('/')}`}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-neutral-400 whitespace-nowrap">
                              {new Date(clip.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setPreviewClip(clip)}
                                  className="p-1.5 text-neutral-400 hover:text-white transition-colors"
                                  title="Preview"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                {clip.brand_check_status === 'pending' && (
                                  <button
                                    onClick={() => triggerBrandCheck(clip.id)}
                                    disabled={brandCheckingClip === clip.id}
                                    className="p-1.5 text-neutral-400 hover:text-green-400 transition-colors disabled:opacity-40"
                                    title="Run brand check"
                                  >
                                    {brandCheckingClip === clip.id
                                      ? <RefreshCw className="w-4 h-4 animate-spin" />
                                      : <ShieldCheck className="w-4 h-4" />}
                                  </button>
                                )}
                                {(clip.brand_check_status === 'review' || clip.brand_check_status === 'failed') && (
                                  <button
                                    onClick={() => triggerBrandCheck(clip.id)}
                                    disabled={brandCheckingClip === clip.id}
                                    className="p-1.5 text-neutral-400 hover:text-blue-400 transition-colors disabled:opacity-40"
                                    title="Retry brand check"
                                  >
                                    <RefreshCw className={`w-4 h-4 ${brandCheckingClip === clip.id ? 'animate-spin' : ''}`} />
                                  </button>
                                )}
                                {clip.brand_check_status !== 'approved' && (
                                  <button
                                    onClick={() => setClipStatus(clip.id, 'approved')}
                                    disabled={savingClip === clip.id}
                                    className="p-1.5 text-neutral-400 hover:text-green-400 transition-colors disabled:opacity-40"
                                    title="Approve (override)"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                )}
                                {clip.brand_check_status !== 'rejected' && (
                                  <button
                                    onClick={() => {
                                      if (confirm('Reject this clip? It will not be posted.')) setClipStatus(clip.id, 'rejected');
                                    }}
                                    disabled={savingClip === clip.id}
                                    className="p-1.5 text-neutral-400 hover:text-red-400 transition-colors disabled:opacity-40"
                                    title="Reject (override)"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                )}
                                {clip.brand_check_status === 'approved' && (
                                  <button
                                    onClick={() => postClip(clip)}
                                    disabled={postingClip === clip.id}
                                    className={`p-1.5 transition-colors disabled:opacity-40 ${
                                      clip.post_state === 'published'
                                        ? 'text-emerald-500/50 hover:text-emerald-400'
                                        : 'text-neutral-400 hover:text-emerald-400'
                                    }`}
                                    title={
                                      clip.post_state === 'published'
                                        ? 'Already posted — post again'
                                        : 'Post to Facebook & Instagram'
                                    }
                                  >
                                    <Send className="w-4 h-4" />
                                  </button>
                                )}
                                {clip.source_url && (
                                  <a
                                    href={clip.source_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 text-neutral-400 hover:text-blue-400 transition-colors"
                                    title="View source"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pager — the library is server-paginated, so without this only
                    the newest PAGE_SIZE clips are reachable. */}
                {clipCount > PAGE_SIZE && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-neutral-700">
                    <span className="text-sm text-neutral-400">
                      Showing {pageStart}–{pageEnd} of {clipCount}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setClipOffset(Math.max(0, clipOffset - PAGE_SIZE))}
                        disabled={clipOffset === 0 || loading}
                        className="flex items-center gap-1 px-3 py-1.5 bg-neutral-900 border border-neutral-600 rounded-lg text-sm text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-40 disabled:hover:text-neutral-300 disabled:hover:border-neutral-600"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </button>
                      <span className="text-sm text-neutral-400 whitespace-nowrap">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setClipOffset(clipOffset + PAGE_SIZE)}
                        disabled={clipOffset + clips.length >= clipCount || loading}
                        className="flex items-center gap-1 px-3 py-1.5 bg-neutral-900 border border-neutral-600 rounded-lg text-sm text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-40 disabled:hover:text-neutral-300 disabled:hover:border-neutral-600"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════
            Extract Clips (Pipeline) Tab
            ═══════════════════════════════════════════ */}
        {activeTab === 'pipeline' && (
          <div className="space-y-6">
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Extract YouTube Clips</h3>
              <p className="text-sm text-neutral-400 mb-6">
                Paste a YouTube URL to extract the most-watched clip using heatmap data. The pipeline
                downloads, extracts, applies Eddy branding, and uploads the clip to the CDN.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">YouTube URL</label>
                  <input
                    type="url"
                    value={pipelineUrl}
                    onChange={(e) => setPipelineUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">River (optional)</label>
                    <select
                      value={pipelineRiver}
                      onChange={(e) => setPipelineRiver(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                    >
                      <option value="">Auto-detect</option>
                      {riverOptions.map((river) => (
                        <option key={river.slug} value={river.slug}>{river.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">Heatmap Peak</label>
                    <select
                      value={pipelinePeak}
                      onChange={(e) => setPipelinePeak(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                    >
                      <option value="1">Peak 1 (highest engagement)</option>
                      <option value="2">Peak 2</option>
                      <option value="3">Peak 3</option>
                      <option value="4">Peak 4</option>
                      <option value="5">Peak 5</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={triggerPipeline}
                  disabled={pipelineStatus === 'dispatching'}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  {pipelineStatus === 'dispatching' ? 'Dispatching...' : 'Extract Clip'}
                </button>

                {pipelineStatus && pipelineStatus !== 'dispatching' && (
                  <div
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
                      pipelineStatus === 'dispatched'
                        ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                        : 'bg-red-500/10 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {pipelineStatus === 'dispatched' ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Pipeline dispatched! Clips will appear in the library in a few minutes.
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" />
                        {pipelineStatus}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Pipeline info */}
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">How It Works</h3>
              <ol className="space-y-2 text-sm text-neutral-400 list-decimal list-inside">
                <li>Scrapes YouTube &quot;Most Replayed&quot; heatmap data to find the best moments</li>
                <li>Downloads the video and extracts a clip at the peak engagement timestamp</li>
                <li>Converts landscape clips to 9:16 vertical format with Eddy branding</li>
                <li>Extracts and overlays auto-timed captions from the video transcript</li>
                <li>Uploads to CDN and inserts into the clip library</li>
              </ol>
              <p className="text-xs text-neutral-500 mt-4">
                The pipeline runs daily at 7:00 AM CST via GitHub Actions, or on demand here.
              </p>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            Compile Montage Tab
            ═══════════════════════════════════════════ */}
        {activeTab === 'montage' && (
          <div className="space-y-6">
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Compile Montage / Highlights</h3>
              <p className="text-sm text-neutral-400 mb-6">
                Select clips from the Library tab, then compile them into a montage reel
                with transitions and an Eddy-branded exit card.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">Selected Clips</label>
                  {selectedClips.size === 0 ? (
                    <p className="text-sm text-neutral-500 px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg">
                      No clips selected. Go to the Library tab and check the clips you want.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {Array.from(selectedClips.values()).map((clip) => (
                        <span
                          key={clip.id}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-900 border border-neutral-600 rounded-lg text-sm text-neutral-300"
                        >
                          <Film className="w-3 h-3 text-neutral-500" />
                          {clip.youtube_video_id || clip.id.slice(0, 8)}
                          <button
                            onClick={() => toggleClipSelection(clip)}
                            className="ml-1 text-neutral-500 hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Exit Card Title <span className="text-neutral-500">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={montageTitle}
                    onChange={(e) => setMontageTitle(e.target.value)}
                    placeholder="e.g. Best of This Week"
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <button
                  onClick={compileMontage}
                  disabled={selectedClips.size < 2 || montageStatus === 'dispatching'}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  <Layers className="w-4 h-4" />
                  {montageStatus === 'dispatching'
                    ? 'Dispatching...'
                    : `Compile ${selectedClips.size} Clips`}
                </button>

                {montageStatus && montageStatus !== 'dispatching' && (
                  <div
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
                      montageStatus === 'dispatched'
                        ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                        : 'bg-red-500/10 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {montageStatus === 'dispatched' ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Montage compilation dispatched! The video will be ready in a few minutes.
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        {montageStatus}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            Decision Engine Tab
            ═══════════════════════════════════════════ */}
        {activeTab === 'decisions' && (
          <div className="space-y-6">
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Content Decision Preview</h3>
              <p className="text-sm text-neutral-400 mb-6">
                See what the content decision engine would recommend posting next. This analyzes
                content mix targets, river freshness, clip library, and posting history.
              </p>

              <button
                onClick={fetchDecision}
                disabled={decisionLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                <Lightbulb className="w-4 h-4" />
                {decisionLoading ? 'Analyzing...' : 'What Should We Post?'}
              </button>
            </div>

            {decision && (
              <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 space-y-4">
                <h3 className="text-lg font-semibold text-white">Recommendation</h3>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <DecisionCard label="Format" value={decision.format} />
                  <DecisionCard label="Content Category" value={decision.contentCategory} />
                  <DecisionCard label="Audience" value={decision.audienceSegment} />
                  <DecisionCard label="Hook Style" value={decision.hookStyle} />
                  <DecisionCard label="River" value={decision.riverSlug || 'General'} />
                  <DecisionCard label="Post Type" value={decision.postType} />
                  {decision.montageTheme && (
                    <DecisionCard label="Montage Theme" value={decision.montageTheme} />
                  )}
                  {decision.montageTitle && (
                    <DecisionCard label="Montage Title" value={decision.montageTitle} />
                  )}
                </div>

                <div className="mt-4 p-4 bg-neutral-900 rounded-lg">
                  <p className="text-xs text-neutral-500 uppercase font-medium mb-1">Reasoning</p>
                  <p className="text-sm text-neutral-300">{decision.reasoning}</p>
                </div>

                {decision.clipId && (
                  <div className="text-sm text-neutral-400">
                    Selected clip: <span className="font-mono text-neutral-300">{decision.clipId.slice(0, 8)}...</span>
                  </div>
                )}
                {decision.clipIds.length > 0 && (
                  <div className="text-sm text-neutral-400">
                    Compilation clips: {decision.clipIds.length} selected
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════
            Weekly Review Tab
            ═══════════════════════════════════════════ */}
        {activeTab === 'review' && (
          <div className="space-y-6">
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Weekly Performance Review</h3>
              <p className="text-sm text-neutral-400 mb-6">
                Run the weekly review to analyze engagement, identify top performers,
                and generate editorial guidance for the content decision engine.
              </p>

              <button
                onClick={fetchWeeklyReview}
                disabled={reviewLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                <BarChart3 className="w-4 h-4" />
                {reviewLoading ? 'Running Review...' : 'Run Weekly Review'}
              </button>
            </div>

            {weeklyReview && (
              <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">
                    Review: {weeklyReview.weekStart} &rarr; {weeklyReview.weekEnd}
                  </h3>
                  <span className="text-sm text-neutral-400">
                    {weeklyReview.totalPosts} posts | {weeklyReview.topPerformers} top performers
                  </span>
                </div>

                {weeklyReview.biasGuidance && (
                  <div className="p-4 bg-neutral-900 rounded-lg">
                    <p className="text-xs text-neutral-500 uppercase font-medium mb-2">Editorial Guidance</p>
                    <div className="space-y-1">
                      {weeklyReview.biasGuidance.split('\n').map((line, i) => (
                        <p key={i} className="text-sm text-neutral-300">{line}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════
            Clip Preview Modal
            ═══════════════════════════════════════════ */}
        {previewClip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-neutral-700">
                <h3 className="text-lg font-semibold text-white">Clip Preview</h3>
                <button
                  onClick={() => setPreviewClip(null)}
                  className="p-1 text-neutral-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                {/* Video player */}
                <div className="bg-black rounded-lg overflow-hidden">
                  <video
                    src={previewClip.clip_url}
                    controls
                    className="w-full max-h-[400px]"
                    preload="metadata"
                  />
                </div>

                {/* Metadata grid */}
                <div className="grid gap-3 md:grid-cols-2">
                  <MetadataRow label="Video ID" value={previewClip.youtube_video_id} />
                  <MetadataRow label="Channel" value={previewClip.youtube_channel || previewClip.source_creator || '-'} />
                  <MetadataRow label="River" value={previewClip.river_slug || '-'} />
                  <MetadataRow label="Duration" value={previewClip.duration_secs ? `${previewClip.duration_secs}s` : '-'} />
                  <MetadataRow
                    label="Clip Window"
                    value={
                      previewClip.clip_start_secs != null
                        ? `${previewClip.clip_start_secs}s → ${previewClip.clip_end_secs}s`
                        : '-'
                    }
                  />
                  <MetadataRow label="Orientation" value={previewClip.orientation} />
                  <MetadataRow
                    label="Heatmap Score"
                    value={previewClip.heatmap_score != null ? String(previewClip.heatmap_score) : '-'}
                  />
                  <MetadataRow label="Brand Status" value={previewClip.brand_check_status} />
                </div>

                {/* Brand check error (workflow failure) */}
                {previewClip.brand_check_error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-xs text-red-400 uppercase font-medium mb-1">Brand Check Error</p>
                    <p className="text-sm text-red-300">{previewClip.brand_check_error}</p>
                  </div>
                )}

                {/* Brand check result */}
                {previewClip.brand_check_result && (
                  <div className="p-4 bg-neutral-900 rounded-lg">
                    <p className="text-xs text-neutral-500 uppercase font-medium mb-2">Brand Check Result</p>
                    <pre className="text-sm text-neutral-300 whitespace-pre-wrap font-mono">
                      {JSON.stringify(previewClip.brand_check_result, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Manage: override the verdict + fix the river */}
                <div className="p-4 bg-neutral-900 rounded-lg space-y-3">
                  <p className="text-xs text-neutral-500 uppercase font-medium">Manage</p>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-neutral-400 w-14">River</label>
                    <select
                      value={previewClip.river_slug || ''}
                      onChange={(e) => patchClip(previewClip.id, { river_slug: e.target.value })}
                      disabled={savingClip === previewClip.id}
                      className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm disabled:opacity-40"
                    >
                      <option value="">— none —</option>
                      {riverOptions.map((river) => (
                        <option key={river.slug} value={river.slug}>{river.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {previewClip.brand_check_status !== 'approved' && (
                      <button
                        onClick={() => setClipStatus(previewClip.id, 'approved')}
                        disabled={savingClip === previewClip.id}
                        className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-40"
                      >
                        <CheckCircle className="w-4 h-4" /> Approve
                      </button>
                    )}
                    {previewClip.brand_check_status !== 'rejected' && (
                      <button
                        onClick={() => {
                          if (confirm('Reject this clip? It will not be posted.')) setClipStatus(previewClip.id, 'rejected');
                        }}
                        disabled={savingClip === previewClip.id}
                        className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-40"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    )}
                    <button
                      onClick={() => triggerBrandCheck(previewClip.id)}
                      disabled={brandCheckingClip === previewClip.id}
                      className="flex items-center gap-2 px-3 py-2 bg-neutral-700 text-white rounded-lg text-sm font-medium hover:bg-neutral-600 transition-colors disabled:opacity-40"
                    >
                      <RefreshCw className={`w-4 h-4 ${brandCheckingClip === previewClip.id ? 'animate-spin' : ''}`} />
                      {brandCheckingClip === previewClip.id ? 'Dispatching…' : 'Re-run brand check'}
                    </button>
                  </div>
                  <div className="pt-2 border-t border-neutral-700/50">
                    <p className="text-xs text-neutral-500 uppercase font-medium mb-1.5">Posting</p>
                    {!previewClip.posts || previewClip.posts.length === 0 ? (
                      <p className="text-sm text-neutral-400">Not posted yet — in the backlog.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {previewClip.posts.map((p) => (
                          <div key={p.id} className="text-sm">
                            {p.missing ? (
                              <span className="text-amber-400">
                                ⚠ Orphaned — post {p.id.slice(0, 8)}… no longer exists
                              </span>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-neutral-300">
                                  {PLATFORM_LABEL[p.platform || ''] || p.platform}
                                </span>
                                <span className="flex items-center gap-2">
                                  {p.published_at && (
                                    <span className="text-xs text-neutral-500">
                                      {new Date(p.published_at).toLocaleDateString()}
                                    </span>
                                  )}
                                  <span
                                    className={`px-2 py-0.5 text-xs rounded-full border ${
                                      POST_STATUS_CLASS[p.status || ''] ||
                                      'bg-neutral-700/40 text-neutral-300 border-neutral-600'
                                    }`}
                                  >
                                    {p.status}
                                  </span>
                                </span>
                              </div>
                            )}
                            {p.status === 'failed' && p.error_message && (
                              <p className="text-xs text-red-300/80 mt-0.5">{p.error_message}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {previewClip.brand_check_status === 'pending' && (
                    <button
                      onClick={() => triggerBrandCheck(previewClip.id)}
                      disabled={brandCheckingClip === previewClip.id}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-40"
                    >
                      {brandCheckingClip === previewClip.id
                        ? <RefreshCw className="w-4 h-4 animate-spin" />
                        : <ShieldCheck className="w-4 h-4" />}
                      {brandCheckingClip === previewClip.id ? 'Dispatching…' : 'Run Brand Check'}
                    </button>
                  )}
                  {previewClip.source_url && (
                    <a
                      href={previewClip.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-neutral-700 text-white rounded-lg text-sm font-medium hover:bg-neutral-600 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Source
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// ─── Helper components ───

function DecisionCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-neutral-900 rounded-lg">
      <p className="text-xs text-neutral-500 uppercase font-medium">{label}</p>
      <p className="text-sm text-white mt-0.5 capitalize">{value.replace(/_/g, ' ')}</p>
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-neutral-700/50">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-sm text-neutral-300 font-mono">{value}</span>
    </div>
  );
}
