// src/app/api/og/plan/route.tsx
// Dynamic OG image for shared float plans
// Layout: Eddy logo left, plan info center, gauge data hero bottom

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

type ConditionCode = 'dangerous' | 'high' | 'optimal' | 'low' | 'very_low' | 'too_low' | 'unknown';

const conditionDisplay: Record<ConditionCode, { label: string; color: string; bg: string }> = {
  optimal:   { label: 'Optimal',         color: '#1A3D23', bg: '#4EB86B' },
  low:       { label: 'Low - Floatable', color: '#3D3425', bg: '#84CC16' },
  very_low:  { label: 'Very Low',        color: '#3D3425', bg: '#EAB308' },
  high:      { label: 'High Water',      color: '#ffffff', bg: '#F97316' },
  too_low:   { label: 'Too Low',         color: '#2D2A24', bg: '#C2BAAC' },
  dangerous: { label: 'Dangerous',       color: '#ffffff', bg: '#DC2626' },
  unknown:   { label: 'Unknown',         color: '#2D2A24', bg: '#C2BAAC' },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const river = searchParams.get('river') || 'Missouri River';
  const putIn = searchParams.get('putIn') || 'Start';
  const takeOut = searchParams.get('takeOut') || 'End';
  const distance = searchParams.get('distance') || '';
  const floatTime = searchParams.get('floatTime') || '';
  const condition = (searchParams.get('condition') || 'unknown') as ConditionCode;
  const gaugeName = searchParams.get('gaugeName') || '';
  const gaugeHeight = searchParams.get('gaugeHeight') || '';

  const cond = conditionDisplay[condition] || conditionDisplay.unknown;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#163F4A',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >
        {/* Accent top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '5px', background: '#F07052', display: 'flex' }} />

        {/* HEADER — logo + river + route */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '44px 56px 0',
            flex: 1,
          }}
        >
          {/* Logo row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#F07052',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
                <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
                <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
              </svg>
            </div>
            <span style={{ fontSize: '22px', fontWeight: 800, color: 'white', letterSpacing: '0.06em' }}>
              EDDY
            </span>
          </div>

          {/* River name */}
          <h1
            style={{
              fontSize: '54px',
              fontWeight: 800,
              color: 'white',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              margin: '0 0 16px 0',
            }}
          >
            {river}
          </h1>

          {/* Route */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#4EB86B', display: 'flex' }} />
            <span style={{ fontSize: '20px', fontWeight: 600, color: '#D4EAEF' }}>{putIn}</span>
            <span style={{ fontSize: '18px', color: '#4A9AAD' }}>to</span>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#F07052', display: 'flex' }} />
            <span style={{ fontSize: '20px', fontWeight: 600, color: '#D4EAEF' }}>{takeOut}</span>
          </div>

          {/* Distance + Time chips */}
          <div style={{ display: 'flex', gap: '12px' }}>
            {distance && (
              <div style={{ display: 'flex', alignItems: 'center', padding: '8px 18px', borderRadius: '8px', background: '#0F2D35', border: '2px solid #1D525F' }}>
                <span style={{ fontSize: '18px', fontWeight: 700, color: 'white' }}>{distance}</span>
              </div>
            )}
            {floatTime && (
              <div style={{ display: 'flex', alignItems: 'center', padding: '8px 18px', borderRadius: '8px', background: '#0F2D35', border: '2px solid #1D525F' }}>
                <span style={{ fontSize: '18px', fontWeight: 700, color: 'white' }}>~{floatTime}</span>
              </div>
            )}
          </div>
        </div>

        {/* GAUGE SECTION — warm sandbar background, hero prominence */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '28px 56px',
            background: '#F4EFE7',
            borderTop: '3px solid #E8DFD0',
          }}
        >
          {/* Left: condition + gauge name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '5px 14px',
                  borderRadius: '6px',
                  background: cond.bg,
                  border: '2px solid rgba(0,0,0,0.1)',
                }}
              >
                <span style={{ fontSize: '16px', fontWeight: 800, color: cond.color }}>{cond.label}</span>
              </div>
              {gaugeName && (
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#6B6459' }}>
                  {gaugeName}
                </span>
              )}
            </div>
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#857D70' }}>
              Water data from USGS
            </span>
          </div>

          {/* Right: gauge readings large */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '24px' }}>
            {gaugeHeight && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                <span style={{ fontSize: '42px', fontWeight: 800, color: '#2D2A24', letterSpacing: '-0.02em' }}>{gaugeHeight}</span>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#857D70' }}>ft</span>
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
