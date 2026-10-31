// src/components/access-point/AccessPointNav.tsx
// Navigation controls for supported POI and point-to-point links

'use client';

import Image from 'next/image';
import type { AccessPointDetail } from '@/types/api';
import {
  generateNavLinks,
  handleNavClick,
  detectPlatform,
  getNavCoordinates,
  type NavLink,
} from '@/lib/navigation';
import { shuttleDriveLinks } from '@/lib/navigation/shuttle';

// Navigation app icon URLs from Vercel blob storage
const NAV_APP_ICONS: Record<string, string> = {
  onx: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/onx.png',
  gaia: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/gaia.jpeg',
  google: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/google-maps.png',
  apple: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/Apple_Maps_Logo.png',
};

interface AccessPointNavProps {
  accessPoint: Pick<AccessPointDetail, 'coordinates' | 'name' | 'directionsOverride'> & Partial<Pick<AccessPointDetail, 'drivingLat' | 'drivingLng'>>;
  compact?: boolean;
  origin?: AccessPointNavProps['accessPoint'];
  /** Icon size in px. Defaults to 24 compact, 28 full. The tap target stays 44px. */
  iconSize?: number;
}

export default function AccessPointNav({ accessPoint, compact = false, origin, iconSize }: AccessPointNavProps) {
  const imageSize = iconSize ?? (compact ? 24 : 28);
  const coords = getNavCoordinates({
    drivingLat: accessPoint.drivingLat,
    drivingLng: accessPoint.drivingLng,
    coordinates: accessPoint.coordinates,
    name: accessPoint.name,
  });

  // onX and Gaia are single-location map shortcuts. Keep both available for
  // POIs, but offer only Google and Apple for point-to-point shuttle routes.
  const navLinks = generateNavLinks(coords, accessPoint.directionsOverride).filter(
    link => !origin || link.app === 'google' || link.app === 'apple'
  );
  // Driving apps receive both endpoints as coordinates, parking pair first.
  if (origin) {
    const drive = shuttleDriveLinks(origin, accessPoint);
    for (const link of navLinks) {
      if (link.app === 'google' || link.app === 'apple') {
        link.webFallback = drive[link.app];
        link.deepLink = link.webFallback;
      }
    }
  }
  const platform = detectPlatform();

  const handleClick = (e: React.MouseEvent, link: NavLink) => {
    // Let modified clicks (new tab, middle-click) use the plain href
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    // Universal driving links work directly in browsers and installed map apps.
    if (origin) return;
    e.preventDefault();
    handleNavClick(link, platform);
  };

  return (
    <div className={compact ? "flex shrink-0 items-center gap-0.5" : origin ? "grid grid-cols-2 gap-2" : "grid grid-cols-4 gap-2"}>
      {navLinks.map((link) => (
        <a
          key={link.app}
          href={link.webFallback}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => handleClick(e, link)}
          aria-label={link.app === 'onx' || link.app === 'gaia'
            ? `Open ${accessPoint.name} in ${link.label}`
            : `${origin ? `Shuttle from ${origin.name} to` : 'Directions to'} ${accessPoint.name} in ${link.label}`}
          title={link.app === 'onx' || link.app === 'gaia' ? `View location in ${link.label}` : link.label}
          className={compact
            ? "flex h-11 w-11 items-center justify-center rounded-lg hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 transition-colors no-underline"
            : "flex flex-col items-center justify-center gap-1.5 p-3 bg-white border border-neutral-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-colors min-h-[72px] no-underline"}
        >
          <div className="flex items-center justify-center" style={{ width: Math.max(32, imageSize), height: Math.max(32, imageSize) }}>
            {NAV_APP_ICONS[link.app] ? (
              <Image
                src={NAV_APP_ICONS[link.app]}
                alt=""
                width={imageSize}
                height={imageSize}
                className="rounded object-contain"
              />
            ) : (
              <span className="text-xl">{link.icon}</span>
            )}
          </div>
          {!compact && <span className="text-xs font-semibold text-neutral-900">{link.label}</span>}
        </a>
      ))}
    </div>
  );
}
