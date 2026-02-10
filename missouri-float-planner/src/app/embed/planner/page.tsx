'use client';

// src/app/embed/planner/page.tsx
// Embeddable float trip planner widget
// Allows visitors on external sites to plan a float and view it on Eddy

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ArrowRight } from 'lucide-react';
import type { RiverListItem, AccessPoint } from '@/types/api';

const EDDY_CANOE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';
const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png';

export default function EmbedPlannerPage() {
  const searchParams = useSearchParams();
  const theme = searchParams.get('theme') || 'light';
  const preselectedRiver = searchParams.get('river') || '';
  const isDark = theme === 'dark';

  const [rivers, setRivers] = useState<RiverListItem[]>([]);
  const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([]);
  const [selectedRiver, setSelectedRiver] = useState(preselectedRiver);
  const [selectedPutIn, setSelectedPutIn] = useState('');
  const [selectedTakeOut, setSelectedTakeOut] = useState('');
  const [loadingAP, setLoadingAP] = useState(false);

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
    fetch(`/api/rivers/${selectedRiver}/access-points`)
      .then(r => r.ok ? r.json() : { accessPoints: [] })
      .then(data => setAccessPoints(data.accessPoints || []))
      .catch(() => setAccessPoints([]))
      .finally(() => setLoadingAP(false));
  }, [selectedRiver]);

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

      {/* River Select */}
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
            <option key={r.id} value={r.slug}>{r.name}</option>
          ))}
        </select>
      </div>

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

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10, paddingTop: 8, borderTop: `1px solid ${borderColor}` }}>
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
