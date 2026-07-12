// src/components/ui/SiteFooter.tsx
// Shared footer component used across all pages — multi-column layout

import Link from 'next/link';
import { Instagram, Facebook, type LucideIcon } from 'lucide-react';
import { SOCIAL_LINKS } from '@/constants/social';

const SOCIAL_ICONS: Record<string, LucideIcon> = { instagram: Instagram, facebook: Facebook };

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
    <footer className={`bg-primary-800 border-t-2 border-neutral-900 px-4 py-8 ${className}`}>
      <div className={`${maxWidth} mx-auto`}>
        {showSafetyDisclaimer && (
          <div className="mb-6 p-4 bg-primary-700/50 rounded-lg border border-primary-600/30">
            <p className="text-sm text-primary-100 text-center">
              <strong className="text-white">Safety First:</strong> Eddy is a planning guide only. Always consult local outfitters and authorities for current conditions before floating. Water levels can change rapidly. Wear life jackets and never float alone.
            </p>
          </div>
        )}

        {/* Multi-column footer links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6 text-sm">
          <div>
            <h3 className="text-white font-semibold mb-2">Plan</h3>
            <ul className="space-y-1.5">
              <li><Link href="/rivers" className="text-primary-200 hover:text-white transition-colors">River Reports</Link></li>
              <li><Link href="/plan" className="text-primary-200 hover:text-white transition-colors">Plan a Float</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Learn</h3>
            <ul className="space-y-1.5">
              <li><Link href="/blog" className="text-primary-200 hover:text-white transition-colors">River Guides</Link></li>
              <li><Link href="/about" className="text-primary-200 hover:text-white transition-colors">How Eddy Works</Link></li>
              <li><Link href="/about#conditions" className="text-primary-200 hover:text-white transition-colors">Condition Codes</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Connect</h3>
            <ul className="space-y-1.5">
              <li><Link href="/embed" className="text-primary-200 hover:text-white transition-colors">Widgets</Link></li>
              {SOCIAL_LINKS.map((s) => {
                const Icon = SOCIAL_ICONS[s.icon];
                return (
                  <li key={s.label}>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Eddy on ${s.label}`}
                      className="inline-flex items-center gap-2 text-primary-200 hover:text-white transition-colors"
                    >
                      {Icon && <Icon className="w-4 h-4" aria-hidden />}
                      {s.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Legal</h3>
            <ul className="space-y-1.5">
              <li><Link href="/privacy" className="text-primary-200 hover:text-white transition-colors">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-primary-600/30 pt-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-primary-300">
          <p>Eddy &middot; Water data from USGS</p>
          <p className="text-center md:text-right">
            &copy; {new Date().getFullYear()} eddy.guide &middot; For informational purposes only
          </p>
        </div>
      </div>
    </footer>
  );
}
