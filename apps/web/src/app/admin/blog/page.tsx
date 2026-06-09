'use client';

// src/app/admin/blog/page.tsx
// Admin blog management page with list and editor

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';
import AdminLayout from '@/components/admin/AdminLayout';
import RichTextEditor from '@/components/admin/RichTextEditor';
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Calendar,
  Clock,
  Save,
  X,
  ExternalLink,
  Upload,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  content: string | null;
  category: string;
  featuredImageUrl: string | null;
  ogImageUrl: string | null;
  metaKeywords: string[] | null;
  readTimeMinutes: number | null;
  status: 'draft' | 'published' | 'scheduled';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = ['Guides', 'Tips', 'News', 'Safety', 'River Profiles', 'Gear Reviews', 'Trip Reports'];

const STATUS_COLORS = {
  draft: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  published: 'bg-green-500/20 text-green-300 border-green-500/30',
  scheduled: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
};

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    content: '',
    category: 'Guides',
    featuredImageUrl: '',
    ogImageUrl: '',
    metaKeywords: '',
    readTimeMinutes: '',
    status: 'draft' as 'draft' | 'published' | 'scheduled',
    publishedAt: '',
  });

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminFetch('/api/admin/blog');
      if (!response.ok) {
        throw new Error('Failed to fetch posts');
      }
      const data = await response.json();
      setPosts(data.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const openEditor = (post?: BlogPost) => {
    if (post) {
      setEditingPost(post);
      setFormData({
        title: post.title,
        slug: post.slug,
        description: post.description || '',
        content: post.content || '',
        category: post.category,
        featuredImageUrl: post.featuredImageUrl || '',
        ogImageUrl: post.ogImageUrl || '',
        metaKeywords: post.metaKeywords?.join(', ') || '',
        readTimeMinutes: post.readTimeMinutes?.toString() || '',
        status: post.status,
        publishedAt: post.publishedAt ? new Date(post.publishedAt).toISOString().slice(0, 16) : '',
      });
      setIsCreating(false);
    } else {
      setEditingPost(null);
      setFormData({
        title: '',
        slug: '',
        description: '',
        content: '',
        category: 'Guides',
        featuredImageUrl: '',
        ogImageUrl: '',
        metaKeywords: '',
        readTimeMinutes: '',
        status: 'draft',
        publishedAt: '',
      });
      setIsCreating(true);
    }
  };

  const closeEditor = () => {
    setEditingPost(null);
    setIsCreating(false);
    setFormData({
      title: '',
      slug: '',
      description: '',
      content: '',
      category: 'Guides',
      featuredImageUrl: '',
      ogImageUrl: '',
      metaKeywords: '',
      readTimeMinutes: '',
      status: 'draft',
      publishedAt: '',
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const payload = {
        title: formData.title,
        slug: formData.slug || generateSlug(formData.title),
        description: formData.description || null,
        content: formData.content || null,
        category: formData.category,
        featuredImageUrl: formData.featuredImageUrl || null,
        ogImageUrl: formData.ogImageUrl || null,
        metaKeywords: formData.metaKeywords
          ? formData.metaKeywords.split(',').map((k) => k.trim()).filter(Boolean)
          : null,
        readTimeMinutes: formData.readTimeMinutes ? parseInt(formData.readTimeMinutes, 10) : null,
        status: formData.status,
        publishedAt: formData.publishedAt ? new Date(formData.publishedAt).toISOString() : null,
      };

      const url = editingPost
        ? `/api/admin/blog/${editingPost.id}`
        : '/api/admin/blog';
      const method = editingPost ? 'PUT' : 'POST';

      const response = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save post');
      }

      await fetchPosts();
      closeEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post: BlogPost) => {
    if (!confirm(`Are you sure you want to delete "${post.title}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await adminFetch(`/api/admin/blog/${post.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete post');
      }

      await fetchPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleImageUpload = async (): Promise<string | null> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        try {
          const formData = new FormData();
          formData.append('files', file);

          const response = await adminFetch('/api/admin/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Upload failed');
          }

          const data = await response.json();
          if (data.urls && data.urls.length > 0) {
            resolve(data.urls[0]);
          } else {
            resolve(null);
          }
        } catch (error) {
          console.error('Upload error:', error);
          resolve(null);
        }
      };
      input.click();
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Editor view
  if (editingPost || isCreating) {
    return (
      <AdminLayout
        title={isCreating ? 'Create New Post' : 'Edit Post'}
        description={isCreating ? 'Create a new blog post' : `Editing: ${editingPost?.title}`}
      >
        <div className="p-6 space-y-6 max-w-6xl">
          {error && (
            <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {/* Header actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={closeEditor}
              className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
              Cancel
            </button>
            <div className="flex items-center gap-3">
              {editingPost && (
                <a
                  href={`/blog/${editingPost.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 text-neutral-300 hover:text-white transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Preview
                </a>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !formData.title}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Main editor grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Content area - 2 columns */}
            <div className="lg:col-span-2 space-y-6">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      title: e.target.value,
                      slug: formData.slug || generateSlug(e.target.value),
                    });
                  }}
                  className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-lg placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Post title..."
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Description (for SEO and cards)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="A brief description of the post..."
                />
              </div>

              {/* Content editor */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Content
                </label>
                <RichTextEditor
                  content={formData.content}
                  onChange={(content) => setFormData({ ...formData, content })}
                  placeholder="Start writing your blog post..."
                  onImageUpload={handleImageUpload}
                />
              </div>
            </div>

            {/* Sidebar - 1 column */}
            <div className="space-y-6">
              {/* Status & Publishing */}
              <div className="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Publishing
                </h3>

                {/* Status */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({
                      ...formData,
                      status: e.target.value as 'draft' | 'published' | 'scheduled',
                    })}
                    className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </div>

                {/* Publish date */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-300 mb-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Publish Date
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.publishedAt}
                    onChange={(e) => setFormData({ ...formData, publishedAt: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                {/* Read time */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Read Time (minutes)
                  </label>
                  <input
                    type="number"
                    value={formData.readTimeMinutes}
                    onChange={(e) => setFormData({ ...formData, readTimeMinutes: e.target.value })}
                    min="1"
                    className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Auto-calculated if empty"
                  />
                </div>
              </div>

              {/* Category & URL */}
              <div className="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
                <h3 className="text-lg font-semibold text-white mb-4">Details</h3>

                {/* Category */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Slug */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    URL Slug
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: generateSlug(e.target.value) })}
                    className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="url-friendly-slug"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    /blog/{formData.slug || 'your-post-slug'}
                  </p>
                </div>
              </div>

              {/* Images */}
              <div className="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  Images
                </h3>

                {/* Featured image */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Featured Image URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={formData.featuredImageUrl}
                      onChange={(e) => setFormData({ ...formData, featuredImageUrl: e.target.value })}
                      className="flex-1 px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="https://..."
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const url = await handleImageUpload();
                        if (url) {
                          setFormData({ ...formData, featuredImageUrl: url });
                        }
                      }}
                      className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg transition-colors"
                      title="Upload image"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                  </div>
                  {formData.featuredImageUrl && (
                    <img
                      src={formData.featuredImageUrl}
                      alt="Featured"
                      className="mt-2 w-full h-32 object-cover rounded-lg"
                    />
                  )}
                </div>

                {/* OG image */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Social Share Image URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={formData.ogImageUrl}
                      onChange={(e) => setFormData({ ...formData, ogImageUrl: e.target.value })}
                      className="flex-1 px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="https://..."
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const url = await handleImageUpload();
                        if (url) {
                          setFormData({ ...formData, ogImageUrl: url });
                        }
                      }}
                      className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg transition-colors"
                      title="Upload image"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* SEO */}
              <div className="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
                <h3 className="text-lg font-semibold text-white mb-4">SEO</h3>

                {/* Keywords */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Meta Keywords
                  </label>
                  <textarea
                    value={formData.metaKeywords}
                    onChange={(e) => setFormData({ ...formData, metaKeywords: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="keyword1, keyword2, keyword3..."
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Comma-separated list of keywords
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // List view
  return (
    <AdminLayout
      title="Blog Posts"
      description="Manage your blog posts"
    >
      <div className="p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="text-neutral-400">
            {posts.length} {posts.length === 1 ? 'post' : 'posts'}
          </div>
          <button
            onClick={() => openEditor()}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            New Post
          </button>
        </div>

        {/* Posts list */}
        {loading ? (
          <div className="text-center py-12 text-neutral-400">Loading posts...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
            <p className="text-neutral-400 mb-4">No blog posts yet</p>
            <button
              onClick={() => openEditor()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              Create your first post
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <div
                key={post.id}
                className="bg-neutral-800 rounded-lg p-4 border border-neutral-700 hover:border-neutral-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${STATUS_COLORS[post.status]}`}>
                        {post.status === 'published' ? (
                          <Eye className="w-3 h-3 inline mr-1" />
                        ) : post.status === 'scheduled' ? (
                          <Calendar className="w-3 h-3 inline mr-1" />
                        ) : (
                          <EyeOff className="w-3 h-3 inline mr-1" />
                        )}
                        {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
                      </span>
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-neutral-700 text-neutral-300">
                        {post.category}
                      </span>
                      {post.readTimeMinutes && (
                        <span className="text-xs text-neutral-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {post.readTimeMinutes} min read
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1 truncate">
                      {post.title}
                    </h3>
                    {post.description && (
                      <p className="text-sm text-neutral-400 line-clamp-2 mb-2">
                        {post.description}
                      </p>
                    )}
                    <div className="text-xs text-neutral-500">
                      {post.status === 'published' && post.publishedAt ? (
                        <>Published {formatDate(post.publishedAt)}</>
                      ) : post.status === 'scheduled' && post.publishedAt ? (
                        <>Scheduled for {formatDate(post.publishedAt)}</>
                      ) : (
                        <>Last updated {formatDate(post.updatedAt)}</>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {post.status === 'published' && (
                      <a
                        href={`/blog/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors"
                        title="View post"
                      >
                        <ExternalLink className="w-5 h-5" />
                      </a>
                    )}
                    <button
                      onClick={() => openEditor(post)}
                      className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors"
                      title="Edit post"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(post)}
                      className="p-2 text-neutral-400 hover:text-red-400 hover:bg-neutral-700 rounded-lg transition-colors"
                      title="Delete post"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
