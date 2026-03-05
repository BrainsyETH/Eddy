// src/components/ui/SiteFooter.tsx
// Shared footer component used across all pages

import Link from 'next/link';

interface SiteFooterProps {
  /** Show the safety disclaimer block above the footer text */
  showSafetyDisclaimer?: boolean;
  /** Optional subtitle override (defaults to USGS attribution) */
  subtitle?: string;
  /** Max width class (defaults to max-w-5xl) */
  maxWidth?: string;
  /** Additional top margin class */
  className?: string;
}

export default function SiteFooter({
  showSafetyDisclaimer = false,
  subtitle = 'Water data from USGS \u00b7 Always check local conditions before floating',
  maxWidth = 'max-w-5xl',
  className = '',
}: SiteFooterProps) {
  return (
    <footer className={`bg-primary-800 border-t-2 border-neutral-900 px-4 py-8 ${className}`}>
      <div className={`${maxWidth} mx-auto`}>
        {showSafetyDisclaimer && (
          <div className="mb-4 p-4 bg-primary-700/50 rounded-lg border border-primary-600/30">
            <p className="text-sm text-primary-100 text-center">
              <strong className="text-white">Safety First:</strong> Eddy is a planning guide only. Always consult local outfitters and authorities for current conditions before floating. Water levels can change rapidly. Wear life jackets and never float alone.
            </p>
          </div>
        )}
        <div className="text-center">
          <p className="text-primary-200 mb-2">
            <Link href="/" className="hover:text-white transition-colors">
              Eddy
            </Link>
            {' '}&middot; Missouri River Float Trip Planner
          </p>
          <p className="text-sm text-primary-300">
            {subtitle}
          </p>
        </div>
      </div>
    </footer>
  );
}
