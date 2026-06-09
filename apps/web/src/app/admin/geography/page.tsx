'use client';

// src/app/admin/geography/page.tsx
// Admin geography editor page

import Link from 'next/link';
import MapContainer from '@/components/map/MapContainer';
import GeographyEditor from '@/components/admin/GeographyEditor';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { ArrowLeft, LogOut } from 'lucide-react';

export default function AdminGeographyPage() {
  const { isAuthorized, password, setPassword, error, handleSubmit, logout } = useAdminAuth();

  if (isAuthorized === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-900">
        <div className="text-neutral-400">Loading...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <div className="bg-neutral-800 rounded-xl p-8 w-full max-w-md shadow-xl border border-neutral-700">
          <h1 className="text-2xl font-bold text-white mb-2">Admin Access</h1>
          <p className="text-neutral-400 text-sm mb-6">Enter password to access the geography editor</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-neutral-300 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Enter admin password"
                autoFocus
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm">{error}</div>
            )}

            <button
              type="submit"
              className="w-full px-4 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-900">
      <header className="bg-neutral-800 border-b border-neutral-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Admin</span>
          </Link>
          <div className="h-6 w-px bg-neutral-700" />
          <div>
            <h1 className="text-lg font-bold text-white">Geography Editor</h1>
            <p className="text-xs text-neutral-400">
              Edit access point locations and river geometries
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm">Sign Out</span>
        </button>
      </header>
      <div className="flex-1 relative">
        <MapContainer>
          <GeographyEditor />
        </MapContainer>
      </div>
    </div>
  );
}
