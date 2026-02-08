'use client';

// src/app/admin/access-points/[id]/page.tsx
// Comprehensive access point editor with all detail fields

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch } from '@/hooks/useAdminAuth';
import AdminLayout from '@/components/admin/AdminLayout';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  ExternalLink,
  MapPin,
  Car,
  ParkingCircle,
  Building,
  Users,
  FileText,
} from 'lucide-react';

// Types
interface NearbyService {
  name: string;
  type: 'outfitter' | 'campground' | 'canoe_rental' | 'shuttle' | 'lodging';
  phone?: string;
  website?: string;
  distance?: string;
  notes?: string;
}

interface AccessPointData {
  id: string;
  name: string;
  slug: string;
  riverId: string;
  riverName: string;
  riverSlug: string;
  riverMile: number | null;
  type: string;
  types: string[];
  isPublic: boolean;
  ownership: string | null;
  description: string | null;
  parkingInfo: string | null;
  roadAccess: string | null;
  facilities: string | null;
  feeRequired: boolean;
  directionsOverride: string | null;
  drivingLat: number | null;
  drivingLng: number | null;
  imageUrls: string[];
  googleMapsUrl: string | null;
  approved: boolean;
  // New detail fields
  roadSurface: string[];
  parkingCapacity: string | null;
  managingAgency: string | null;
  officialSiteUrl: string | null;
  localTips: string | null;
  nearbyServices: NearbyService[];
}

const ROAD_SURFACE_OPTIONS = [
  { value: 'paved', label: 'Paved' },
  { value: 'gravel_maintained', label: 'Gravel (maintained)' },
  { value: 'gravel_unmaintained', label: 'Gravel (unmaintained)' },
  { value: 'dirt', label: 'Dirt' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: '4wd_required', label: '4WD Required' },
];

const PARKING_CAPACITY_OPTIONS = [
  { value: '', label: 'Unknown' },
  { value: '5', label: '~5 vehicles' },
  { value: '10', label: '~10 vehicles' },
  { value: '15', label: '~15 vehicles' },
  { value: '20', label: '~20 vehicles' },
  { value: '25', label: '~25 vehicles' },
  { value: '30', label: '~30 vehicles' },
  { value: '50+', label: '50+ vehicles' },
  { value: 'roadside', label: 'Roadside only' },
  { value: 'limited', label: 'Limited' },
];

const MANAGING_AGENCY_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'MDC', label: 'MDC - Missouri Dept. of Conservation' },
  { value: 'NPS', label: 'NPS - National Park Service' },
  { value: 'USFS', label: 'USFS - U.S. Forest Service' },
  { value: 'COE', label: 'COE - Army Corps of Engineers' },
  { value: 'State Park', label: 'Missouri State Parks' },
  { value: 'County', label: 'County' },
  { value: 'Municipal', label: 'Municipal' },
  { value: 'Private', label: 'Private' },
];

const SERVICE_TYPE_OPTIONS = [
  { value: 'outfitter', label: 'Outfitter' },
  { value: 'campground', label: 'Campground' },
  { value: 'canoe_rental', label: 'Canoe/Kayak Rental' },
  { value: 'shuttle', label: 'Shuttle Service' },
  { value: 'lodging', label: 'Lodging' },
];

export default function AdminAccessPointEditPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const id = params.id as string;

  // Form state
  const [formData, setFormData] = useState<Partial<AccessPointData>>({});
  const [nearbyServices, setNearbyServices] = useState<NearbyService[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch access point data
  const { data, isLoading, error } = useQuery<{ accessPoint: AccessPointData }>({
    queryKey: ['admin-access-point', id],
    queryFn: async () => {
      const response = await adminFetch(`/api/admin/access-points/${id}`);
      if (!response.ok) throw new Error('Failed to fetch access point');
      return response.json();
    },
    enabled: !!id,
  });

  // Initialize form when data loads
  useEffect(() => {
    if (data?.accessPoint) {
      setFormData(data.accessPoint);
      setNearbyServices(data.accessPoint.nearbyServices || []);
    }
  }, [data]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const response = await adminFetch(`/api/admin/access-points/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-access-point', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-access-points'] });
      setHasChanges(false);
    },
  });

  // Handle form field changes
  const updateField = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  // Handle road surface toggle
  const toggleRoadSurface = (surface: string) => {
    const current = formData.roadSurface || [];
    const updated = current.includes(surface)
      ? current.filter((s) => s !== surface)
      : [...current, surface];
    updateField('roadSurface', updated);
  };

  // Handle nearby service updates
  const updateNearbyService = (index: number, field: string, value: string) => {
    const updated = [...nearbyServices];
    updated[index] = { ...updated[index], [field]: value };
    setNearbyServices(updated);
    setHasChanges(true);
  };

  const addNearbyService = () => {
    setNearbyServices([...nearbyServices, { name: '', type: 'outfitter' }]);
    setHasChanges(true);
  };

  const removeNearbyService = (index: number) => {
    setNearbyServices(nearbyServices.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  // Save all changes
  const handleSave = () => {
    saveMutation.mutate({
      ...formData,
      nearbyServices: nearbyServices.filter((s) => s.name.trim()),
    });
  };

  if (isLoading) {
    return (
      <AdminLayout title="Loading..." description="">
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="lg" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !data?.accessPoint) {
    return (
      <AdminLayout title="Error" description="">
        <div className="p-6 text-center">
          <p className="text-red-400 mb-4">Failed to load access point</p>
          <Link href="/admin/access-points" className="text-primary-400 hover:underline">
            ← Back to access points
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const ap = data.accessPoint;

  return (
    <AdminLayout
      title={`Edit: ${ap.name}`}
      description={`${ap.riverName} · Mile ${ap.riverMile?.toFixed(1) || 'N/A'}`}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/admin/access-points"
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to list
          </Link>

          <div className="flex items-center gap-3">
            {hasChanges && (
              <span className="text-sm text-amber-400">Unsaved changes</span>
            )}
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending || !hasChanges}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg transition-colors"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Success/Error Messages */}
        {saveMutation.isSuccess && (
          <div className="mb-6 p-3 bg-green-900/50 border border-green-700 rounded-lg text-green-300 text-sm">
            Changes saved successfully!
          </div>
        )}
        {saveMutation.isError && (
          <div className="mb-6 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
            Error: {saveMutation.error?.message || 'Failed to save'}
          </div>
        )}

        <div className="space-y-6">
          {/* Road Access Section */}
          <FormSection icon={<Car className="w-5 h-5" />} title="Road Access">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Road Surface (select all that apply)
                </label>
                <div className="flex flex-wrap gap-2">
                  {ROAD_SURFACE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleRoadSurface(option.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        (formData.roadSurface || []).includes(option.value)
                          ? 'bg-primary-600 text-white'
                          : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Road Details
                </label>
                <textarea
                  value={formData.roadAccess || ''}
                  onChange={(e) => updateField('roadAccess', e.target.value)}
                  placeholder="e.g., Last 2 mi is unmaintained gravel. Cattle gate at turn-off."
                  rows={3}
                  className="w-full px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </FormSection>

          {/* Parking Section */}
          <FormSection icon={<ParkingCircle className="w-5 h-5" />} title="Parking">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Parking Capacity
                </label>
                <select
                  value={formData.parkingCapacity || ''}
                  onChange={(e) => updateField('parkingCapacity', e.target.value || null)}
                  className="w-full md:w-64 px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {PARKING_CAPACITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Parking Details
                </label>
                <textarea
                  value={formData.parkingInfo || ''}
                  onChange={(e) => updateField('parkingInfo', e.target.value)}
                  placeholder="e.g., Gravel lot with turnaround loop. Fills by 9:30am on summer Saturdays."
                  rows={3}
                  className="w-full px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </FormSection>

          {/* Facilities Section */}
          <FormSection icon={<Building className="w-5 h-5" />} title="Facilities">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Managing Agency
                </label>
                <select
                  value={formData.managingAgency || ''}
                  onChange={(e) => updateField('managingAgency', e.target.value || null)}
                  className="w-full md:w-80 px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {MANAGING_AGENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Official Site URL
                  <span className="text-neutral-500 font-normal ml-2">
                    (deep link to specific facility page)
                  </span>
                </label>
                <input
                  type="url"
                  value={formData.officialSiteUrl || ''}
                  onChange={(e) => updateField('officialSiteUrl', e.target.value)}
                  placeholder="https://mdc.mo.gov/discover-nature/places/..."
                  className="w-full px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Facility Details
                </label>
                <textarea
                  value={formData.facilities || ''}
                  onChange={(e) => updateField('facilities', e.target.value)}
                  placeholder="e.g., Vault toilet (seasonal). Primitive camping, no fee. No water - pack in."
                  rows={3}
                  className="w-full px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </FormSection>

          {/* Outfitters Section */}
          <FormSection icon={<Users className="w-5 h-5" />} title="Nearby Outfitters & Campgrounds">
            <div className="space-y-4">
              {nearbyServices.map((service, index) => (
                <div
                  key={index}
                  className="p-4 bg-neutral-900 border border-neutral-700 rounded-lg"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-medium text-neutral-400">
                      Service #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeNearbyService(index)}
                      className="p-1 text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">Name *</label>
                      <input
                        type="text"
                        value={service.name}
                        onChange={(e) => updateNearbyService(index, 'name', e.target.value)}
                        placeholder="Ozark Outdoors"
                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">Type *</label>
                      <select
                        value={service.type}
                        onChange={(e) => updateNearbyService(index, 'type', e.target.value)}
                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        {SERVICE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={service.phone || ''}
                        onChange={(e) => updateNearbyService(index, 'phone', e.target.value)}
                        placeholder="(573) 245-6514"
                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">Distance</label>
                      <input
                        type="text"
                        value={service.distance || ''}
                        onChange={(e) => updateNearbyService(index, 'distance', e.target.value)}
                        placeholder="2 mi"
                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs text-neutral-500 mb-1">Website</label>
                      <input
                        type="url"
                        value={service.website || ''}
                        onChange={(e) => updateNearbyService(index, 'website', e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs text-neutral-500 mb-1">Notes</label>
                      <input
                        type="text"
                        value={service.notes || ''}
                        onChange={(e) => updateNearbyService(index, 'notes', e.target.value)}
                        placeholder="Weekends only after Labor Day"
                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addNearbyService}
                className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-neutral-600 hover:border-primary-500 text-neutral-400 hover:text-primary-400 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Outfitter/Campground
              </button>
            </div>
          </FormSection>

          {/* River Notes Section */}
          <FormSection icon={<FileText className="w-5 h-5" />} title="River Notes (Eddy Tips 🦦)">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Local Knowledge & Tips
                <span className="text-neutral-500 font-normal ml-2">
                  (supports basic HTML formatting)
                </span>
              </label>
              <textarea
                value={formData.localTips || ''}
                onChange={(e) => updateField('localTips', e.target.value)}
                placeholder="After rain, the last half mile can get muddy. 4WD recommended within 24hrs of heavy rain.

Cell service is spotty here - download maps before leaving Steelville."
                rows={6}
                className="w-full px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
              <p className="mt-2 text-xs text-neutral-500">
                These tips are displayed with the 🦦 Eddy otter icon on the access point detail page.
              </p>
            </div>
          </FormSection>

          {/* Navigation Section */}
          <FormSection icon={<MapPin className="w-5 h-5" />} title="Navigation">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Driving Latitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={formData.drivingLat || ''}
                    onChange={(e) => updateField('drivingLat', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="37.9847"
                    className="w-full px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Driving Longitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={formData.drivingLng || ''}
                    onChange={(e) => updateField('drivingLng', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="-91.1234"
                    className="w-full px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Directions Override URL
                  <span className="text-neutral-500 font-normal ml-2">
                    (overrides Google Maps link)
                  </span>
                </label>
                <input
                  type="url"
                  value={formData.directionsOverride || ''}
                  onChange={(e) => updateField('directionsOverride', e.target.value)}
                  placeholder="https://maps.google.com/?q=..."
                  className="w-full px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </FormSection>

          {/* View Public Page Link */}
          <div className="flex justify-end">
            <Link
              href={`/rivers/${ap.riverSlug}/access/${ap.slug}`}
              target="_blank"
              className="flex items-center gap-2 text-primary-400 hover:text-primary-300 transition-colors"
            >
              View public page
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

// Form Section Component
function FormSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-700 bg-neutral-800/50">
        <span className="text-neutral-400">{icon}</span>
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
