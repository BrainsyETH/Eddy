'use client';

// src/components/admin/AdminLayout.tsx
// Shared layout for admin pages with authentication and navigation

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import {
  Home,
  MapPin,
  Image as ImageIcon,
  LogOut,
  Menu,
  X,
  Navigation,
  Flag
} from 'lucide-react';
import { useState } from 'react';

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
}

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: Home },
  { href: '/admin/feedback', label: 'Feedback', icon: Flag },
  { href: '/admin/access-points', label: 'Access Points', icon: Navigation },
  { href: '/admin/geography', label: 'Geography Editor', icon: MapPin },
  { href: '/admin/images', label: 'Image Library', icon: ImageIcon },
];

export default function AdminLayout({ children, title, description }: AdminLayoutProps) {
  const { isAuthorized, password, setPassword, error, handleSubmit, logout } = useAdminAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
          <p className="text-neutral-400 text-sm mb-6">Enter password to access {title}</p>

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
    <div className="min-h-screen bg-neutral-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-neutral-800 border-r border-neutral-700">
        <div className="p-4 border-b border-neutral-700">
          <Link href="/admin" className="text-xl font-bold text-white">
            Eddy Admin
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-neutral-700">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 w-full text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-neutral-800 border-b border-neutral-700">
        <div className="flex items-center justify-between p-4">
          <Link href="/admin" className="text-lg font-bold text-white">
            Eddy Admin
          </Link>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-neutral-300 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-neutral-700 p-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={() => {
                logout();
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 px-3 py-2 w-full text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:pt-0 pt-16">
        <header className="bg-neutral-800 border-b border-neutral-700 px-6 py-4">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {description && (
            <p className="text-sm text-neutral-400 mt-1">{description}</p>
          )}
        </header>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
