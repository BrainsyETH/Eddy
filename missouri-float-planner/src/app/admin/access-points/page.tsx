'use client';

// src/app/admin/access-points/page.tsx
// Admin page for managing access point images (supports multiple images)

import { useState } from 'react';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '@/components/admin/AdminLayout';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  MapPin,
  Plus,
  X,
  ChevronDown,
  Search,
  ExternalLink,
  Trash2
} from 'lucide-react';

interface River {
  id: string;
  name: string;
  slug: string;
}

interface AccessPointAdmin {
  id: string;
  name: string;
  riverMile: number;
  type: string;
  imageUrls: string[];
  riverId: string;
}

interface ImageItem {
  id: string;
  name: string;
  url: string;
  category: string;
  isSystem: boolean;
}

const EDDY_PLACEHOLDER = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png';

export default function AdminAccessPointsPage() {
  const queryClient = useQueryClient();
  const [selectedRiver, setSelectedRiver] = useState<string | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState<{ pointId: string; currentImages: string[] } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch rivers
  const { data: rivers, isLoading: riversLoading } = useQuery<River[]>({
    queryKey: ['admin-rivers'],
    queryFn: async () => {
      const response = await fetch('/api/rivers');
      if (!response.ok) throw new Error('Failed to fetch rivers');
      const data = await response.json();
      return data.rivers || [];
    },
  });

  // Fetch access points for selected river
  const { data: accessPoints, isLoading: accessPointsLoading } = useQuery<AccessPointAdmin[]>({
    queryKey: ['admin-access-points', selectedRiver],
    queryFn: async () => {
      if (!selectedRiver) return [];
      const river = rivers?.find(r => r.id === selectedRiver);
      if (!river) return [];

      const response = await fetch(`/api/rivers/${river.slug}/access-points`);
      if (!response.ok) throw new Error('Failed to fetch access points');
      const data = await response.json();
      return data.accessPoints || [];
    },
    enabled: !!selectedRiver && !!rivers,
  });

  // Fetch images for picker
  const { data: imagesData } = useQuery<{ images: ImageItem[] }>({
    queryKey: ['admin-images'],
    queryFn: async () => {
      const response = await fetch('/api/admin/images');
      if (!response.ok) throw new Error('Failed to fetch images');
      return response.json();
    },
  });

  // Update access point images
  const updateImagesMutation = useMutation({
    mutationFn: async ({ id, imageUrls }: { id: string; imageUrls: string[] }) => {
      const response = await fetch(`/api/admin/access-points/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-access-points', selectedRiver] });
    },
  });

  // Add image to an access point
  const addImage = (pointId: string, currentImages: string[], newImageUrl: string) => {
    if (!currentImages.includes(newImageUrl)) {
      updateImagesMutation.mutate({
        id: pointId,
        imageUrls: [...currentImages, newImageUrl],
      });
    }
    setImagePickerOpen(null);
  };

  // Remove image from an access point
  const removeImage = (pointId: string, currentImages: string[], imageToRemove: string) => {
    updateImagesMutation.mutate({
      id: pointId,
      imageUrls: currentImages.filter(url => url !== imageToRemove),
    });
  };

  const filteredAccessPoints = accessPoints?.filter(ap =>
    ap.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const images = imagesData?.images || [];

  return (
    <AdminLayout
      title="Access Points"
      description="Manage images for access points"
    >
      <div className="p-6">
        {/* River Selector */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 mb-6">
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Select River
          </label>
          {riversLoading ? (
            <LoadingSpinner size="sm" />
          ) : (
            <div className="relative">
              <select
                value={selectedRiver || ''}
                onChange={(e) => {
                  setSelectedRiver(e.target.value || null);
                  setSearchTerm('');
                }}
                className="w-full md:w-80 px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Choose a river...</option>
                {rivers?.map(river => (
                  <option key={river.id} value={river.id}>{river.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400 pointer-events-none" />
            </div>
          )}
        </div>

        {/* Access Points List */}
        {selectedRiver && (
          <>
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
              <input
                type="text"
                placeholder="Search access points..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-80 pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {accessPointsLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : filteredAccessPoints.length === 0 ? (
              <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-12 text-center">
                <MapPin className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
                <p className="text-neutral-400">
                  {searchTerm ? 'No access points match your search.' : 'No access points found for this river.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAccessPoints.map((point) => (
                  <div
                    key={point.id}
                    className="bg-neutral-800 border border-neutral-700 rounded-xl p-4"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-white">{point.name}</h3>
                        <p className="text-sm text-neutral-400">
                          Mile {point.riverMile.toFixed(1)} • {point.type.replace('_', ' ')}
                        </p>
                      </div>
                      <span className="text-xs text-neutral-500">
                        {point.imageUrls.length} image{point.imageUrls.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Images Gallery */}
                    <div className="flex gap-2 flex-wrap">
                      {/* Existing Images */}
                      {point.imageUrls.map((url, index) => (
                        <div
                          key={index}
                          className="relative w-24 h-24 rounded-lg overflow-hidden bg-neutral-700 group"
                        >
                          <Image
                            src={url}
                            alt={`${point.name} image ${index + 1}`}
                            fill
                            className="object-cover"
                            sizes="96px"
                          />
                          {/* Remove button */}
                          <button
                            onClick={() => removeImage(point.id, point.imageUrls, url)}
                            disabled={updateImagesMutation.isPending}
                            className="absolute top-1 right-1 p-1 bg-red-600 hover:bg-red-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                            title="Remove image"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}

                      {/* Add Image Button */}
                      <button
                        onClick={() => setImagePickerOpen({ pointId: point.id, currentImages: point.imageUrls })}
                        className="w-24 h-24 rounded-lg border-2 border-dashed border-neutral-600 hover:border-primary-500 flex flex-col items-center justify-center text-neutral-400 hover:text-primary-400 transition-colors"
                      >
                        <Plus className="w-6 h-6" />
                        <span className="text-xs mt-1">Add</span>
                      </button>

                      {/* Placeholder when no images */}
                      {point.imageUrls.length === 0 && (
                        <div className="w-24 h-24 rounded-lg bg-neutral-700 flex items-center justify-center">
                          <Image
                            src={EDDY_PLACEHOLDER}
                            alt="No image"
                            width={48}
                            height={48}
                            className="opacity-30"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!selectedRiver && (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-12 text-center">
            <MapPin className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
            <p className="text-neutral-400">Select a river to manage access point images.</p>
          </div>
        )}

        {/* Image Picker Modal */}
        {imagePickerOpen && (
          <div
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setImagePickerOpen(null)}
          >
            <div
              className="bg-neutral-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-neutral-700">
                <div>
                  <h3 className="font-semibold text-white">Add Image</h3>
                  <p className="text-sm text-neutral-400">
                    Choose an image from your library or enter a URL
                  </p>
                </div>
                <button
                  onClick={() => setImagePickerOpen(null)}
                  className="p-2 hover:bg-neutral-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-neutral-300" />
                </button>
              </div>

              {/* Custom URL Input */}
              <div className="p-4 border-b border-neutral-700">
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Enter image URL:
                </label>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const url = formData.get('customUrl') as string;
                    if (url && imagePickerOpen) {
                      addImage(imagePickerOpen.pointId, imagePickerOpen.currentImages, url);
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="url"
                    name="customUrl"
                    placeholder="https://example.com/image.jpg"
                    className="flex-1 px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    type="submit"
                    disabled={updateImagesMutation.isPending}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {updateImagesMutation.isPending ? 'Adding...' : 'Add URL'}
                  </button>
                </form>
              </div>

              {/* Image Grid */}
              <div className="flex-1 overflow-y-auto p-4">
                <p className="text-sm text-neutral-400 mb-3">Or select from library:</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {images.map((image) => {
                    const isAlreadyAdded = imagePickerOpen.currentImages.includes(image.url);
                    return (
                      <button
                        key={image.id}
                        onClick={() => {
                          if (!isAlreadyAdded && imagePickerOpen) {
                            addImage(imagePickerOpen.pointId, imagePickerOpen.currentImages, image.url);
                          }
                        }}
                        disabled={updateImagesMutation.isPending || isAlreadyAdded}
                        className={`aspect-square relative bg-neutral-700 rounded-lg overflow-hidden transition-all ${
                          isAlreadyAdded
                            ? 'opacity-50 cursor-not-allowed ring-2 ring-green-500'
                            : 'hover:ring-2 hover:ring-primary-500'
                        }`}
                      >
                        <Image
                          src={image.url}
                          alt={image.name}
                          fill
                          className="object-contain p-1"
                          sizes="100px"
                        />
                        {image.isSystem && (
                          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-primary-600 text-white text-[10px] rounded">
                            System
                          </div>
                        )}
                        {isAlreadyAdded && (
                          <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                            <span className="text-green-400 text-xs font-medium">Added</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {images.length === 0 && (
                  <div className="text-center py-8 text-neutral-500">
                    <p>No images in library.</p>
                    <a
                      href="/admin/images"
                      className="text-primary-400 hover:underline inline-flex items-center gap-1 mt-2"
                    >
                      Upload images <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
