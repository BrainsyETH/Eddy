// src/app/api/og/plan/route.tsx
// Dynamic OG image for shared float plans
// Shows river, put-in/take-out, distance, float time, conditions

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

type ConditionCode = 'dangerous' | 'high' | 'optimal' | 'low' | 'very_low' | 'too_low' | 'unknown';

const conditionDisplay: Record<ConditionCode, { label: string; dotColor: string }> = {
  optimal:   { label: 'Optimal',       dotColor: '#4EB86B' },
  low:       { label: 'Low - Floatable', dotColor: '#84CC16' },
  very_low:  { label: 'Very Low',      dotColor: '#EAB308' },
  high:      { label: 'High Water',    dotColor: '#F97316' },
  too_low:   { label: 'Too Low',       dotColor: '#9CA3AF' },
  dangerous: { label: 'Dangerous',     dotColor: '#DC2626' },
  unknown:   { label: 'Unknown',       dotColor: '#9CA3AF' },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const river = searchParams.get('river') || 'Missouri River';
  const putIn = searchParams.get('putIn') || 'Start';
  const takeOut = searchParams.get('takeOut') || 'End';
  const distance = searchParams.get('distance') || '';
  const floatTime = searchParams.get('floatTime') || '';
  const vessel = searchParams.get('vessel') || 'Canoe';
  const condition = (searchParams.get('condition') || 'unknown') as ConditionCode;
  const driveBack = searchParams.get('driveBack') || '';

  const cond = conditionDisplay[condition] || conditionDisplay.unknown;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0F2D35 0%, #163F4A 40%, #1D525F 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: '#F07052',
            display: 'flex',
          }}
        />

        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '40px 60px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: '#F07052',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #0F2D35',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
                <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
                <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
              </svg>
            </div>
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#72B5C4' }}>EDDY</span>
          </div>

          {/* Condition badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: cond.dotColor, display: 'flex' }} />
            <span style={{ fontSize: '16px', fontWeight: 600, color: '#D4EAEF' }}>{cond.label}</span>
          </div>
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '30px 60px', justifyContent: 'center' }}>
          {/* River name as heading */}
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#72B5C4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', display: 'flex' }}>
            Float Plan
          </div>
          <h1
            style={{
              fontSize: '52px',
              fontWeight: 800,
              color: 'white',
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              margin: 0,
              marginBottom: '28px',
            }}
          >
            {river}
          </h1>

          {/* Route: Put-in to Take-out */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '32px',
              padding: '20px 28px',
              borderRadius: '14px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {/* Put-in marker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#4EB86B', border: '3px solid #1A3D23', display: 'flex' }} />
              <span style={{ fontSize: '22px', fontWeight: 700, color: 'white' }}>{putIn}</span>
            </div>

            {/* Arrow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '60px', height: '2px', background: 'rgba(255,255,255,0.3)', display: 'flex' }} />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
              </svg>
            </div>

            {/* Take-out marker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#F07052', border: '3px solid #7A2419', display: 'flex' }} />
              <span style={{ fontSize: '22px', fontWeight: 700, color: 'white' }}>{takeOut}</span>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {distance && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  padding: '16px 24px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  minWidth: '140px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#4A9AAD', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Distance</span>
                <span style={{ fontSize: '28px', fontWeight: 800, color: 'white' }}>{distance}</span>
              </div>
            )}
            {floatTime && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  padding: '16px 24px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  minWidth: '140px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#4A9AAD', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Float Time</span>
                <span style={{ fontSize: '28px', fontWeight: 800, color: 'white' }}>{floatTime}</span>
              </div>
            )}
            {vessel && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  padding: '16px 24px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  minWidth: '140px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#4A9AAD', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vessel</span>
                <span style={{ fontSize: '28px', fontWeight: 800, color: 'white' }}>{vessel}</span>
              </div>
            )}
            {driveBack && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  padding: '16px 24px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  minWidth: '140px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#4A9AAD', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Drive Back</span>
                <span style={{ fontSize: '28px', fontWeight: 800, color: 'white' }}>{driveBack}</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 60px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <span style={{ fontSize: '15px', color: '#4A9AAD' }}>Water data from USGS gauges</span>
          <span style={{ fontSize: '15px', color: '#4A9AAD' }}>floatmo.com</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
