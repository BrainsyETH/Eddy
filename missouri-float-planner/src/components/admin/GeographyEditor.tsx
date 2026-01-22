'use client';

// src/components/admin/GeographyEditor.tsx
// Main geography editor component with improved state management

import { useState, useEffect, useCallback } from 'react';
import { Plus, MousePointer2 } from 'lucide-react';
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
  approved: boolean;
  riverName?: string;
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
      {/* Control Panel */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 z-10 min-w-[300px]">
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
              <>Showing {filteredAccessPoints.length} access point{filteredAccessPoints.length !== 1 ? 's' : ''}</>
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
    </>
  );
}
