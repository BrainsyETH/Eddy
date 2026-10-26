import type { ReactNode } from 'react';
import FloatNavigation from '@/components/layout/FloatNavigation';

export default function FindFloatLayout({ children }: { children: ReactNode }) {
  return <><FloatNavigation activePath="/find-float" />{children}</>;
}
