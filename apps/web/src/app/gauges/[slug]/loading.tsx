// src/app/gauges/[slug]/loading.tsx
// Loading skeleton for river gauge detail page — prevents blank page on navigation

export default function GaugeSlugLoading() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          {/* Back link */}
          <div className="h-4 w-24 bg-neutral-200 rounded" />

          {/* Header */}
          <div>
            <div className="h-4 w-32 bg-neutral-200 rounded mb-3" />
            <div className="h-10 w-72 bg-neutral-200 rounded mb-2" />
            <div className="h-4 w-96 bg-neutral-200 rounded" />
          </div>

          {/* Chart + Reading Row */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            {/* Chart skeleton */}
            <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <div className="h-5 w-40 bg-neutral-200 rounded" />
                <div className="h-7 w-32 bg-neutral-100 rounded-lg" />
              </div>
              <div className="h-48 md:h-56 mx-4 mb-4 bg-neutral-100 rounded-lg" />
            </div>

            {/* Right column skeleton */}
            <div className="flex flex-col gap-4">
              <div className="h-36 bg-white border border-neutral-200 rounded-xl" />
              <div className="h-24 bg-white border border-neutral-200 rounded-xl" />
            </div>
          </div>

          {/* Eddy Says skeleton */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-neutral-200 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 bg-neutral-200 rounded" />
                <div className="h-4 w-full bg-neutral-200 rounded" />
                <div className="h-4 w-3/4 bg-neutral-200 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
