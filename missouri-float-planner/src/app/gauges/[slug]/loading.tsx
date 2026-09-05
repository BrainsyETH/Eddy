// src/app/gauges/[slug]/loading.tsx
// Loading skeleton for the gauge detail page — prevents a blank page on
// navigation. Each block matches the element that replaces it, so the page
// does not jump when the data lands.

import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';

export default function GaugeSlugLoading() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-5xl mx-auto px-4 py-8" role="status" aria-busy="true" aria-label="Loading gauge">
        <div className="space-y-6">
          {/* Back link */}
          <Skeleton className="h-4 w-24" />

          {/* Header */}
          <div>
            <Skeleton className="h-4 w-32 mb-3" />
            <Skeleton className="h-10 w-72 mb-2" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>

          {/* Chart + Reading Row */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            {/* Chart skeleton */}
            <Card variant="panel">
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton rounded="lg" className="h-7 w-32" />
              </div>
              <Skeleton rounded="lg" className="h-48 md:h-56 mx-4 mb-4" />
            </Card>

            {/* Right column skeleton */}
            <div className="flex flex-col gap-4">
              <Skeleton rounded="xl" className="h-36" />
              <Skeleton rounded="xl" className="h-24" />
            </div>
          </div>

          {/* Eddy Says skeleton */}
          <Card variant="panel" className="p-5">
            <div className="flex items-start gap-4">
              <Skeleton rounded="full" className="w-14 h-14 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
