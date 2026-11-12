'use client';

import type { ReactNode } from 'react';
import { useAppDevice } from './useAppDevice';

/** Hide the entire invitation, so Android never gets copy with a missing action. */
export default function AppPromotion({ children }: { children: ReactNode }) {
  return useAppDevice() === 'android' ? null : children;
}
