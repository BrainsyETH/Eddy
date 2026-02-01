'use client';

// src/components/admin/GeographyEditor.tsx
// Main geography editor component with improved state management

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, MousePointer2, X, Save, Trash2, ExternalLink, MapPin, Navigation, Eye, EyeOff, ImagePlus, Link2, Loader2, Upload } from 'lucide-react';
import Image from 'next/image';
import AccessPointEditor from './AccessPointEditor';
import RiverLineEditor from './RiverLineEditor';
import CreateAccessPointModal from './CreateAccessPointModal';

type EditMode = 'access-points' | 'rivers' | 'river-visibility';

interface EditState {
  mode: EditMode;
  selectedRiverId: string | null;
  unsavedChanges: Set<string>;
}

interface River {
  id: string;
  name: string;
  slug: string;
  lengthMiles: number;
  geometry: GeoJSON.LineString | null;
  active: boolean;
}

interface AccessPoint {
  id: string;
  riverId: string;
  name: string;
  slug: string;
  coordinates: {
    orig: { lng: number; lat: number };
    snap: { lng: number; lat: number } | null;
  };
  riverMile: number | null;
  type: string; // Primary type (backwards compat)
  types?: string[]; // Multiple types
  isPublic: boolean;
  ownership: string | null;
  description: string | null;
  parkingInfo?: string | null;
  feeRequired?: boolean;
  directionsOverride?: string | null;
  drivingLat?: number | null;
  drivingLng?: number | null;
  imageUrls?: string[];
  googleMapsUrl?: string | null;
  approved: boolean;
  riverName?: string;
  hasInvalidCoords?: boolean;
  hasMissingCoords?: boolean;
}

export default function GeographyEditor() {
  const [editState, setEditState] = useState<EditState>({
    mode: 'access-points',
    selectedRiverId: null,
    unsavedChanges: new Set(),
  });
  const [rivers, setRivers] = useState<River[]>([]);
  const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ lng: number; lat: number } | null>(null);
  const [selectedAccessPoint, setSelectedAccessPoint] = useState<AccessPoint | null>(null);
  const [editingDetails, setEditingDetails] = useState<Partial<AccessPoint> | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [googleMapsInput, setGoogleMapsInput] = useState('');
  const [parsingGoogleMaps, setParsingGoogleMaps] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Available access point types
  const ACCESS_POINT_TYPES = [
    { value: 'boat_ramp', label: 'Boat Ramp' },
    { value: 'gravel_bar', label: 'Gravel Bar' },
    { value: 'campground', label: 'Campground' },
    { value: 'bridge', label: 'Bridge' },
    { value: 'access', label: 'Access' },
    { value: 'park', label: 'Park' },
  ];

  // Toggle type selection
  const toggleTypeFilter = (type: string) => {
    setSelectedTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  const loadData = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const [riversRes, accessPointsRes] = await Promise.all([
        fetch('/api/admin/rivers'),
        fetch('/api/admin/access-points'),
      ]);

      if (!riversRes.ok || !accessPointsRes.ok) {
        throw new Error('Failed to load data');
      }

      const riversData = await riversRes.json();
      const accessPointsData = await accessPointsRes.json();

      setRivers(riversData.rivers || []);
      setAccessPoints(accessPointsData.accessPoints || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error loading data:', err);
      setError(`Failed to load data: ${errorMessage}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keep selectedAccessPoint in sync with accessPoints data (e.g., after marker drag)
  useEffect(() => {
    if (selectedAccessPoint && accessPoints.length > 0) {
      const updatedPoint = accessPoints.find(ap => ap.id === selectedAccessPoint.id);
      if (updatedPoint) {
        // Check if coordinates or other data changed
        const coordsChanged =
          updatedPoint.coordinates.orig.lat !== selectedAccessPoint.coordinates.orig.lat ||
          updatedPoint.coordinates.orig.lng !== selectedAccessPoint.coordinates.orig.lng;
        const dataChanged =
          updatedPoint.name !== selectedAccessPoint.name ||
          updatedPoint.riverMile !== selectedAccessPoint.riverMile ||
          updatedPoint.approved !== selectedAccessPoint.approved;

        if (coordsChanged || dataChanged) {
          setSelectedAccessPoint(updatedPoint);
          setEditingDetails(prev => prev ? { ...prev, ...updatedPoint } : { ...updatedPoint });
        }
      }
    }
  }, [accessPoints, selectedAccessPoint]);

  const handleRefresh = useCallback(() => {
    loadData(true);
  }, [loadData]);

  const handleSave = async () => {
    // Save all unsaved changes
    // This will be implemented in child components
    setEditState((prev) => ({
      ...prev,
      unsavedChanges: new Set(),
    }));
    await loadData(true);
  };

  const handleCancel = () => {
    setEditState((prev) => ({
      ...prev,
      unsavedChanges: new Set(),
    }));
    loadData(true);
  };

  const handleUpdate = useCallback((id: string) => {
    setEditState((prev) => {
      const newSet = new Set(prev.unsavedChanges);
      newSet.add(id);
      return { ...prev, unsavedChanges: newSet };
    });
  }, []);

  const handleMapClick = useCallback((coords: { lng: number; lat: number }) => {
    if (addMode) {
      setPendingCoords(coords);
    }
  }, [addMode]);

  const handleCreateAccessPoint = useCallback(async (data: {
    name: string;
    riverId: string;
    latitude: number;
    longitude: number;
    type: string;
    isPublic: boolean;
    ownership: string | null;
    description: string | null;
  }) => {
    const response = await fetch('/api/admin/access-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create access point');
    }

    // Refresh data after successful creation
    await loadData(true);
    setAddMode(false);
  }, [loadData]);

  const handleApprovalChange = useCallback(async (id: string, approved: boolean) => {
    const method = approved ? 'POST' : 'DELETE';
    const response = await fetch(`/api/admin/access-points/${id}/approve`, { method });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to change approval status');
    }
  }, []);

  // Handle selecting an access point for editing
  const handleSelectAccessPoint = useCallback((point: AccessPoint | null) => {
    setSelectedAccessPoint(point);
    setEditingDetails(point ? { ...point } : null);
    setDeleteConfirm(false);
  }, []);

  // Handle saving access point details
  const handleSaveDetails = useCallback(async () => {
    if (!selectedAccessPoint || !editingDetails) return;

    setSavingDetails(true);
    try {
      const response = await fetch(`/api/admin/access-points/${selectedAccessPoint.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingDetails.name,
          types: editingDetails.types || (editingDetails.type ? [editingDetails.type] : []),
          isPublic: editingDetails.isPublic,
          ownership: editingDetails.ownership,
          description: editingDetails.description,
          parkingInfo: editingDetails.parkingInfo,
          feeRequired: editingDetails.feeRequired,
          riverId: editingDetails.riverId,
          directionsOverride: editingDetails.directionsOverride,
          drivingLat: editingDetails.drivingLat,
          drivingLng: editingDetails.drivingLng,
          imageUrls: editingDetails.imageUrls,
          googleMapsUrl: editingDetails.googleMapsUrl,
          // Include coordinates if they've been updated (e.g., from Google Maps URL parsing)
          latitude: editingDetails.coordinates?.orig?.lat,
          longitude: editingDetails.coordinates?.orig?.lng,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save changes');
      }

      // Get updated data from the response instead of relying on stale state
      const responseData = await response.json();
      if (responseData.accessPoint) {
        // Update selection with fresh data from API response
        setSelectedAccessPoint(responseData.accessPoint);
        setEditingDetails({ ...responseData.accessPoint });
      }

      // Refresh the full list in background (don't await - the sync useEffect will handle updates)
      loadData(true);
    } catch (err) {
      console.error('Error saving access point:', err);
      alert(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSavingDetails(false);
    }
  }, [selectedAccessPoint, editingDetails, loadData]);

  // Handle deleting an access point
  const handleDeleteAccessPoint = useCallback(async () => {
    if (!selectedAccessPoint) return;

    setSavingDetails(true);
    try {
      const response = await fetch(`/api/admin/access-points/${selectedAccessPoint.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete access point');
      }

      // Clear selection and refresh
      setSelectedAccessPoint(null);
      setEditingDetails(null);
      setDeleteConfirm(false);
      await loadData(true);
    } catch (err) {
      console.error('Error deleting access point:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete access point');
    } finally {
      setSavingDetails(false);
    }
  }, [selectedAccessPoint, loadData]);

  // Handle parsing a Google Maps URL
  const handleParseGoogleMaps = useCallback(async () => {
    if (!googleMapsInput.trim() || !editingDetails) return;

    setParsingGoogleMaps(true);
    try {
      const response = await fetch('/api/admin/parse-google-maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: googleMapsInput.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to parse URL');
      }

      if (result.success && result.data) {
        const updates: Partial<AccessPoint> = {
          ...editingDetails,
          googleMapsUrl: googleMapsInput.trim(),
        };

        // Update name if found and current name is empty or generic
        if (result.data.name && (!editingDetails.name || editingDetails.name === 'New Access Point')) {
          updates.name = result.data.name;
        }

        // Update coordinates if extracted from the URL
        if (result.data.latitude && result.data.longitude) {
          updates.coordinates = {
            orig: {
              lat: result.data.latitude,
              lng: result.data.longitude,
            },
            snap: editingDetails.coordinates?.snap ?? null,
          };
        }

        // Show what was parsed
        let message = 'Parsed successfully!';
        if (result.data.name) message += `\nName: ${result.data.name}`;
        if (result.data.latitude && result.data.longitude) {
          message += `\nCoords: ${result.data.latitude.toFixed(5)}, ${result.data.longitude.toFixed(5)}`;
          message += `\n\nClick "Save Changes" to update the marker position.`;
        }

        setEditingDetails(updates);
        setGoogleMapsInput('');
        alert(message);
      } else {
        alert(result.message || 'Could not extract data from URL');
      }
    } catch (err) {
      console.error('Error parsing Google Maps URL:', err);
      alert(err instanceof Error ? err.message : 'Failed to parse URL');
    } finally {
      setParsingGoogleMaps(false);
    }
  }, [googleMapsInput, editingDetails]);

  // Handle image file upload
  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadingImages(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }

      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      // Add uploaded URLs to the existing images using functional update
      // This ensures we always work with the current state, not a stale captured value
      if (result.urls && result.urls.length > 0) {
        setEditingDetails(prev => {
          if (!prev) return prev;
          const currentUrls = prev.imageUrls || [];
          return {
            ...prev,
            imageUrls: [...currentUrls, ...result.urls],
          };
        });

        const message = result.urls.length === 1
          ? '1 image uploaded successfully!'
          : `${result.urls.length} images uploaded successfully!`;
        alert(message + (result.errors?.length ? `\n\nWarnings:\n${result.errors.join('\n')}` : ''));
      } else if (result.errors?.length) {
        alert('Upload issues:\n' + result.errors.join('\n'));
      }
    } catch (err) {
      console.error('Error uploading images:', err);
      alert(err instanceof Error ? err.message : 'Failed to upload images');
    } finally {
      setUploadingImages(false);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, []);

  if (loading) {
    return (
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 z-10">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-river-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-sm text-bluff-600">Loading geography data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 z-10 max-w-md">
        <div className="text-sm text-red-600 mb-2">{error}</div>
        <button
          onClick={() => loadData()}
          className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const filteredAccessPoints = accessPoints.filter((ap) => {
    // Filter by river if selected
    if (editState.selectedRiverId && ap.riverId !== editState.selectedRiverId) {
      return false;
    }
    // Filter by type if any types are selected
    if (selectedTypes.size > 0 && !selectedTypes.has(ap.type)) {
      return false;
    }
    return true;
  });

  const filteredRivers = editState.selectedRiverId
    ? rivers.filter((r) => r.id === editState.selectedRiverId)
    : rivers;

  return (
    <>
      {/* Control Panel - z-[3000] to stay above map markers (which can be up to z-2000) */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 z-[3000] min-w-[300px]">
        <div className="space-y-4">
          {refreshing && (
            <div className="flex items-center gap-2 text-sm text-bluff-600">
              <div className="w-3 h-3 border-2 border-river-500 border-t-transparent rounded-full animate-spin"></div>
              Refreshing...
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-bluff-700 mb-2">
              Edit Mode
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  setEditState((prev) => ({ ...prev, mode: 'access-points' }))
                }
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  editState.mode === 'access-points'
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                }`}
              >
                Access Points
              </button>
              <button
                onClick={() =>
                  setEditState((prev) => ({ ...prev, mode: 'rivers' }))
                }
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  editState.mode === 'rivers'
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                }`}
              >
                River Lines
              </button>
              <button
                onClick={() =>
                  setEditState((prev) => ({ ...prev, mode: 'river-visibility' }))
                }
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  editState.mode === 'river-visibility'
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                }`}
              >
                <Eye size={14} />
                Visibility
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-bluff-700 mb-2">
              Filter by River
            </label>
            <select
              value={editState.selectedRiverId || ''}
              onChange={(e) =>
                setEditState((prev) => ({
                  ...prev,
                  selectedRiverId: e.target.value || null,
                }))
              }
              className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm"
            >
              <option value="">All Rivers</option>
              {rivers.map((river) => (
                <option key={river.id} value={river.id}>
                  {river.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter - Multi-select */}
          {editState.mode === 'access-points' && (
            <div>
              <label className="block text-sm font-medium text-bluff-700 mb-2">
                Filter by Type
              </label>
              <button
                onClick={() => setShowTypeFilter(!showTypeFilter)}
                className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm text-left bg-white hover:bg-bluff-50 flex items-center justify-between"
              >
                <span className="text-bluff-700">
                  {selectedTypes.size === 0
                    ? 'All Types'
                    : `${selectedTypes.size} type${selectedTypes.size > 1 ? 's' : ''} selected`}
                </span>
                <span className="text-bluff-400">{showTypeFilter ? '▲' : '▼'}</span>
              </button>
              {showTypeFilter && (
                <div className="mt-2 border border-bluff-200 rounded-lg p-2 bg-white shadow-sm">
                  <div className="flex justify-between items-center mb-2 pb-2 border-b border-bluff-100">
                    <button
                      onClick={() => setSelectedTypes(new Set(ACCESS_POINT_TYPES.map(t => t.value)))}
                      className="text-xs text-river-600 hover:text-river-700"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedTypes(new Set())}
                      className="text-xs text-bluff-500 hover:text-bluff-700"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {ACCESS_POINT_TYPES.map((type) => (
                      <label
                        key={type.value}
                        className="flex items-center gap-2 cursor-pointer hover:bg-bluff-50 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTypes.has(type.value)}
                          onChange={() => toggleTypeFilter(type.value)}
                          className="w-3.5 h-3.5 text-river-500 rounded focus:ring-river-500"
                        />
                        <span className="text-xs text-bluff-700">{type.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-bluff-500">
            {editState.mode === 'access-points' && (
              <>
                <div>Showing {filteredAccessPoints.length} access point{filteredAccessPoints.length !== 1 ? 's' : ''}</div>
                <div className="flex gap-3 mt-1">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    {filteredAccessPoints.filter(ap => ap.approved).length} approved
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                    {filteredAccessPoints.filter(ap => !ap.approved).length} pending
                  </span>
                </div>
              </>
            )}
            {editState.mode === 'rivers' && (
              <>Showing {filteredRivers.length} river{filteredRivers.length !== 1 ? 's' : ''}</>
            )}
          </div>

          {/* Add Mode Toggle */}
          {editState.mode === 'access-points' && (
            <div className="pt-2 border-t border-bluff-200">
              <button
                onClick={() => setAddMode(!addMode)}
                className={`w-full px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  addMode
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                }`}
              >
                {addMode ? (
                  <>
                    <MousePointer2 size={16} />
                    Click map to place point
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Add New Point
                  </>
                )}
              </button>
              {addMode && (
                <p className="text-xs text-river-600 mt-2 text-center">
                  Click anywhere on the map to add a new access point
                </p>
              )}
            </div>
          )}

          {editState.unsavedChanges.size > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                {editState.unsavedChanges.size} unsaved change
                {editState.unsavedChanges.size > 1 ? 's' : ''}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSave}
                  disabled={refreshing}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save All
                </button>
                <button
                  onClick={handleCancel}
                  disabled={refreshing}
                  className="px-3 py-1.5 bg-neutral-200 text-neutral-700 rounded text-sm font-medium hover:bg-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-bluff-200">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="w-full px-3 py-1.5 bg-neutral-200 text-neutral-700 rounded text-sm font-medium hover:bg-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {refreshing ? 'Refreshing...' : 'Refresh Data'}
            </button>
          </div>
        </div>
      </div>

      {/* Editor Components */}
      {editState.mode === 'access-points' && (
        <AccessPointEditor
          accessPoints={filteredAccessPoints}
          onUpdate={handleUpdate}
          onRefresh={handleRefresh}
          addMode={addMode}
          onMapClick={handleMapClick}
          onApprovalChange={handleApprovalChange}
          onSelectAccessPoint={handleSelectAccessPoint}
          selectedAccessPointId={selectedAccessPoint?.id}
        />
      )}

      {editState.mode === 'rivers' && (
        <RiverLineEditor
          rivers={filteredRivers}
          onUpdate={handleUpdate}
          onRefresh={handleRefresh}
        />
      )}

      {/* River Visibility Editor Panel */}
      {editState.mode === 'river-visibility' && (
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 z-[3000] w-[320px] max-h-[calc(100vh-120px)] overflow-y-auto">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-bluff-200">
            <h3 className="font-semibold text-bluff-800 flex items-center gap-2">
              <Eye size={18} />
              River Visibility
            </h3>
          </div>

          <p className="text-xs text-bluff-500 mb-4">
            Control which rivers are visible in the public app. Only active rivers will appear in the river selector and on the map.
          </p>

          <div className="space-y-2">
            {rivers.map((river) => (
              <div
                key={river.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  river.active
                    ? 'bg-green-50 border-green-200'
                    : 'bg-bluff-50 border-bluff-200'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm truncate ${
                    river.active ? 'text-green-800' : 'text-bluff-600'
                  }`}>
                    {river.name}
                  </p>
                  <p className="text-xs text-bluff-500">
                    {river.lengthMiles.toFixed(1)} mi
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch(`/api/admin/rivers/${river.id}/visibility`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ active: !river.active }),
                      });

                      if (!response.ok) {
                        throw new Error('Failed to update visibility');
                      }

                      // Update local state
                      setRivers((prev) =>
                        prev.map((r) =>
                          r.id === river.id ? { ...r, active: !r.active } : r
                        )
                      );
                    } catch (err) {
                      console.error('Error updating river visibility:', err);
                      alert('Failed to update river visibility');
                    }
                  }}
                  className={`ml-3 p-2 rounded-lg transition-colors ${
                    river.active
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-bluff-300 text-bluff-600 hover:bg-bluff-400'
                  }`}
                  title={river.active ? 'Hide river' : 'Show river'}
                >
                  {river.active ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-bluff-200">
            <div className="flex items-center gap-2 text-xs text-bluff-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                {rivers.filter((r) => r.active).length} visible
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-bluff-400"></span>
                {rivers.filter((r) => !r.active).length} hidden
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Create Access Point Modal */}
      {pendingCoords && (
        <CreateAccessPointModal
          coordinates={pendingCoords}
          rivers={rivers}
          selectedRiverId={editState.selectedRiverId}
          onClose={() => setPendingCoords(null)}
          onSave={handleCreateAccessPoint}
        />
      )}

      {/* Access Point Detail Panel - z-[3000] to stay above map markers (which can be up to z-2000) */}
      {selectedAccessPoint && editingDetails && (
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 z-[3000] w-[340px] max-h-[calc(100vh-120px)] overflow-y-auto">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-bluff-200">
            <h3 className="font-semibold text-bluff-800">Edit Access Point</h3>
            <button
              onClick={() => handleSelectAccessPoint(null)}
              className="p-1 hover:bg-bluff-100 rounded transition-colors"
            >
              <X size={18} className="text-bluff-500" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-bluff-700 mb-1">Name</label>
              <input
                type="text"
                value={editingDetails.name || ''}
                onChange={(e) => setEditingDetails({ ...editingDetails, name: e.target.value })}
                className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:ring-2 focus:ring-river-500 focus:border-river-500"
              />
            </div>

            {/* River */}
            <div>
              <label className="block text-sm font-medium text-bluff-700 mb-1">River</label>
              <select
                value={editingDetails.riverId || ''}
                onChange={(e) => setEditingDetails({ ...editingDetails, riverId: e.target.value })}
                className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:ring-2 focus:ring-river-500 focus:border-river-500"
              >
                {rivers.map((river) => (
                  <option key={river.id} value={river.id}>
                    {river.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Types (multiple selection) */}
            <div>
              <label className="block text-sm font-medium text-bluff-700 mb-2">
                Types <span className="text-bluff-500 font-normal">(select all that apply)</span>
              </label>
              <div className="grid grid-cols-2 gap-2 p-3 bg-bluff-50 rounded-lg border border-bluff-200">
                {ACCESS_POINT_TYPES.map((typeOption) => {
                  const currentTypes = editingDetails.types || (editingDetails.type ? [editingDetails.type] : []);
                  const isChecked = currentTypes.includes(typeOption.value);
                  return (
                    <label key={typeOption.value} className="flex items-center gap-2 cursor-pointer hover:bg-bluff-100 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const newTypes = e.target.checked
                            ? [...currentTypes, typeOption.value]
                            : currentTypes.filter(t => t !== typeOption.value);
                          setEditingDetails({
                            ...editingDetails,
                            types: newTypes,
                            type: newTypes[0] || 'access' // Keep primary type for backwards compat
                          });
                        }}
                        className="w-4 h-4 text-river-500 rounded focus:ring-river-500"
                      />
                      <span className="text-sm text-bluff-700">{typeOption.label}</span>
                    </label>
                  );
                })}
              </div>
              {(editingDetails.types?.length || 0) === 0 && !editingDetails.type && (
                <p className="text-xs text-amber-600 mt-1">Please select at least one type</p>
              )}
            </div>

            {/* Public / Private */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingDetails.isPublic ?? true}
                  onChange={(e) => setEditingDetails({ ...editingDetails, isPublic: e.target.checked })}
                  className="w-4 h-4 text-river-500 rounded focus:ring-river-500"
                />
                <span className="text-sm text-bluff-700">Public Access</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingDetails.feeRequired ?? false}
                  onChange={(e) => setEditingDetails({ ...editingDetails, feeRequired: e.target.checked })}
                  className="w-4 h-4 text-river-500 rounded focus:ring-river-500"
                />
                <span className="text-sm text-bluff-700">Fee Required</span>
              </label>
            </div>

            {/* Ownership */}
            <div>
              <label className="block text-sm font-medium text-bluff-700 mb-1">Ownership</label>
              <input
                type="text"
                value={editingDetails.ownership || ''}
                onChange={(e) => setEditingDetails({ ...editingDetails, ownership: e.target.value })}
                placeholder="e.g., MDC, NPS, County"
                className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:ring-2 focus:ring-river-500 focus:border-river-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-bluff-700 mb-1">Description</label>
              <textarea
                value={editingDetails.description || ''}
                onChange={(e) => setEditingDetails({ ...editingDetails, description: e.target.value })}
                rows={3}
                placeholder="Additional details about this access point..."
                className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:ring-2 focus:ring-river-500 focus:border-river-500 resize-none"
              />
            </div>

            {/* Parking */}
            <div>
              <label className="block text-sm font-medium text-bluff-700 mb-1">Parking Info</label>
              <input
                type="text"
                value={editingDetails.parkingInfo || ''}
                onChange={(e) => setEditingDetails({ ...editingDetails, parkingInfo: e.target.value })}
                placeholder="e.g., Gravel lot, 20 spaces, free"
                className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:ring-2 focus:ring-river-500 focus:border-river-500"
              />
            </div>

            {/* Images Section */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <label className="block text-sm font-medium text-purple-800 mb-2 flex items-center gap-2">
                <ImagePlus size={14} />
                Images ({editingDetails.imageUrls?.length || 0})
              </label>

              {/* Existing Images */}
              {editingDetails.imageUrls && editingDetails.imageUrls.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-3">
                  {editingDetails.imageUrls.map((url, index) => (
                    <div key={index} className="relative w-16 h-16 rounded-lg overflow-hidden bg-purple-100 group">
                      <Image
                        src={url}
                        alt={`Image ${index + 1}`}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                      <button
                        onClick={() => {
                          setEditingDetails(prev => {
                            if (!prev) return prev;
                            const newUrls = prev.imageUrls?.filter((_, i) => i !== index) || [];
                            return { ...prev, imageUrls: newUrls };
                          });
                        }}
                        className="absolute top-0.5 right-0.5 p-0.5 bg-red-600 hover:bg-red-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove image"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Photos Directly */}
              <div className="mb-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImages}
                  className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {uploadingImages ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      Upload Photos
                    </>
                  )}
                </button>
                <p className="text-xs text-purple-500 mt-1.5 text-center">
                  JPEG, PNG, WebP, GIF up to 4.5MB each
                </p>
              </div>

              {/* Or add by URL */}
              <div className="border-t border-purple-200 pt-3">
                <p className="text-xs text-purple-600 mb-2 font-medium">Or add by URL:</p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="flex-1 px-2 py-1.5 border border-purple-200 rounded text-sm bg-white focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
                  />
                  <button
                    onClick={() => {
                      if (newImageUrl.trim()) {
                        const urlToAdd = newImageUrl.trim();
                        setEditingDetails(prev => {
                          if (!prev) return prev;
                          const currentUrls = prev.imageUrls || [];
                          if (currentUrls.includes(urlToAdd)) return prev;
                          return {
                            ...prev,
                            imageUrls: [...currentUrls, urlToAdd],
                          };
                        });
                        setNewImageUrl('');
                      }
                    }}
                    disabled={!newImageUrl.trim()}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
              </div>

              <p className="text-xs text-purple-500 mt-2 text-center">
                Changes are saved when you click &quot;Save Changes&quot;.
              </p>
            </div>

            {/* Google Maps URL Import */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <label className="block text-sm font-medium text-green-800 mb-2 flex items-center gap-2">
                <Link2 size={14} />
                Import from Google Maps
              </label>

              {/* Current Google Maps URL */}
              {editingDetails.googleMapsUrl && (
                <div className="mb-3 p-2 bg-white rounded border border-green-200">
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={editingDetails.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-600 hover:text-green-800 truncate flex-1"
                    >
                      {editingDetails.googleMapsUrl}
                    </a>
                    <button
                      onClick={() => setEditingDetails({ ...editingDetails, googleMapsUrl: null })}
                      className="p-1 text-red-500 hover:text-red-700"
                      title="Remove link"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}

              {/* Google Maps URL Input */}
              <div className="flex gap-2">
                <input
                  type="url"
                  value={googleMapsInput}
                  onChange={(e) => setGoogleMapsInput(e.target.value)}
                  placeholder="Paste Google Maps link here..."
                  className="flex-1 px-2 py-1.5 border border-green-200 rounded text-sm bg-white focus:ring-2 focus:ring-green-400 focus:border-green-400"
                />
                <button
                  onClick={handleParseGoogleMaps}
                  disabled={!googleMapsInput.trim() || parsingGoogleMaps}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {parsingGoogleMaps ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    'Parse'
                  )}
                </button>
              </div>
              <p className="text-xs text-green-600 mt-1">
                Paste a Google Maps link to auto-fill name. Link will be shown in the river guide.
              </p>
            </div>

            {/* Google Maps Links */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <label className="block text-sm font-medium text-blue-800 mb-2 flex items-center gap-2">
                <MapPin size={14} />
                Google Maps & Directions
              </label>

              {/* Directions Override Input */}
              <div className="mb-3">
                <label className="block text-xs text-blue-700 mb-1">
                  Directions Override (optional)
                </label>
                <input
                  type="text"
                  value={editingDetails.directionsOverride || ''}
                  onChange={(e) => setEditingDetails({ ...editingDetails, directionsOverride: e.target.value })}
                  placeholder="e.g., Round Spring Recreation Area, MO"
                  className="w-full px-2 py-1.5 border border-blue-200 rounded text-sm bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                />
                <p className="text-xs text-blue-500 mt-1">
                  Place name or address for more accurate directions.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-blue-200">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${editingDetails.coordinates?.orig?.lat ?? selectedAccessPoint.coordinates.orig.lat},${editingDetails.coordinates?.orig?.lng ?? selectedAccessPoint.coordinates.orig.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  <ExternalLink size={14} />
                  View on Google Maps
                </a>
                <a
                  href={editingDetails.directionsOverride || selectedAccessPoint.directionsOverride
                    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(editingDetails.directionsOverride || selectedAccessPoint.directionsOverride || '')}`
                    : `https://www.google.com/maps/dir/?api=1&destination=${editingDetails.coordinates?.orig?.lat ?? selectedAccessPoint.coordinates.orig.lat},${editingDetails.coordinates?.orig?.lng ?? selectedAccessPoint.coordinates.orig.lng}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  <Navigation size={14} />
                  Get Driving Directions
                  {(editingDetails.directionsOverride || selectedAccessPoint.directionsOverride) && (
                    <span className="text-xs bg-blue-200 px-1.5 py-0.5 rounded">custom</span>
                  )}
                </a>
              </div>
            </div>

            {/* Approval Status */}
            <div className={`p-3 rounded-lg ${selectedAccessPoint.approved ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${selectedAccessPoint.approved ? 'bg-green-500' : 'bg-orange-500'}`}></span>
                  <span className={`text-sm font-medium ${selectedAccessPoint.approved ? 'text-green-700' : 'text-orange-700'}`}>
                    {selectedAccessPoint.approved ? 'Approved - Visible in App' : 'Pending - Hidden from App'}
                  </span>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await handleApprovalChange(selectedAccessPoint.id, !selectedAccessPoint.approved);
                      // Update local state immediately with toggled approval
                      // The sync useEffect will update with full data after loadData completes
                      setSelectedAccessPoint(prev => prev ? { ...prev, approved: !prev.approved } : null);
                      // Refresh in background - sync useEffect handles the rest
                      loadData(true);
                    } catch (err) {
                      console.error('Error changing approval:', err);
                    }
                  }}
                  className={`px-2 py-1 text-xs font-medium rounded ${
                    selectedAccessPoint.approved
                      ? 'bg-orange-500 text-white hover:bg-orange-600'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {selectedAccessPoint.approved ? 'Unapprove' : 'Approve'}
                </button>
              </div>
            </div>

            {/* Location Info */}
            <div className="text-xs text-neutral-500 bg-neutral-50 p-2 rounded">
              <div>River Mile: {selectedAccessPoint.riverMile?.toFixed(1) ?? 'N/A'}</div>
              <div className="flex items-center gap-1">
                <span>Coords:</span>
                <span className={editingDetails.coordinates?.orig?.lat !== selectedAccessPoint.coordinates.orig.lat ||
                  editingDetails.coordinates?.orig?.lng !== selectedAccessPoint.coordinates.orig.lng
                  ? 'text-green-600 font-medium'
                  : ''
                }>
                  {(editingDetails.coordinates?.orig?.lat ?? selectedAccessPoint.coordinates.orig.lat).toFixed(5)},
                  {' '}
                  {(editingDetails.coordinates?.orig?.lng ?? selectedAccessPoint.coordinates.orig.lng).toFixed(5)}
                </span>
                {(editingDetails.coordinates?.orig?.lat !== selectedAccessPoint.coordinates.orig.lat ||
                  editingDetails.coordinates?.orig?.lng !== selectedAccessPoint.coordinates.orig.lng) && (
                  <span className="text-green-600">(pending)</span>
                )}
              </div>
              <div className="mt-1 text-neutral-400">Drag marker on map or import from Google Maps</div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-neutral-200">
              <button
                onClick={handleSaveDetails}
                disabled={savingDetails}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={16} />
                {savingDetails ? 'Saving...' : 'Save Changes'}
              </button>
              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200"
                >
                  <Trash2 size={16} />
                </button>
              ) : (
                <button
                  onClick={handleDeleteAccessPoint}
                  disabled={savingDetails}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
