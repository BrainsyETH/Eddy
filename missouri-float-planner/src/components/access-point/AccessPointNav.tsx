// src/components/access-point/AccessPointNav.tsx
// Navigation buttons for deep linking to Onx, Gaia, Google Maps, Apple Maps

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

// Navigation app icon URLs from Vercel blob storage
const NAV_APP_ICONS: Record<string, string> = {
  onx: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/onx.png',
  gaia: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/gaia.jpeg',
  google: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/google-maps.png',
  apple: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/Apple_Maps_Logo.png',
};

interface AccessPointNavProps {
  accessPoint: AccessPointDetail;
}

export default function AccessPointNav({ accessPoint }: AccessPointNavProps) {
  const coords = getNavCoordinates({
    drivingLat: accessPoint.drivingLat,
    drivingLng: accessPoint.drivingLng,
    coordinates: accessPoint.coordinates,
    name: accessPoint.name,
  });

  const navLinks = generateNavLinks(coords, accessPoint.directionsOverride);
  const platform = detectPlatform();

  const handleClick = (e: React.MouseEvent, link: NavLink) => {
    // Let modified clicks (new tab, middle-click) use the plain href
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    handleNavClick(link, platform);
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      {navLinks.map((link) => (
        <a
          key={link.app}
          href={link.webFallback}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => handleClick(e, link)}
          className="flex flex-col items-center justify-center gap-1.5 p-3 bg-white border border-neutral-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-colors min-h-[72px] no-underline"
        >
          <div className="flex items-center justify-center w-8 h-8">
            {NAV_APP_ICONS[link.app] ? (
              <Image
                src={NAV_APP_ICONS[link.app]}
                alt={link.label}
                width={28}
                height={28}
                className="rounded object-contain"
              />
            ) : (
              <span className="text-xl">{link.icon}</span>
            )}
          </div>
          <span className="text-xs font-semibold text-neutral-900">{link.label}</span>
        </a>
      ))}
    </div>
  );
}
