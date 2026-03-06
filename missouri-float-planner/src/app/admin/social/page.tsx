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
} from 'lucide-react';

type Tab = 'settings' | 'filters' | 'content' | 'history';

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

const ALL_RIVERS = [
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
  { code: 'optimal', label: 'Optimal', color: 'bg-emerald-500' },
  { code: 'okay', label: 'Okay', color: 'bg-lime-500' },
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
  skipped: { label: 'Skipped', className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

export default function SocialAdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('settings');
  const [config, setConfig] = useState<SocialConfig | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [customContent, setCustomContent] = useState<CustomContent[]>([]);
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

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchConfig = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/social/config');
      if (res.ok) {
        setConfig(await res.json());
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

      const res = await adminFetch(`/api/admin/social/posts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    }
  }, [postFilter]);

  const fetchContent = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/social/content');
      if (res.ok) {
        setCustomContent(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch content:', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchConfig(), fetchPosts(), fetchContent()]).finally(() =>
      setLoading(false)
    );
  }, [fetchConfig, fetchPosts, fetchContent]);

  useEffect(() => {
    fetchPosts();
  }, [postFilter, fetchPosts]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/social/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setConfig(await res.json());
        showToast('Settings saved successfully', 'success');
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
      <div className="p-6 max-w-5xl mx-auto">
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

                {/* Frequency & Timing */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Frequency & Timing</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">Posting Frequency</label>
                      <select
                        value={config.posting_frequency_hours}
                        onChange={(e) => setConfig({ ...config, posting_frequency_hours: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                      >
                        <option value={4}>Every 4 hours</option>
                        <option value={6}>Every 6 hours</option>
                        <option value={8}>Every 8 hours</option>
                        <option value={12}>Every 12 hours</option>
                        <option value={24}>Once daily</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">Daily Digest Time (UTC)</label>
                      <input
                        type="time"
                        value={config.digest_time_utc}
                        onChange={(e) => setConfig({ ...config, digest_time_utc: e.target.value })}
                        className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">Max Highlights Per Run</label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={config.highlights_per_run}
                        onChange={(e) => setConfig({ ...config, highlights_per_run: parseInt(e.target.value) || 2 })}
                        className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">Highlight Cooldown (hours)</label>
                      <input
                        type="number"
                        min={6}
                        max={48}
                        value={config.highlight_cooldown_hours}
                        onChange={(e) => setConfig({ ...config, highlight_cooldown_hours: parseInt(e.target.value) || 12 })}
                        className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="flex items-center gap-2 text-sm text-neutral-300">
                      <input
                        type="checkbox"
                        checked={config.digest_enabled}
                        onChange={(e) => setConfig({ ...config, digest_enabled: e.target.checked })}
                        className="rounded bg-neutral-900 border-neutral-600"
                      />
                      Enable daily digest posts
                    </label>
                  </div>
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
                    {ALL_RIVERS.map((river) => {
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
                                  {post.post_type === 'daily_digest' ? 'Digest' : 'Highlight'}
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
                                  {post.caption.slice(0, 80)}...
                                </td>
                                <td className="px-4 py-3">
                                  {post.status === 'failed' && (
                                    <button
                                      onClick={() => retryPost(post.id)}
                                      className="flex items-center gap-1 px-2 py-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded transition-colors"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      Retry
                                    </button>
                                  )}
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
