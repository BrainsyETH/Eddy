'use client';

// src/app/admin/images/page.tsx
// Admin image library page

import { useState, useRef } from 'react';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '@/components/admin/AdminLayout';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  Upload,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Image as ImageIcon,
  X,
  Filter
} from 'lucide-react';

interface ImageItem {
  id: string;
  name: string;
  url: string;
  category: string;
  isSystem: boolean;
  createdAt?: string;
  size?: number;
}

interface ImagesResponse {
  images: ImageItem[];
  bucketExists: boolean;
}

const CATEGORIES = [
  { value: 'all', label: 'All Images' },
  { value: 'eddy', label: 'Eddy Otter' },
  { value: 'rivers', label: 'Rivers' },
  { value: 'access-points', label: 'Access Points' },
  { value: 'general', label: 'General' },
];

export default function AdminImagesPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [uploadCategory, setUploadCategory] = useState('general');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<ImageItem | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Fetch images
  const { data, isLoading, error } = useQuery<ImagesResponse>({
    queryKey: ['admin-images'],
    queryFn: async () => {
      const response = await fetch('/api/admin/images');
      if (!response.ok) throw new Error('Failed to fetch images');
      return response.json();
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', uploadCategory);

      const response = await fetch('/api/admin/images', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-images'] });
      setUploadError(null);
    },
    onError: (error: Error) => {
      setUploadError(error.message);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (imageId: string) => {
      const response = await fetch(`/api/admin/images/${encodeURIComponent(imageId)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Delete failed');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-images'] });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleDelete = (image: ImageItem) => {
    if (image.isSystem) return;
    if (confirm(`Delete "${image.name}"?`)) {
      deleteMutation.mutate(image.id);
    }
  };

  // Filter images by category
  const filteredImages = data?.images.filter(img =>
    selectedCategory === 'all' || img.category === selectedCategory
  ) || [];

  return (
    <AdminLayout
      title="Image Library"
      description="Upload and manage images for the float planner"
    >
      <div className="p-6">
        {/* Upload Section */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Upload Image</h2>

          {!data?.bucketExists && (
            <div className="bg-amber-900/20 border border-amber-700 text-amber-200 p-4 rounded-lg mb-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Storage bucket not configured</p>
                <p className="text-sm mt-1">
                  Create an &quot;images&quot; bucket in your Supabase Storage to enable uploads.
                  Make sure to set it as public for images to be accessible.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Category
              </label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {CATEGORIES.filter(c => c.value !== 'all' && c.value !== 'eddy').map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium cursor-pointer transition-colors ${
                  data?.bucketExists
                    ? 'bg-primary-500 hover:bg-primary-600 text-white'
                    : 'bg-neutral-600 text-neutral-400 cursor-not-allowed'
                }`}
              >
                {uploadMutation.isPending ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Upload className="w-5 h-5" />
                )}
                {uploadMutation.isPending ? 'Uploading...' : 'Choose File'}
              </label>
            </div>

            <p className="text-sm text-neutral-400">
              Max 5MB. Supports JPEG, PNG, WebP, GIF.
            </p>
          </div>

          {uploadError && (
            <div className="mt-4 bg-red-900/20 border border-red-700 text-red-200 p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {uploadError}
            </div>
          )}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2 text-neutral-400">
            <Filter className="w-4 h-4" />
            <span className="text-sm">Filter:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === cat.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Images Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-700 text-red-200 p-4 rounded-lg">
            Failed to load images. Please try again.
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-12 text-center">
            <ImageIcon className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
            <p className="text-neutral-400">No images found in this category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredImages.map((image) => (
              <div
                key={image.id}
                className="bg-neutral-800 border border-neutral-700 rounded-lg overflow-hidden group"
              >
                <div
                  className="aspect-square relative bg-neutral-700 cursor-pointer"
                  onClick={() => setPreviewImage(image)}
                >
                  <Image
                    src={image.url}
                    alt={image.name}
                    fill
                    className="object-contain p-2"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  />

                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyUrl(image.url);
                      }}
                      className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                      title="Copy URL"
                    >
                      {copiedUrl === image.url ? (
                        <Check className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5 text-white" />
                      )}
                    </button>

                    {!image.isSystem && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(image);
                        }}
                        className="p-2 bg-red-500/50 hover:bg-red-500/70 rounded-lg transition-colors"
                        title="Delete"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-5 h-5 text-white" />
                      </button>
                    )}
                  </div>

                  {/* System badge */}
                  {image.isSystem && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-primary-600 text-white text-xs rounded">
                      System
                    </div>
                  )}
                </div>

                <div className="p-2">
                  <p className="text-xs text-neutral-300 truncate" title={image.name}>
                    {image.name}
                  </p>
                  <p className="text-xs text-neutral-500 capitalize">
                    {image.category}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Preview Modal */}
        {previewImage && (
          <div
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setPreviewImage(null)}
          >
            <div
              className="bg-neutral-800 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-neutral-700">
                <div>
                  <h3 className="font-semibold text-white">{previewImage.name}</h3>
                  <p className="text-sm text-neutral-400 capitalize">{previewImage.category}</p>
                </div>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="p-2 hover:bg-neutral-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-neutral-300" />
                </button>
              </div>

              <div className="p-4 bg-neutral-900 flex items-center justify-center">
                <Image
                  src={previewImage.url}
                  alt={previewImage.name}
                  width={600}
                  height={600}
                  className="max-h-[60vh] w-auto object-contain"
                />
              </div>

              <div className="p-4 border-t border-neutral-700">
                <p className="text-xs text-neutral-400 mb-2">Image URL:</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={previewImage.url}
                    readOnly
                    className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-sm text-neutral-300"
                  />
                  <button
                    onClick={() => handleCopyUrl(previewImage.url)}
                    className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg flex items-center gap-2 transition-colors"
                  >
                    {copiedUrl === previewImage.url ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
