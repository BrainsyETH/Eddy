'use client';

// src/app/embed/planner/page.tsx
// Embeddable float trip planner widget
// Allows visitors on external sites to plan a float and view it on Eddy

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { CONDITION_COLORS } from '@/constants';
import type { RiverListItem, AccessPoint } from '@/types/api';

const EDDY_CANOE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';
const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png';

// Condition helper labels (#17)
const CONDITION_LABELS: Record<string, string> = {
  optimal: 'Optimal',
  okay: 'Okay',
  low: 'Low',
  too_low: 'Too Low',
  high: 'High',
  dangerous: 'Flood',
  unknown: 'Unknown',
};

const CONDITION_WARNINGS: Record<string, string> = {
  dangerous: 'River is at flood stage — do not float.',
  high: 'High water — experienced paddlers only.',
  too_low: 'Too low to float comfortably.',
};

export default function EmbedPlannerPage() {
  const searchParams = useSearchParams();
  const theme = searchParams.get('theme') || 'light';
  const preselectedRiver = searchParams.get('river') || '';
  const partner = searchParams.get('partner') || ''; // (#19) partner branding
  const isDark = theme === 'dark';

  const [rivers, setRivers] = useState<RiverListItem[]>([]);
  const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([]);
  const [selectedRiver, setSelectedRiver] = useState(preselectedRiver);
  const [selectedPutIn, setSelectedPutIn] = useState('');
  const [selectedTakeOut, setSelectedTakeOut] = useState('');
  const [loadingAP, setLoadingAP] = useState(false);
  const [tripSummary, setTripSummary] = useState<{ distanceMiles: number; estimatedMinutes: number } | null>(null);

  // Get the selected river's condition (#17)
  const selectedRiverData = rivers.find(r => r.slug === selectedRiver);
  const conditionCode = selectedRiverData?.currentCondition?.code;
  const conditionColor = conditionCode ? CONDITION_COLORS[conditionCode] : undefined;
  const conditionWarning = conditionCode ? CONDITION_WARNINGS[conditionCode] : undefined;

  // Fetch rivers on mount
  useEffect(() => {
    fetch('/api/rivers')
      .then(r => r.ok ? r.json() : { rivers: [] })
      .then(data => {
        setRivers(data.rivers || []);
        if (preselectedRiver && data.rivers?.length) {
          setSelectedRiver(preselectedRiver);
        }
      })
      .catch(() => {});
  }, [preselectedRiver]);

  // Fetch access points when river changes
  useEffect(() => {
    if (!selectedRiver) {
      setAccessPoints([]);
      return;
    }
    setLoadingAP(true);
    setSelectedPutIn('');
    setSelectedTakeOut('');
    setTripSummary(null);
    fetch(`/api/rivers/${selectedRiver}/access-points`)
      .then(r => r.ok ? r.json() : { accessPoints: [] })
      .then(data => setAccessPoints(data.accessPoints || []))
      .catch(() => setAccessPoints([]))
      .finally(() => setLoadingAP(false));
  }, [selectedRiver]);

  // Compute mini trip summary when both points selected (#18)
  useEffect(() => {
    if (!selectedPutIn || !selectedTakeOut) {
      setTripSummary(null);
      return;
    }
    const putIn = accessPoints.find(ap => ap.id === selectedPutIn);
    const takeOut = accessPoints.find(ap => ap.id === selectedTakeOut);
    if (putIn && takeOut) {
      const distance = Math.abs(takeOut.riverMile - putIn.riverMile);
      // Rough estimate: ~2 mph average float speed
      const minutes = Math.round((distance / 2) * 60);
      setTripSummary({ distanceMiles: Math.round(distance * 10) / 10, estimatedMinutes: minutes });
    }
  }, [selectedPutIn, selectedTakeOut, accessPoints]);

  // Filter take-out to downstream of put-in
  const takeOutOptions = useMemo(() => {
    if (!selectedPutIn) return accessPoints;
    const putIn = accessPoints.find(ap => ap.id === selectedPutIn);
    if (!putIn) return accessPoints;
    return accessPoints.filter(ap => ap.riverMile > putIn.riverMile);
  }, [selectedPutIn, accessPoints]);

  const handlePutInChange = (id: string) => {
    setSelectedPutIn(id);
    setSelectedTakeOut('');
    setTripSummary(null);
  };

  const canSubmit = selectedRiver && selectedPutIn && selectedTakeOut;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';

  const bg = isDark ? '#1a1a1a' : '#ffffff';
  const cardBg = isDark ? '#252525' : '#f5f5f5';
  const textPrimary = isDark ? '#e5e5e5' : '#1a1a1a';
  const textSecondary = isDark ? '#888' : '#777';
  const inputBg = isDark ? '#333' : '#ffffff';
  const inputBorder = isDark ? '#444' : '#d4d4d4';
  const borderColor = isDark ? '#333' : '#e5e5e5';

  function formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} min`;
    if (mins === 0) return `${hours} hr`;
    return `${hours} hr ${mins} min`;
  }

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: bg,
        color: textPrimary,
        padding: '16px',
        boxSizing: 'border-box',
        minHeight: '100%',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Image src={EDDY_CANOE} alt="Eddy" width={36} height={36} style={{ width: 32, height: 32, objectFit: 'contain' }} />
        <div style={{ fontWeight: 700, fontSize: 15 }}>Plan Your Float</div>
      </div>

      {/* River Select with condition dot (#17) */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          River
        </label>
        <select
          value={selectedRiver}
          onChange={e => setSelectedRiver(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: 13,
            border: `1px solid ${inputBorder}`,
            borderRadius: 6,
            background: inputBg,
            color: textPrimary,
            appearance: 'none' as const,
            cursor: 'pointer',
          }}
        >
          <option value="">Select river...</option>
          {rivers.map(r => (
            <option key={r.id} value={r.slug}>
              {r.name}{r.currentCondition ? ` — ${CONDITION_LABELS[r.currentCondition.code] || 'Unknown'}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Condition banner (#17) */}
      {selectedRiver && conditionCode && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            marginBottom: 10,
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            backgroundColor: `${conditionColor}15`,
            border: `1px solid ${conditionColor}30`,
            color: conditionColor,
          }}
        >
          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: conditionColor, flexShrink: 0 }} />
          {conditionWarning || `${CONDITION_LABELS[conditionCode] || 'Unknown'} conditions`}
        </div>
      )}

      {/* Put-In / Take-Out Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Put-In
          </label>
          <select
            value={selectedPutIn}
            onChange={e => handlePutInChange(e.target.value)}
            disabled={!selectedRiver || loadingAP}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 12,
              border: `1px solid ${inputBorder}`,
              borderRadius: 6,
              background: inputBg,
              color: textPrimary,
              opacity: (!selectedRiver || loadingAP) ? 0.5 : 1,
              cursor: (!selectedRiver || loadingAP) ? 'not-allowed' : 'pointer',
            }}
          >
            <option value="">{loadingAP ? 'Loading...' : 'Select...'}</option>
            {accessPoints.map(ap => (
              <option key={ap.id} value={ap.id}>{ap.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Take-Out
          </label>
          <select
            value={selectedTakeOut}
            onChange={e => setSelectedTakeOut(e.target.value)}
            disabled={!selectedPutIn}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 12,
              border: `1px solid ${inputBorder}`,
              borderRadius: 6,
              background: inputBg,
              color: textPrimary,
              opacity: !selectedPutIn ? 0.5 : 1,
              cursor: !selectedPutIn ? 'not-allowed' : 'pointer',
            }}
          >
            <option value="">Select...</option>
            {takeOutOptions.map(ap => (
              <option key={ap.id} value={ap.id}>{ap.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mini trip summary (#18) */}
      {tripSummary && canSubmit && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: '8px 12px',
            marginBottom: 10,
            borderRadius: 8,
            background: cardBg,
            border: `1px solid ${borderColor}`,
            fontSize: 12,
            color: textSecondary,
          }}
        >
          <div>
            <span style={{ fontWeight: 700, color: textPrimary, fontSize: 14 }}>{tripSummary.distanceMiles}</span>
            <span style={{ marginLeft: 3 }}>mi</span>
          </div>
          <div style={{ width: 1, height: 16, background: borderColor }} />
          <div>
            <span style={{ fontWeight: 700, color: textPrimary, fontSize: 14 }}>~{formatTime(tripSummary.estimatedMinutes)}</span>
            <span style={{ marginLeft: 3 }}>float</span>
          </div>
          {conditionCode && conditionColor && (
            <>
              <div style={{ width: 1, height: 16, background: borderColor }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: conditionColor }} />
                <span style={{ fontWeight: 600, color: conditionColor, fontSize: 11 }}>
                  {CONDITION_LABELS[conditionCode]}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Submit */}
      {canSubmit ? (
        <a
          href={`${origin}/rivers/${selectedRiver}?putIn=${selectedPutIn}&takeOut=${selectedTakeOut}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            padding: '10px 16px',
            background: '#F07052',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            borderRadius: 8,
            textDecoration: 'none',
            border: 'none',
            cursor: 'pointer',
            boxSizing: 'border-box',
            boxShadow: '0 1px 3px rgba(240,112,82,0.3)',
          }}
        >
          View Trip Details
          <ArrowRight size={14} />
        </a>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            padding: '10px 16px',
            background: cardBg,
            color: textSecondary,
            fontWeight: 600,
            fontSize: 13,
            borderRadius: 8,
            boxSizing: 'border-box',
          }}
        >
          Select all options above
        </div>
      )}

      {/* Footer with optional partner branding (#19) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: partner ? 'space-between' : 'flex-end', marginTop: 10, paddingTop: 8, borderTop: `1px solid ${borderColor}` }}>
        {partner && (
          <span style={{ fontSize: 10, color: textSecondary, fontWeight: 500 }}>
            via {partner}
          </span>
        )}
        <a
          href={origin}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: textSecondary, textDecoration: 'none' }}
        >
          <Image src={EDDY_LOGO} alt="Eddy" width={14} height={14} style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '50%' }} />
          Powered by Eddy
        </a>
      </div>
    </div>
  );
}
