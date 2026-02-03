// src/components/access-point/AccessPointNav.tsx
// Navigation buttons for deep linking to Onx, Gaia, Google Maps, Apple Maps

'use client';

import type { AccessPointDetail } from '@/types/api';
import {
  generateNavLinks,
  handleNavClick,
  detectPlatform,
  getNavCoordinates,
  type NavLink,
} from '@/lib/navigation';

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

  const handleClick = (link: NavLink) => {
    handleNavClick(link, platform);
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      {navLinks.map((link) => (
        <button
          key={link.app}
          onClick={() => handleClick(link)}
          className="flex flex-col items-center gap-1 p-3 bg-white border border-neutral-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-colors min-h-[72px]"
        >
          <span className="text-xl">{link.icon}</span>
          <span className="text-xs font-semibold text-neutral-900">{link.label}</span>
          <span className="text-[10px] text-neutral-500">{link.subtitle}</span>
        </button>
      ))}
    </div>
  );
}
