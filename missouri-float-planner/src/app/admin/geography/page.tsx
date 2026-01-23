'use client';

// src/app/admin/geography/page.tsx
// Admin geography editor page

import { useState, useEffect } from 'react';
import MapContainer from '@/components/map/MapContainer';
import GeographyEditor from '@/components/admin/GeographyEditor';

const ADMIN_STORAGE_KEY = 'mfp_admin_auth';

export default function AdminGeographyPage() {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if already authorized in this session
    const stored = sessionStorage.getItem(ADMIN_STORAGE_KEY);
    if (stored === 'true') {
      setIsAuthorized(true);
    } else {
      setIsAuthorized(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Check against environment variable (set in .env.local)
    const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;

    if (!adminPassword) {
      // No password configured - allow access (dev mode)
      sessionStorage.setItem(ADMIN_STORAGE_KEY, 'true');
      setIsAuthorized(true);
      return;
    }

    if (password === adminPassword) {
      sessionStorage.setItem(ADMIN_STORAGE_KEY, 'true');
      setIsAuthorized(true);
      setError('');
    } else {
      setError('Invalid password');
    }
  };

  if (isAuthorized === null) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-bluff-500">Loading...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-ozark-900 flex items-center justify-center">
        <div className="bg-ozark-800 rounded-xl p-8 w-full max-w-md shadow-xl border border-ozark-700">
          <h1 className="text-2xl font-bold text-white mb-2">Admin Access</h1>
          <p className="text-river-300 text-sm mb-6">Enter password to access the geography editor</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-river-300 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-ozark-900 border border-ozark-600 rounded-lg text-white placeholder-bluff-500 focus:outline-none focus:ring-2 focus:ring-river-500"
                placeholder="Enter admin password"
                autoFocus
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm">{error}</div>
            )}

            <button
              type="submit"
              className="w-full px-4 py-2 bg-river-500 text-white rounded-lg font-medium hover:bg-river-600 transition-colors"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-ozark-900">
      <header className="bg-ozark-800 border-b border-ozark-700 px-6 py-4">
        <h1 className="text-2xl font-bold text-white">Geography Editor</h1>
        <p className="text-sm text-river-300 mt-1">
          Edit access point locations and river line geometries
        </p>
      </header>
      <div className="flex-1 relative">
        <MapContainer>
          <GeographyEditor />
        </MapContainer>
      </div>
    </div>
  );
}
