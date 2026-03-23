'use client';

// src/app/gauges/page.tsx
// River-focused gauges dashboard — one card per river with Eddy Says, sparkline, and condition

import React, { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';

import type { ConditionCode } from '@/types/api';
import { EDDY_IMAGES } from '@/constants';
import SiteFooter from '@/components/ui/SiteFooter';
import { useGaugeHistoryPrefetch } from '@/hooks/useGaugeHistory';
import { useRiverGroups } from '@/hooks/useRiverGroups';
import RiverCard from '@/components/gauge/RiverCard';

// Pill background color for active condition filter
const getComputedPillColor = (code: ConditionCode): string => {
  switch (code) {
    case 'too_low': return '#737373';
    case 'low': return '#eab308';
    case 'good': return '#84cc16';
    case 'flowing': return '#10b981';
    case 'high': return '#f97316';
    case 'dangerous': return '#ef4444';
    default: return '#737373';
  }
};

export default function GaugesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { riverGroups, isLoading } = useRiverGroups();
  const prefetchHistory = useGaugeHistoryPrefetch();

  const [selectedCondition, setSelectedCondition] = useState<ConditionCode | 'all'>((searchParams.get('condition') as ConditionCode) || 'all');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');

  // Deep-link: ?gauge= redirects to detail page
  useEffect(() => {
    const gaugeParam = searchParams.get('gauge');
    if (gaugeParam) {
      router.replace(`/gauges/${gaugeParam}`);
    }
  }, [searchParams, router]);

  // Persist filter state in URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedCondition !== 'all') params.set('condition', selectedCondition); else params.delete('condition');
    if (searchQuery) params.set('q', searchQuery); else params.delete('q');
    // Remove legacy params
    params.delete('riverFilter');
    params.delete('group');
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [selectedCondition, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefetch history for primary gauges
  useEffect(() => {
    if (riverGroups.length === 0) return;
    const timeout = setTimeout(() => {
      const siteIds = riverGroups.slice(0, 9).map(g => g.primaryGauge.usgsSiteId);
      prefetchHistory(siteIds, 3);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [riverGroups, prefetchHistory]);

  // Filter rivers
  const filteredRivers = useMemo(() => {
    return riverGroups.filter(river => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = river.riverName.toLowerCase().includes(q);
        const gaugeMatch = river.allGauges.some(g => g.name.toLowerCase().includes(q));
        if (!nameMatch && !gaugeMatch) return false;
      }
      if (selectedCondition !== 'all') {
        if (river.condition.code !== selectedCondition) return false;
      }
      return true;
    });
  }, [riverGroups, searchQuery, selectedCondition]);

  // Stats for condition pills (count rivers, not gauges)
  const stats = useMemo(() => {
    const counts = { total: 0, flowing: 0, good: 0, low: 0, high: 0, flood: 0, tooLow: 0 };
    riverGroups.forEach(river => {
      counts.total++;
      switch (river.condition.code) {
        case 'flowing': counts.flowing++; break;
        case 'good': counts.good++; break;
        case 'low': counts.low++; break;
        case 'high': counts.high++; break;
        case 'dangerous': counts.flood++; break;
        case 'too_low': counts.tooLow++; break;
      }
    });
    return counts;
  }, [riverGroups]);

  const clearFilters = () => {
    setSelectedCondition('all');
    setSearchQuery('');
  };

  const hasActiveFilters = selectedCondition !== 'all' || searchQuery !== '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50">
      {/* Hero */}
      <section
        className="relative py-8 md:py-10 text-white overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #1A4550 50%, #0F2D35 100%)' }}
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute bottom-0 left-0 right-0 h-24"
               style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.03) 40px, rgba(255,255,255,0.03) 80px)' }} />
        </div>

        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-6 md:gap-8">
            <Image
              src={EDDY_IMAGES.flood}
              alt="Eddy the Otter"
              width={300}
              height={300}
              className="h-20 md:h-28 w-auto drop-shadow-[0_4px_24px_rgba(240,112,82,0.3)]"
              priority
            />
            <div>
              <h1
                className="text-2xl md:text-4xl font-bold mb-1"
                style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
              >
                River Levels
              </h1>
              <p className="text-sm md:text-base text-white/70 max-w-md">
                Real-time USGS gauge data for Missouri float rivers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        {isLoading ? (
          <div className="space-y-6">
            <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
              <div className="flex gap-3">
                <div className="skeleton h-10 flex-1 max-w-xs rounded-lg" />
              </div>
              <div className="flex gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-7 w-20 rounded-full" />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-neutral-200 p-5 h-48" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Filter Bar */}
            <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-6 space-y-3">
              {/* Row 1: Search + Clear */}
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-3">
                <div className="relative flex-1 min-w-0 md:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search rivers..."
                    className="w-full pl-9 pr-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                )}
              </div>

              {/* Row 2: Condition pills */}
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'too_low' as ConditionCode, count: stats.tooLow, label: 'Too Low', dot: 'bg-neutral-500' },
                  { key: 'low' as ConditionCode, count: stats.low, label: 'Low', dot: 'bg-yellow-500' },
                  { key: 'good' as ConditionCode, count: stats.good, label: 'Good', dot: 'bg-lime-500' },
                  { key: 'flowing' as ConditionCode, count: stats.flowing, label: 'Flowing', dot: 'bg-emerald-500' },
                  { key: 'high' as ConditionCode, count: stats.high, label: 'High', dot: 'bg-orange-500' },
                  { key: 'dangerous' as ConditionCode, count: stats.flood, label: 'Flood', dot: 'bg-red-500' },
                ]).map(stat => {
                  const isActive = selectedCondition === stat.key;
                  return (
                    <button
                      key={stat.key}
                      onClick={() => setSelectedCondition(isActive ? 'all' : stat.key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        isActive
                          ? 'text-white shadow-sm'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }`}
                      style={isActive ? { backgroundColor: getComputedPillColor(stat.key) } : undefined}
                    >
                      {!isActive && <span className={`w-2 h-2 rounded-full ${stat.dot}`} />}
                      {stat.label}
                      <span className={`tabular-nums ${isActive ? 'text-white/80' : 'text-neutral-500'}`}>{stat.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* River Cards */}
            {filteredRivers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredRivers.map((river) => (
                  <RiverCard key={river.riverId} riverGroup={river} />
                ))}
              </div>
            ) : (
              <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
                <p className="text-neutral-600">No rivers match your current filters.</p>
                <button
                  onClick={clearFilters}
                  className="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            )}

            {/* Info box */}
            <div className="mt-8 bg-primary-50 border border-primary-200 rounded-xl p-6">
              <h3 className="text-base font-bold text-neutral-900 mb-2">About This Data</h3>
              <div className="text-sm text-neutral-700 space-y-2">
                <p>
                  All gauge data is provided by the <strong>United States Geological Survey (USGS)</strong> through
                  their Water Services API. Readings are updated hourly and typically lag real-time conditions by
                  15-60 minutes.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <SiteFooter maxWidth="max-w-5xl" className="mt-12" />
    </div>
  );
}
