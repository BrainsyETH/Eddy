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
  X,
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
  source_creator: string | null;
  source_url: string | null;
  content_tags: string[];
  content_type: string | null;
  tone: string | null;
  used_in_posts: string[];
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

const BRAND_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  approved: { label: 'Approved', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  rejected: { label: 'Rejected', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  review: { label: 'In Review', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
};

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
  const [clipCount, setClipCount] = useState(0);
  const [clipFilter, setClipFilter] = useState({ brand_status: '', river_slug: '' });
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
  const [previewClip, setPreviewClip] = useState<ClipItem | null>(null);

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
      params.set('limit', '50');

      const res = await adminFetch(`/api/admin/clips?${params}`);
      if (res.ok) {
        const data = await res.json();
        setClips(data.clips || []);
        setClipCount(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch clips:', err);
    } finally {
      setLoading(false);
    }
  }, [clipFilter]);

  useEffect(() => {
    if (activeTab === 'library') fetchClips();
  }, [activeTab, fetchClips]);

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
    try {
      const res = await adminFetch('/api/admin/clips/brand-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId }),
      });
      if (res.ok) {
        // Update local state
        setClips((prev) =>
          prev.map((c) => (c.id === clipId ? { ...c, brand_check_status: 'review' } : c)),
        );
      }
    } catch (err) {
      console.error('Brand check failed:', err);
    }
  };

  // ─── Compile montage ───
  const compileMontage = async () => {
    const ids = Array.from(selectedClips);
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
        setSelectedClips(new Set());
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
  const toggleClipSelection = (id: string) => {
    setSelectedClips((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
                onChange={(e) => setClipFilter({ ...clipFilter, brand_status: e.target.value })}
                className="px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="review">In Review</option>
              </select>
              <select
                value={clipFilter.river_slug}
                onChange={(e) => setClipFilter({ ...clipFilter, river_slug: e.target.value })}
                className="px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
              >
                <option value="">All Rivers</option>
                <option value="meramec">Meramec River</option>
                <option value="current">Current River</option>
                <option value="eleven-point">Eleven Point River</option>
                <option value="jacks-fork">Jacks Fork River</option>
                <option value="niangua">Niangua River</option>
                <option value="big-piney">Big Piney River</option>
                <option value="huzzah">Huzzah Creek</option>
                <option value="courtois">Courtois Creek</option>
              </select>
              <button
                onClick={fetchClips}
                disabled={loading}
                className="p-2 text-neutral-400 hover:text-white transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <span className="text-sm text-neutral-400 ml-auto">
                {clipCount} clip{clipCount !== 1 ? 's' : ''}
                {selectedClips.size > 0 && (
                  <span className="ml-2 text-primary-400">
                    ({selectedClips.size} selected)
                  </span>
                )}
              </span>
            </div>

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
                            checked={selectedClips.size === clips.length && clips.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedClips(new Set(clips.map((c) => c.id)));
                              } else {
                                setSelectedClips(new Set());
                              }
                            }}
                            className="rounded bg-neutral-900 border-neutral-600"
                          />
                        </th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Source</th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">River</th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Duration</th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Score</th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Brand</th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Added</th>
                        <th className="text-left text-xs font-medium text-neutral-400 uppercase px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clips.map((clip) => {
                        const badge = BRAND_BADGES[clip.brand_check_status] || BRAND_BADGES.pending;
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
                                onChange={() => toggleClipSelection(clip.id)}
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
                                {badge.label}
                              </span>
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
                                    className="p-1.5 text-neutral-400 hover:text-green-400 transition-colors"
                                    title="Run brand check"
                                  >
                                    <ShieldCheck className="w-4 h-4" />
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
                      <option value="meramec">Meramec River</option>
                      <option value="current">Current River</option>
                      <option value="eleven-point">Eleven Point River</option>
                      <option value="jacks-fork">Jacks Fork River</option>
                      <option value="niangua">Niangua River</option>
                      <option value="big-piney">Big Piney River</option>
                      <option value="huzzah">Huzzah Creek</option>
                      <option value="courtois">Courtois Creek</option>
                      <option value="gasconade">Gasconade River</option>
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
                      {Array.from(selectedClips).map((id) => {
                        const clip = clips.find((c) => c.id === id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-900 border border-neutral-600 rounded-lg text-sm text-neutral-300"
                          >
                            <Film className="w-3 h-3 text-neutral-500" />
                            {clip?.youtube_video_id || id.slice(0, 8)}
                            <button
                              onClick={() => toggleClipSelection(id)}
                              className="ml-1 text-neutral-500 hover:text-red-400"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
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

                {/* Brand check result */}
                {previewClip.brand_check_result && (
                  <div className="p-4 bg-neutral-900 rounded-lg">
                    <p className="text-xs text-neutral-500 uppercase font-medium mb-2">Brand Check Result</p>
                    <pre className="text-sm text-neutral-300 whitespace-pre-wrap font-mono">
                      {JSON.stringify(previewClip.brand_check_result, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {previewClip.brand_check_status === 'pending' && (
                    <button
                      onClick={() => {
                        triggerBrandCheck(previewClip.id);
                        setPreviewClip(null);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Run Brand Check
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
