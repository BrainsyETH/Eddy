'use client';

// src/components/admin/CreateAccessPointModal.tsx
// Modal for creating a new access point

import { useState } from 'react';
import { X } from 'lucide-react';
import { ACCESS_POINT_TYPES, OWNERSHIP_TYPES } from '@/constants';

interface River {
  id: string;
  name: string;
}

interface CreateAccessPointModalProps {
  coordinates: { lng: number; lat: number };
  rivers: River[];
  selectedRiverId: string | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    riverId: string;
    latitude: number;
    longitude: number;
    type: string;
    isPublic: boolean;
    ownership: string | null;
    description: string | null;
  }) => Promise<void>;
}

export default function CreateAccessPointModal({
  coordinates,
  rivers,
  selectedRiverId,
  onClose,
  onSave,
}: CreateAccessPointModalProps) {
  const [name, setName] = useState('');
  const [riverId, setRiverId] = useState(selectedRiverId || '');
  const [type, setType] = useState('access');
  const [isPublic, setIsPublic] = useState(true);
  const [ownership, setOwnership] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!riverId) {
      setError('Please select a river');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        riverId,
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        type,
        isPublic,
        ownership: ownership || null,
        description: description || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create access point');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-bluff-200">
          <h2 className="text-lg font-semibold text-ozark-800">New Access Point</h2>
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
              placeholder="e.g., Highway 19 Bridge Access"
              className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-river-500 focus:border-transparent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-bluff-700 mb-1">
              River <span className="text-red-500">*</span>
            </label>
            <select
              value={riverId}
              onChange={(e) => setRiverId(e.target.value)}
              className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-river-500 focus:border-transparent"
            >
              <option value="">Select a river...</option>
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
              {Object.entries(ACCESS_POINT_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="w-4 h-4 text-river-500 border-bluff-300 rounded focus:ring-river-500"
            />
            <label htmlFor="isPublic" className="text-sm text-bluff-700">
              Public Access
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-bluff-700 mb-1">
              Ownership
            </label>
            <select
              value={ownership}
              onChange={(e) => setOwnership(e.target.value)}
              className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-river-500 focus:border-transparent"
            >
              <option value="">Unknown / Not specified</option>
              {Object.entries(OWNERSHIP_TYPES).map(([value, label]) => (
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
              placeholder="Optional notes about this access point..."
              rows={3}
              className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-river-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-bluff-100 text-bluff-700 rounded-lg text-sm font-medium hover:bg-bluff-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-river-500 text-white rounded-lg text-sm font-medium hover:bg-river-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Creating...' : 'Create Point'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
