'use client';

// src/components/admin/GeographyEditor.tsx
// Main geography editor component with improved state management

import { useState, useEffect, useCallback } from 'react';
import { Plus, MousePointer2, X, Save, Trash2 } from 'lucide-react';
import AccessPointEditor from './AccessPointEditor';
import RiverLineEditor from './RiverLineEditor';
import CreateAccessPointModal from './CreateAccessPointModal';

type EditMode = 'access-points' | 'rivers';

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
  type: string;
  isPublic: boolean;
  ownership: string | null;
  description: string | null;
  feeRequired?: boolean;
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
          type: editingDetails.type,
          isPublic: editingDetails.isPublic,
          ownership: editingDetails.ownership,
          description: editingDetails.description,
          feeRequired: editingDetails.feeRequired,
          riverId: editingDetails.riverId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save changes');
      }

      // Refresh data and update selection
      await loadData(true);
      // Find the updated point in the refreshed data
      const updatedPoints = accessPoints.find(ap => ap.id === selectedAccessPoint.id);
      if (updatedPoints) {
        setSelectedAccessPoint(updatedPoints);
        setEditingDetails({ ...updatedPoints });
      } else {
        setSelectedAccessPoint(null);
        setEditingDetails(null);
      }
    } catch (err) {
      console.error('Error saving access point:', err);
      alert(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSavingDetails(false);
    }
  }, [selectedAccessPoint, editingDetails, loadData, accessPoints]);

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
          className="px-3 py-1.5 bg-river-500 text-white rounded text-sm font-medium hover:bg-river-600"
        >
          Retry
        </button>
      </div>
    );
  }

  const filteredAccessPoints = editState.selectedRiverId
    ? accessPoints.filter((ap) => ap.riverId === editState.selectedRiverId)
    : accessPoints;

  const filteredRivers = editState.selectedRiverId
    ? rivers.filter((r) => r.id === editState.selectedRiverId)
    : rivers;

  return (
    <>
      {/* Control Panel - z-50 to stay above map markers */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 z-50 min-w-[300px]">
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
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setEditState((prev) => ({ ...prev, mode: 'access-points' }))
                }
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  editState.mode === 'access-points'
                    ? 'bg-river-500 text-white'
                    : 'bg-bluff-100 text-bluff-700 hover:bg-bluff-200'
                }`}
              >
                Access Points
              </button>
              <button
                onClick={() =>
                  setEditState((prev) => ({ ...prev, mode: 'rivers' }))
                }
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  editState.mode === 'rivers'
                    ? 'bg-river-500 text-white'
                    : 'bg-bluff-100 text-bluff-700 hover:bg-bluff-200'
                }`}
              >
                River Lines
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
                    ? 'bg-river-500 text-white'
                    : 'bg-bluff-100 text-bluff-700 hover:bg-bluff-200'
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
                  className="px-3 py-1.5 bg-river-500 text-white rounded text-sm font-medium hover:bg-river-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save All
                </button>
                <button
                  onClick={handleCancel}
                  disabled={refreshing}
                  className="px-3 py-1.5 bg-bluff-200 text-bluff-700 rounded text-sm font-medium hover:bg-bluff-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="w-full px-3 py-1.5 bg-bluff-100 text-bluff-700 rounded text-sm font-medium hover:bg-bluff-200 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Access Point Detail Panel */}
      {selectedAccessPoint && editingDetails && (
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 z-50 w-[340px] max-h-[calc(100vh-120px)] overflow-y-auto">
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

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-bluff-700 mb-1">Type</label>
              <select
                value={editingDetails.type || 'access'}
                onChange={(e) => setEditingDetails({ ...editingDetails, type: e.target.value })}
                className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:ring-2 focus:ring-river-500 focus:border-river-500"
              >
                <option value="boat_ramp">Boat Ramp</option>
                <option value="gravel_bar">Gravel Bar</option>
                <option value="campground">Campground</option>
                <option value="bridge">Bridge</option>
                <option value="access">Access</option>
                <option value="park">Park</option>
              </select>
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
                      await loadData(true);
                      // Update local state
                      const updatedPoint = accessPoints.find(ap => ap.id === selectedAccessPoint.id);
                      if (updatedPoint) {
                        setSelectedAccessPoint({ ...updatedPoint, approved: !selectedAccessPoint.approved });
                      }
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
            <div className="text-xs text-bluff-500 bg-bluff-50 p-2 rounded">
              <div>River Mile: {selectedAccessPoint.riverMile?.toFixed(1) ?? 'N/A'}</div>
              <div>Coords: {selectedAccessPoint.coordinates.orig.lat.toFixed(5)}, {selectedAccessPoint.coordinates.orig.lng.toFixed(5)}</div>
              <div className="mt-1 text-bluff-400">Drag marker on map to change location</div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-bluff-200">
              <button
                onClick={handleSaveDetails}
                disabled={savingDetails}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-river-500 text-white rounded-lg text-sm font-medium hover:bg-river-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
