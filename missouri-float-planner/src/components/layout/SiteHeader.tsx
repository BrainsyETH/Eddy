'use client';

// src/components/layout/SiteHeader.tsx
// Global site header. Top nav is intentionally flat — one link per primary
// surface (Plan, Rivers, Reports, About) so it scales as we add more rivers.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  matches: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/plan',
    label: 'Plan a Float',
    matches: (p) => p === '/plan' || p.startsWith('/plan/') || p === '/rivers' || p.startsWith('/rivers/'),
  },
  {
    href: '/gauges',
    label: 'River Reports',
    matches: (p) => p === '/gauges' || p.startsWith('/gauges/'),
  },
  {
    href: '/about',
    label: 'About',
    matches: (p) => p === '/about',
  },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Hide header on embeddable widget pages
  if (
    pathname.startsWith('/embed/widget') ||
    pathname.startsWith('/embed/planner') ||
    pathname.startsWith('/embed/eddy-quote') ||
    pathname.startsWith('/embed/services') ||
    pathname.startsWith('/embed/badge') ||
    pathname.startsWith('/embed/gauge-report')
  ) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 border-b-2 border-neutral-900" style={{ backgroundColor: '#163F4A' }}>
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
            <span className="text-xl font-semibold" style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}>
              Eddy
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 ml-8">
            {NAV_ITEMS.map((item) => {
              const active = item.matches(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                    active
                      ? 'text-white bg-white/10'
                      : 'text-primary-100 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Spacer */}
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
        <div className="md:hidden border-t border-white/10" style={{ backgroundColor: '#0F2D35' }}>
          <div className="px-4 py-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = item.matches(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-3 py-3 rounded-md no-underline transition-colors font-medium ${
                    active
                      ? 'bg-white/10 text-white'
                      : 'text-primary-100 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
