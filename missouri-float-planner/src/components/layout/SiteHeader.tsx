'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import AppLink from '@/components/AppLink';
import { Menu, X } from 'lucide-react';
import { siteNavigation } from '@/lib/navigation/site-navigation';

type HeaderProps = { floatSearchEnabled?: boolean; campingEnabled?: boolean };

export default function SiteHeader({ floatSearchEnabled = false, campingEnabled = false }: HeaderProps) {
  return (
    <Suspense fallback={<HeaderContent floatSearchEnabled={floatSearchEnabled} campingEnabled={campingEnabled} />}>
      <ContextualHeader floatSearchEnabled={floatSearchEnabled} campingEnabled={campingEnabled} />
    </Suspense>
  );
}

function ContextualHeader(props: HeaderProps) {
  const searchParams = useSearchParams();
  return <HeaderContent {...props} search={searchParams.toString()} />;
}

function HeaderContent({ floatSearchEnabled = false, campingEnabled = false, search = '' }: HeaderProps & { search?: string }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navItems = siteNavigation(pathname, search, floatSearchEnabled, campingEnabled);

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
  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/embed' || pathname.startsWith('/embed/')) {
    return null;
  }

  return (
    // Light, warm chrome like the iOS app's navigation bar: Sandbar Tan paper
    // under a blur, a hairline instead of a heavy rule, coral for Eddy's name
    // and the current page, and teal for the one filled action.
    <header className="sticky top-0 z-50 border-b border-secondary-200 bg-secondary-50/90 backdrop-blur-md backdrop-saturate-150">
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
            <span className="font-display text-[1.375rem] font-bold text-accent-600">
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
                  className={`relative px-3 py-2 rounded-lg text-sm no-underline transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
                    active
                      ? 'font-semibold text-primary-800 after:absolute after:inset-x-3 after:bottom-0.5 after:h-[3px] after:rounded-full after:bg-accent-500'
                      : 'font-medium text-neutral-900 hover:bg-accent-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          <AppLink trackView
            data-ga-label="header"
            className="hidden lg:inline-flex shrink-0 min-h-11 whitespace-nowrap items-center rounded-full bg-primary-700 px-4 py-2 text-sm font-semibold text-white no-underline transition-colors duration-fast hover:bg-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            Get Eddy for iPhone
          </AppLink>

          {/* Mobile hamburger */}
          <button
            ref={menuButton}
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-neutral-900 hover:bg-accent-100 transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
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
        <div id="mobile-menu" className="lg:hidden border-t border-secondary-200 bg-secondary-50">
          <nav aria-label="Mobile navigation" data-ga-navigation="header_mobile" className="px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const active = item.active;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`block px-3 py-3 rounded-lg no-underline transition-colors duration-fast ${
                    active
                      ? 'bg-accent-100 font-semibold text-primary-800'
                      : 'font-medium text-neutral-900 hover:bg-accent-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <AppLink trackView
              data-ga-label="header"
              onClick={() => setMobileMenuOpen(false)}
              className="block rounded-lg px-3 py-3 font-semibold text-primary-700 no-underline hover:bg-accent-100 focus-visible:outline-2 focus-visible:outline-primary-600"
            >
              Get Eddy for iPhone
            </AppLink>
          </nav>
        </div>
      )}
    </header>
  );
}
