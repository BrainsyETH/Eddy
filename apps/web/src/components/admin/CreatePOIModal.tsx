'use client';

// src/components/admin/CreatePOIModal.tsx
// Modal for creating a new point of interest

import { useState } from 'react';
import { X } from 'lucide-react';
import { POI_TYPES } from '@/constants';

interface River {
  id: string;
  name: string;
}

interface CreatePOIModalProps {
  coordinates: { lng: number; lat: number };
  rivers: River[];
  selectedRiverId: string | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    riverId: string | null;
    latitude: number;
    longitude: number;
    type: string;
    description: string | null;
    active: boolean;
    isOnWater: boolean;
  }) => Promise<void>;
}

export default function CreatePOIModal({
  coordinates,
  rivers,
  selectedRiverId,
  onClose,
  onSave,
}: CreatePOIModalProps) {
  const [name, setName] = useState('');
  const [riverId, setRiverId] = useState(selectedRiverId || '');
  const [type, setType] = useState('other');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [isOnWater, setIsOnWater] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        riverId: riverId || null,
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        type,
        description: description || null,
        active,
        isOnWater,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create POI');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-bluff-200">
          <h2 className="text-lg font-semibold text-ozark-800">New Point of Interest</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bluff-100 rounded-full transition-colors"
          >
            <X size={20} className="text-bluff-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="p-3 bg-bluff-50 rounded-lg text-sm">
            <span className="font-medium text-bluff-700">Location:</span>{' '}
            <span className="text-bluff-600">
              {coordinates.lat.toFixed(5)}, {coordinates.lng.toFixed(5)}
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-bluff-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Big Spring, Alley Spring"
              className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-river-500 focus:border-transparent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-bluff-700 mb-1">
              River
            </label>
            <select
              value={riverId}
              onChange={(e) => setRiverId(e.target.value)}
              className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-river-500 focus:border-transparent"
            >
              <option value="">No river assigned</option>
              {rivers.map((river) => (
                <option key={river.id} value={river.id}>
                  {river.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-bluff-700 mb-1">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-river-500 focus:border-transparent"
            >
              {Object.entries(POI_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-bluff-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this point of interest..."
              rows={3}
              className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-river-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 text-river-500 border-bluff-300 rounded focus:ring-river-500"
              />
              <span className="text-sm text-bluff-700">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isOnWater}
                onChange={(e) => setIsOnWater(e.target.checked)}
                className="w-4 h-4 text-river-500 border-bluff-300 rounded focus:ring-river-500"
              />
              <span className="text-sm text-bluff-700">On Water</span>
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Creating...' : 'Create POI'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
