'use client';

// src/app/gauges/page.tsx
// Redesigned river gauges dashboard — clean, spacious layout inspired by modern design

import React, { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, X, ArrowRight, Activity, Shield, Bell } from 'lucide-react';

import type { ConditionCode } from '@/types/api';
import { EDDY_IMAGES, CONDITION_COLORS } from '@/constants';
import SiteFooter from '@/components/ui/SiteFooter';
import { useGaugeHistoryPrefetch } from '@/hooks/useGaugeHistory';
import { useRiverGroups } from '@/hooks/useRiverGroups';
import RiverCard from '@/components/gauge/RiverCard';

// Pill background color for active condition filter
const getComputedPillColor = (code: ConditionCode): string => {
  switch (code) {
    case 'too_low': return '#737373';
    case 'low': return '#eab308';
    case 'okay': return '#84cc16';
    case 'optimal': return '#10b981';
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

  // Stats for condition pills
  const stats = useMemo(() => {
    const counts = { total: 0, optimal: 0, okay: 0, low: 0, high: 0, flood: 0, tooLow: 0 };
    riverGroups.forEach(river => {
      counts.total++;
      switch (river.condition.code) {
        case 'optimal': counts.optimal++; break;
        case 'okay': counts.okay++; break;
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

  // Pick top 2 featured rivers (best condition first)
  const featuredRivers = useMemo(() => {
    const priority: Record<string, number> = { optimal: 0, okay: 1, low: 2, too_low: 3, high: 4, dangerous: 5 };
    return [...riverGroups]
      .sort((a, b) => (priority[a.condition.code] ?? 6) - (priority[b.condition.code] ?? 6))
      .slice(0, 2);
  }, [riverGroups]);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #163F4A 40%, #1A4F5C 100%)' }}>
        {/* Topographic wave pattern */}
        <div className="absolute inset-0 opacity-[0.07]">
          <svg className="absolute bottom-0 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path fill="white" d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,218.7C672,235,768,245,864,234.7C960,224,1056,192,1152,181.3C1248,171,1344,181,1392,186.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
          <svg className="absolute bottom-8 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path fill="white" d="M0,256L60,240C120,224,240,192,360,186.7C480,181,600,203,720,208C840,213,960,203,1080,186.7C1200,171,1320,149,1380,138.7L1440,128L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z" />
          </svg>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-20">
          <div className="flex items-center justify-between gap-8">
            <div className="flex-1">
              {/* Live badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 mb-6">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-medium text-white/80">Live Gauge Updates</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Navigate the<br />
                <span style={{ color: '#F07052' }}>Current.</span>
              </h1>
              <p className="text-base md:text-lg text-white/60 max-w-lg mb-8">
                Real-time USGS gauge data and river analysis for Missouri float rivers — updated hourly.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/rivers"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors no-underline"
                  style={{ backgroundColor: '#163F4A', color: 'white', border: '2px solid #2D7889' }}
                >
                  Explore Rivers
                </Link>
                <Link
                  href="/map"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white rounded-lg text-sm font-semibold text-neutral-900 hover:bg-neutral-50 transition-colors no-underline"
                >
                  View Live Map
                </Link>
              </div>
            </div>

            {/* Otter mascot */}
            <div className="hidden md:block flex-shrink-0">
              <Image
                src={EDDY_IMAGES.canoe}
                alt="Eddy the Otter"
                width={280}
                height={280}
                className="w-48 lg:w-64 h-auto drop-shadow-[0_8px_32px_rgba(240,112,82,0.25)]"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* Live Gauge Data Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-16">
        {/* Section header */}
        <div className="flex items-end justify-between mb-2">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
              Live Gauge Data
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Real-time readings from {stats.total} monitoring stations across Missouri.
            </p>
          </div>
          <Link
            href="#all-gauges"
            className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors no-underline"
          >
            View All Gauges
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="w-16 h-0.5 bg-neutral-200 mb-8" />

        {isLoading ? (
          <div className="space-y-8">
            {/* Featured skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[0, 1].map(i => (
                <div key={i} className="bg-neutral-50 rounded-2xl p-6 h-52 animate-pulse" />
              ))}
            </div>
            {/* Grid skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="bg-neutral-50 rounded-2xl p-6 h-40 animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Featured River Cards (top 2) */}
            {!hasActiveFilters && featuredRivers.length >= 2 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                {featuredRivers.map((river) => (
                  <RiverCard key={river.riverId} riverGroup={river} featured />
                ))}
              </div>
            )}

            {/* Explore Gauges CTA */}
            {!hasActiveFilters && (
              <div className="rounded-2xl overflow-hidden mb-10" style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #1A4F5C 100%)' }}>
                <div className="px-6 py-8 md:px-8 md:py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                      Explore Gauges Nearby
                    </h3>
                    <p className="text-sm text-white/60 max-w-md">
                      Check real-time flow data for any river across Missouri to find the best conditions.
                    </p>
                  </div>
                  <Link
                    href="/map"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-white rounded-lg text-sm font-semibold text-neutral-900 hover:bg-neutral-100 transition-colors no-underline flex-shrink-0"
                  >
                    View Interactive Map
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            )}

            {/* Filter Bar */}
            <div id="all-gauges" className="mb-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search rivers or gauges..."
                    className="w-full pl-10 pr-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-colors"
                  />
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Clear filters
                  </button>
                )}
              </div>

              {/* Condition pills */}
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'too_low' as ConditionCode, count: stats.tooLow, label: 'Too Low' },
                  { key: 'low' as ConditionCode, count: stats.low, label: 'Low' },
                  { key: 'okay' as ConditionCode, count: stats.okay, label: 'Okay' },
                  { key: 'optimal' as ConditionCode, count: stats.optimal, label: 'Optimal' },
                  { key: 'high' as ConditionCode, count: stats.high, label: 'High' },
                  { key: 'dangerous' as ConditionCode, count: stats.flood, label: 'Flood' },
                ]).map(stat => {
                  const isActive = selectedCondition === stat.key;
                  return (
                    <button
                      key={stat.key}
                      onClick={() => setSelectedCondition(isActive ? 'all' : stat.key)}
                      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'text-white shadow-sm'
                          : 'bg-neutral-50 border border-neutral-200 text-neutral-600 hover:bg-neutral-100 hover:border-neutral-300'
                      }`}
                      style={isActive ? { backgroundColor: getComputedPillColor(stat.key) } : undefined}
                    >
                      {!isActive && (
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: CONDITION_COLORS[stat.key] }}
                        />
                      )}
                      {stat.label}
                      <span className={`tabular-nums ${isActive ? 'text-white/70' : 'text-neutral-400'}`}>{stat.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* All River Cards */}
            {filteredRivers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredRivers.map((river) => (
                  <RiverCard key={river.riverId} riverGroup={river} />
                ))}
              </div>
            ) : (
              <div className="bg-neutral-50 rounded-2xl p-12 text-center">
                <p className="text-neutral-500 mb-4">No rivers match your current filters.</p>
                <button
                  onClick={clearFilters}
                  className="px-5 py-2.5 bg-neutral-900 text-white rounded-xl text-sm font-semibold hover:bg-neutral-800 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Expert Analysis Section */}
      <section className="bg-neutral-50 border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
            {/* Eddy's Analysis Card */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 md:p-8">
              <div className="flex items-center gap-3 mb-4">
                <Image
                  src={EDDY_IMAGES.green}
                  alt="Eddy the Otter"
                  width={48}
                  height={48}
                  className="w-12 h-12"
                />
                <div>
                  <p className="text-sm font-bold text-neutral-900">Eddy&apos;s Analysis</p>
                  <p className="text-xs text-neutral-500">AI-powered river insights</p>
                </div>
              </div>
              <blockquote className="text-sm text-neutral-700 leading-relaxed mb-4 italic">
                &ldquo;Watch out for the shoals — current flows are pushing more water than usual today.&rdquo;
              </blockquote>
              <div className="flex items-center gap-4 text-xs text-neutral-500">
                <span className="tabular-nums">Updated hourly</span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold">
                  Moderate
                </span>
              </div>
            </div>

            {/* Feature highlights */}
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Expert Analysis.<br />Friendly Delivery.
              </h2>
              <p className="text-sm text-neutral-500 mb-6 max-w-md">
                Eddy isn&apos;t just a mascot. He&apos;s an integrated AI guide that processes thousands of USGS data points to give you the most accurate safety briefing available.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">Hazard Detection</p>
                    <p className="text-xs text-neutral-500">Real-time conditions matched to threshold data for risk alerts.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">Real-time Conditions</p>
                    <p className="text-xs text-neutral-500">Live USGS data cross-referenced for accurate float-or-wait calls.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Bell className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">Optimal Window Alerts</p>
                    <p className="text-xs text-neutral-500">Notifications when a river hits your preferred conditions.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Data attribution */}
      <section className="border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-xs text-center text-neutral-400">
            All gauge data provided by the <strong className="text-neutral-500">United States Geological Survey (USGS)</strong> through their Water Services API. Readings updated hourly, typically lagging real-time by 15-60 minutes.
          </p>
        </div>
      </section>

      <SiteFooter maxWidth="max-w-6xl" />
    </div>
  );
}
