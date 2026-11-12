'use client';

import { useAppDevice } from './useAppDevice';

/** Availability copy replaces unsupported install actions without changing public content. */
export default function AppAvailability({ className = '' }: { className?: string }) {
  return useAppDevice() === 'android'
    ? <p className={`text-sm text-neutral-600 ${className}`}>Available for iPhone only.</p>
    : null;
}
