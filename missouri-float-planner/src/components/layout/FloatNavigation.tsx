'use client';

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import SectionNavigation from './SectionNavigation';
import { floatNavigation } from '@/lib/navigation/site-navigation';

function ContextualFloatNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return <SectionNavigation label="Floats" links={floatNavigation(pathname, searchParams.toString())} />;
}

export default function FloatNavigation({ activePath }: { activePath: '/plan' | '/find-float' }) {
  return (
    <Suspense fallback={<SectionNavigation label="Floats" links={floatNavigation(activePath)} />}>
      <ContextualFloatNavigation />
    </Suspense>
  );
}
