'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import AppLink from '@/components/AppLink';
import { Menu, X } from 'lucide-react';
import { siteNavigation } from '@/lib/navigation/site-navigation';

type HeaderProps = { floatSearchEnabled?: boolean };

export default function SiteHeader({ floatSearchEnabled = false }: HeaderProps) {
  return (
    <Suspense fallback={<HeaderContent floatSearchEnabled={floatSearchEnabled} />}>
      <ContextualHeader floatSearchEnabled={floatSearchEnabled} />
    </Suspense>
  );
}

function ContextualHeader(props: HeaderProps) {
  const searchParams = useSearchParams();
  return <HeaderContent {...props} search={searchParams.toString()} />;
}

function HeaderContent({ floatSearchEnabled = false, search = '' }: HeaderProps & { search?: string }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navItems = siteNavigation(pathname, search, floatSearchEnabled);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, search]);

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  // Hide header on the embed workbench and all embeddable widget pages —
  // the workbench renders its own top bar and the widgets are chromeless.
  if (pathname === '/embed' || pathname.startsWith('/embed/')) {
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
          <nav aria-label="Main navigation" data-ga-navigation="header_desktop" className="hidden lg:flex items-center gap-1 ml-8">
            {navItems.map((item) => {
              const active = item.active;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
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

          <AppLink
            data-ga-event="app_landing_click"
            data-ga-label="header"
            className="hidden lg:inline-flex items-center rounded-md border border-white/30 px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Get the App
          </AppLink>

          {/* Mobile hamburger */}
          <button
            ref={menuButton}
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-md text-primary-100 hover:text-white hover:bg-white/10 transition-colors"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div id="mobile-menu" className="lg:hidden border-t border-white/10" style={{ backgroundColor: '#0F2D35' }}>
          <nav aria-label="Mobile navigation" data-ga-navigation="header_mobile" className="px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const active = item.active;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={active ? 'page' : undefined}
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
            <AppLink
              data-ga-event="app_landing_click"
              data-ga-label="header"
              onClick={() => setMobileMenuOpen(false)}
              className="block rounded-md px-3 py-3 font-medium text-primary-100 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
            >
              Get the App
            </AppLink>
          </nav>
        </div>
      )}
    </header>
  );
}
