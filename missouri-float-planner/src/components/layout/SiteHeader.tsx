'use client';

// src/components/layout/SiteHeader.tsx
// Global site header with Eddy branding and river navigation dropdown

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useRivers } from '@/hooks/useRivers';
import { CONDITION_BG_CLASSES } from '@/constants';

export default function SiteHeader() {
  const pathname = usePathname();
  const { data: rivers } = useRivers();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Determine active river from URL
  const activeRiverSlug = pathname.startsWith('/rivers/')
    ? pathname.split('/')[2]
    : null;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setDropdownOpen(false);
  }, [pathname]);

  const activeRiver = rivers?.find(r => r.slug === activeRiverSlug);

  return (
    <header className="sticky top-0 z-50 border-b-2 border-neutral-900 bg-primary-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <Image
              src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png"
              alt="Eddy"
              width={32}
              height={32}
              className="w-8 h-8 rounded-md"
            />
            <span className="text-xl font-semibold text-accent-500" style={{ fontFamily: 'var(--font-display)' }}>
              Eddy
            </span>
          </Link>

          {/* Desktop nav - Left aligned after logo */}
          <nav className="hidden md:flex items-center gap-1 ml-8">
            {/* Plan Your Float dropdown */}
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                  activeRiverSlug
                    ? 'text-white bg-white/10'
                    : 'text-primary-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>{activeRiver ? activeRiver.name : 'Plan Your Float'}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute left-0 mt-1 w-72 bg-white border-2 border-neutral-200 rounded-lg shadow-xl overflow-hidden animate-in">
                  <div className="py-1">
                    {rivers?.map((river) => (
                      <Link
                        key={river.id}
                        href={`/rivers/${river.slug}`}
                        className={`block px-4 py-3 hover:bg-neutral-50 transition-colors no-underline ${
                          river.slug === activeRiverSlug ? 'bg-primary-50' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-neutral-900">{river.name}</span>
                              {river.currentCondition && (
                                <span
                                  className={`w-2 h-2 rounded-full ${CONDITION_BG_CLASSES[river.currentCondition.code]}`}
                                  title={river.currentCondition.label}
                                />
                              )}
                            </div>
                            <span className="text-xs text-neutral-500">
                              {river.lengthMiles.toFixed(1)} mi &middot; {river.region} &middot; {river.difficultyRating}
                            </span>
                          </div>
                          {river.slug === activeRiverSlug && (
                            <svg className="w-4 h-4 text-primary-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* River Levels link */}
            <Link
              href="/gauges"
              className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                pathname === '/gauges'
                  ? 'text-white bg-white/10'
                  : 'text-primary-100 hover:text-white hover:bg-white/10'
              }`}
            >
              River Levels
            </Link>

            {/* About link */}
            <Link
              href="/about"
              className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                pathname === '/about'
                  ? 'text-white bg-white/10'
                  : 'text-primary-100 hover:text-white hover:bg-white/10'
              }`}
            >
              About
            </Link>
          </nav>

          {/* Spacer to push hamburger to right */}
          <div className="flex-1" />

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-md text-primary-100 hover:text-white hover:bg-white/10 transition-colors"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-primary-900">
          <div className="px-4 py-3">
            {/* Plan Your Float section first */}
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 text-primary-300">
              Plan Your Float
            </p>
            <div className="space-y-0.5 mb-3">
              {rivers?.map((river) => (
                <Link
                  key={river.id}
                  href={`/rivers/${river.slug}`}
                  className={`flex items-center justify-between px-3 py-3 rounded-md no-underline transition-colors ${
                    river.slug === activeRiverSlug
                      ? 'bg-white/10 text-white'
                      : 'text-primary-100 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{river.name}</span>
                      {river.currentCondition && (
                        <span
                          className={`w-2 h-2 rounded-full ${CONDITION_BG_CLASSES[river.currentCondition.code]}`}
                        />
                      )}
                    </div>
                    <span className="text-xs text-primary-300">
                      {river.lengthMiles.toFixed(1)} mi &middot; {river.difficultyRating}
                    </span>
                  </div>
                  {river.slug === activeRiverSlug && (
                    <svg className="w-4 h-4 text-white flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </Link>
              ))}
            </div>

            {/* River Levels */}
            <Link
              href="/gauges"
              className={`flex items-center px-3 py-3 rounded-md no-underline transition-colors mb-1 ${
                pathname === '/gauges'
                  ? 'bg-white/10 text-white'
                  : 'text-primary-100 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="font-medium">River Levels</span>
            </Link>

            {/* About */}
            <Link
              href="/about"
              className={`flex items-center px-3 py-3 rounded-md no-underline transition-colors ${
                pathname === '/about'
                  ? 'bg-white/10 text-white'
                  : 'text-primary-100 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="font-medium">About</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
