// src/components/ui/SiteFooter.tsx
// Shared footer component used across all pages — matches landing page footer

import Link from 'next/link';

interface SiteFooterProps {
  /** Show the safety disclaimer block above the footer text */
  showSafetyDisclaimer?: boolean;
  /** Max width class (defaults to max-w-5xl) */
  maxWidth?: string;
  /** Additional classes */
  className?: string;
}

export default function SiteFooter({
  showSafetyDisclaimer = true,
  maxWidth = 'max-w-5xl',
  className = '',
}: SiteFooterProps) {
  return (
    <footer className={`bg-primary-800 border-t-2 border-neutral-900 px-4 py-6 ${className}`}>
      <div className={`${maxWidth} mx-auto`}>
        {showSafetyDisclaimer && (
          <div className="mb-4 p-4 bg-primary-700/50 rounded-lg border border-primary-600/30">
            <p className="text-sm text-primary-100 text-center">
              <strong className="text-white">Safety First:</strong> Eddy is a planning guide only. Always consult local outfitters and authorities for current conditions before floating. Water levels can change rapidly. Wear life jackets and never float alone.
            </p>
          </div>
        )}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-primary-200">
          <div className="flex items-center gap-4">
            <p>Eddy &middot; Water data from USGS</p>
            <Link href="/about" className="hover:text-white transition-colors">About</Link>
            <Link href="/embed" className="hover:text-white transition-colors">Embed Widgets</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          </div>
          <p className="text-center md:text-right text-primary-300">
            &copy; {new Date().getFullYear()} eddy.guide &middot; For informational purposes only
          </p>
        </div>
      </div>
    </footer>
  );
}
