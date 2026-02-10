'use client';

// src/app/embed/widget/[slug]/page.tsx
// Embeddable widget for displaying river conditions + per-gauge status in an iframe
// Designed to be lightweight, compact, and self-contained for external sites
// SiteHeader is hidden via pathname check in SiteHeader component

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { CONDITION_COLORS } from '@/constants';
import { computeCondition, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';
import type { ConditionCode, RiverListItem } from '@/types/api';

interface GaugeThreshold {
  riverId: string;
  riverName: string;
  isPrimary: boolean;
  thresholdUnit: 'ft' | 'cfs';
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
}

interface GaugeStation {
  id: string;
  usgsSiteId: string;
  name: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  thresholds: GaugeThreshold[] | null;
}

interface GaugeWithCondition {
  id: string;
  name: string;
  usgsSiteId: string;
  isPrimary: boolean;
  value: string;
  unit: string;
  conditionCode: ConditionCode;
  conditionLabel: string;
  conditionColor: string;
}

const EDDY_IMAGES: Record<string, string> = {
  green: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  red: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
  yellow: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
  flag: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
};

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png';

function getEddyImage(code?: ConditionCode | null): string {
  if (!code) return EDDY_IMAGES.flag;
  switch (code) {
    case 'optimal':
    case 'low':
      return EDDY_IMAGES.green;
    case 'high':
    case 'dangerous':
      return EDDY_IMAGES.red;
    case 'very_low':
      return EDDY_IMAGES.yellow;
    default:
      return EDDY_IMAGES.flag;
  }
}

export default function EmbedWidgetPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const theme = searchParams.get('theme') || 'light';
  const isDark = theme === 'dark';

  const [river, setRiver] = useState<RiverListItem | null>(null);
  const [gauges, setGauges] = useState<GaugeWithCondition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch rivers and gauges in parallel
        const [riversRes, gaugesRes] = await Promise.all([
          fetch('/api/rivers'),
          fetch('/api/gauges'),
        ]);

        if (riversRes.ok) {
          const riversData = await riversRes.json();
          const found = riversData.rivers?.find((r: RiverListItem) => r.slug === slug);
          setRiver(found || null);

          if (found && gaugesRes.ok) {
            const gaugesData = await gaugesRes.json();
            const riverGauges: GaugeWithCondition[] = [];

            for (const gauge of (gaugesData.gauges || []) as GaugeStation[]) {
              // Find threshold entry for this river
              const threshold = gauge.thresholds?.find(
                (t: GaugeThreshold) => t.riverId === found.id
              );
              if (!threshold) continue;

              // Compute per-gauge condition
              const thresholdsForCompute: ConditionThresholds = {
                levelTooLow: threshold.levelTooLow,
                levelLow: threshold.levelLow,
                levelOptimalMin: threshold.levelOptimalMin,
                levelOptimalMax: threshold.levelOptimalMax,
                levelHigh: threshold.levelHigh,
                levelDangerous: threshold.levelDangerous,
                thresholdUnit: threshold.thresholdUnit,
              };
              const result = computeCondition(gauge.gaugeHeightFt, thresholdsForCompute, gauge.dischargeCfs);
              const useCfs = threshold.thresholdUnit === 'cfs';
              const primaryValue = useCfs ? gauge.dischargeCfs : gauge.gaugeHeightFt;

              riverGauges.push({
                id: gauge.id,
                name: gauge.name,
                usgsSiteId: gauge.usgsSiteId,
                isPrimary: threshold.isPrimary,
                value: primaryValue !== null
                  ? useCfs
                    ? primaryValue.toLocaleString()
                    : primaryValue.toFixed(2)
                  : '--',
                unit: useCfs ? 'cfs' : 'ft',
                conditionCode: result.code,
                conditionLabel: getConditionShortLabel(result.code),
                conditionColor: CONDITION_COLORS[result.code] || '#9ca3af',
              });
            }

            // Sort: primary first, then alphabetically
            riverGauges.sort((a, b) => {
              if (a.isPrimary && !b.isPrimary) return -1;
              if (!a.isPrimary && b.isPrimary) return 1;
              return a.name.localeCompare(b.name);
            });

            setGauges(riverGauges);
          }
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  const bg = isDark ? '#1a1a1a' : '#ffffff';
  const textPrimary = isDark ? '#e5e5e5' : '#1a1a1a';
  const textSecondary = isDark ? '#888' : '#777';
  const borderColor = isDark ? '#333' : '#e5e5e5';
  const cardBg = isDark ? '#222' : '#f9fafb';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180, background: bg }}>
        <div
          style={{
            width: 20,
            height: 20,
            border: '2px solid #2D7889',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!river) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180, background: bg, color: textSecondary, padding: 16, textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
        River not found
      </div>
    );
  }

  const conditionCode = river.currentCondition?.code;
  const conditionColor = conditionCode ? CONDITION_COLORS[conditionCode] : '#9ca3af';
  const eddyImage = getEddyImage(conditionCode);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: bg,
        color: textPrimary,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxSizing: 'border-box',
      }}
    >
      {/* Top: River name + Eddy mascot + overall condition */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Image
          src={eddyImage}
          alt="Eddy"
          width={44}
          height={44}
          style={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {river.name}
          </div>
          <div style={{ fontSize: 11, color: textSecondary, marginTop: 1 }}>
            {river.lengthMiles} mi &middot; {river.accessPointCount} access points
          </div>
        </div>
        {/* Overall condition pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 6,
            backgroundColor: `${conditionColor}15`,
            border: `1.5px solid ${conditionColor}35`,
            flexShrink: 0,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: conditionColor }} />
          <span style={{ fontWeight: 700, fontSize: 11, color: conditionColor, whiteSpace: 'nowrap' }}>
            {conditionCode ? getConditionShortLabel(conditionCode) : 'Unknown'}
          </span>
        </div>
      </div>

      {/* Gauge stations */}
      {gauges.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Gauge Stations
          </div>
          {gauges.map((gauge) => (
            <div
              key={gauge.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderRadius: 8,
                background: cardBg,
                border: `1px solid ${borderColor}`,
              }}
            >
              {/* Condition dot */}
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: gauge.conditionColor, flexShrink: 0 }} />
              {/* Gauge name */}
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {gauge.name}
                {gauge.isPrimary && (
                  <span style={{ fontSize: 9, fontWeight: 600, color: '#2D7889', marginLeft: 4, opacity: 0.8 }}>PRIMARY</span>
                )}
              </div>
              {/* Reading value */}
              <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>
                {gauge.value}
                <span style={{ fontWeight: 400, fontSize: 10, color: textSecondary, marginLeft: 2 }}>{gauge.unit}</span>
              </div>
              {/* Condition label */}
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: gauge.conditionColor,
                  padding: '2px 6px',
                  borderRadius: 4,
                  backgroundColor: `${gauge.conditionColor}15`,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {gauge.conditionLabel}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom: Links */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `1px solid ${borderColor}`,
          paddingTop: 8,
          marginTop: 2,
        }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <a
            href={`${origin}/rivers/${river.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: '#2D7889', textDecoration: 'none', fontWeight: 600 }}
          >
            River details &rarr;
          </a>
          <a
            href={`${origin}/gauges?river=${river.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: '#2D7889', textDecoration: 'none', fontWeight: 600 }}
          >
            All gauges &rarr;
          </a>
        </div>
        <a
          href={origin}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            color: textSecondary,
            textDecoration: 'none',
          }}
        >
          <Image
            src={EDDY_LOGO}
            alt="Eddy"
            width={16}
            height={16}
            style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '50%' }}
          />
          Powered by Eddy
        </a>
      </div>
    </div>
  );
}
