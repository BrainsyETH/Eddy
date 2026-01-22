'use client';

// src/components/admin/GeographyEditor.tsx
// Main geography editor component

import { useState, useEffect } from 'react';
import AccessPointEditor from './AccessPointEditor';
import RiverLineEditor from './RiverLineEditor';

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [riversRes, accessPointsRes] = await Promise.all([
        fetch('/api/admin/rivers'),
        fetch('/api/admin/access-points'),
      ]);

      const riversData = await riversRes.json();
      const accessPointsData = await accessPointsRes.json();

      setRivers(riversData.rivers || []);
      setAccessPoints(accessPointsData.accessPoints || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Save all unsaved changes
    // This will be implemented in child components
    setEditState((prev) => ({
      ...prev,
      unsavedChanges: new Set(),
    }));
    await loadData();
  };

  const handleCancel = () => {
    setEditState((prev) => ({
      ...prev,
      unsavedChanges: new Set(),
    }));
    loadData();
  };

  if (loading) {
    return (
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 z-10">
        <div className="text-sm text-bluff-600">Loading...</div>
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

          {editState.unsavedChanges.size > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                {editState.unsavedChanges.size} unsaved change
                {editState.unsavedChanges.size > 1 ? 's' : ''}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 bg-river-500 text-white rounded text-sm font-medium hover:bg-river-600"
                >
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 bg-bluff-200 text-bluff-700 rounded text-sm font-medium hover:bg-bluff-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Editor Components */}
      {editState.mode === 'access-points' && (
        <AccessPointEditor
          accessPoints={filteredAccessPoints}
          onUpdate={(id) => {
            setEditState((prev) => {
              const newSet = new Set(prev.unsavedChanges);
              newSet.add(id);
              return { ...prev, unsavedChanges: newSet };
            });
          }}
        />
      )}

      {editState.mode === 'rivers' && (
        <RiverLineEditor
          rivers={filteredRivers}
          onUpdate={(id) => {
            setEditState((prev) => {
              const newSet = new Set(prev.unsavedChanges);
              newSet.add(id);
              return { ...prev, unsavedChanges: newSet };
            });
          }}
        />
      )}
    </>
  );
}
