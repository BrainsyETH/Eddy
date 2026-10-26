import type { CSSProperties, ReactNode } from 'react';
import FloatNavigation from '@/components/layout/FloatNavigation';
import { floatSearchLaunch } from '@/lib/float-search-launch';

export default function PlanLayout({ children }: { children: ReactNode }) {
  const showNavigation = floatSearchLaunch().web;
  return (
    <div style={{ '--plan-section-height': showNavigation ? '3rem' : '0rem' } as CSSProperties}>
      {showNavigation && <FloatNavigation activePath="/plan" />}
      {children}
    </div>
  );
}
