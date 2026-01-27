// src/app/api/og/plan/route.tsx
// Dynamic OG image for shared float plans
// Two-panel: Eddy branding left, plan + gauge data right

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

type ConditionCode = 'dangerous' | 'high' | 'optimal' | 'low' | 'very_low' | 'too_low' | 'unknown';

const conditionDisplay: Record<ConditionCode, { label: string; textColor: string; bg: string; borderColor: string }> = {
  optimal:   { label: 'Optimal',         textColor: '#1A3D23', bg: '#4EB86B', borderColor: '#347A47' },
  low:       { label: 'Low - Floatable', textColor: '#3D3425', bg: '#84CC16', borderColor: '#5C8A10' },
  very_low:  { label: 'Very Low',        textColor: '#3D3425', bg: '#EAB308', borderColor: '#B88A06' },
  high:      { label: 'High Water',      textColor: '#ffffff', bg: '#F97316', borderColor: '#CC3E2B' },
  too_low:   { label: 'Too Low',         textColor: '#2D2A24', bg: '#C2BAAC', borderColor: '#A49C8E' },
  dangerous: { label: 'Dangerous',       textColor: '#ffffff', bg: '#DC2626', borderColor: '#A33122' },
  unknown:   { label: 'Unknown',         textColor: '#2D2A24', bg: '#C2BAAC', borderColor: '#A49C8E' },
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
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'row',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Accent top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '5px', background: '#F07052', display: 'flex' }} />

        {/* LEFT PANEL — Eddy branding */}
        <div
          style={{
            width: '300px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0F2D35',
          }}
        >
          {/* Eddy the Otter */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png"
            width={200}
            height={200}
            style={{ marginBottom: '16px', objectFit: 'contain' }}
          />
          <span style={{ fontSize: '32px', fontWeight: 800, color: 'white', letterSpacing: '0.1em' }}>
            EDDY
          </span>
        </div>

        {/* RIGHT PANEL — content */}
        <div
          style={{
            flex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#163F4A',
          }}
        >
          {/* Top: river info */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '44px 48px 24px',
            }}
          >
            {/* River name */}
            <h1
              style={{
                fontSize: '48px',
                fontWeight: 800,
                color: 'white',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                margin: '0 0 14px 0',
              }}
            >
              {river}
            </h1>

            {/* Route */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#4EB86B', display: 'flex' }} />
              <span style={{ fontSize: '19px', fontWeight: 600, color: '#D4EAEF' }}>{putIn}</span>
              <span style={{ fontSize: '17px', color: '#4A9AAD' }}>to</span>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#F07052', display: 'flex' }} />
              <span style={{ fontSize: '19px', fontWeight: 600, color: '#D4EAEF' }}>{takeOut}</span>
            </div>

            {/* Distance + Time */}
            <div style={{ display: 'flex', gap: '10px' }}>
              {distance && (
                <div style={{ padding: '6px 16px', borderRadius: '6px', background: '#0F2D35', border: '2px solid #1D525F', display: 'flex' }}>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>{distance}</span>
                </div>
              )}
              {floatTime && (
                <div style={{ padding: '6px 16px', borderRadius: '6px', background: '#0F2D35', border: '2px solid #1D525F', display: 'flex' }}>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>~{floatTime}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom: Gauge hero — fills remaining space */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 48px 36px',
              background: '#F4EFE7',
              borderTop: '3px solid #D9C9B0',
            }}
          >
            {/* Condition — BIG */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 28px',
                  borderRadius: '10px',
                  background: cond.bg,
                  border: `3px solid ${cond.borderColor}`,
                }}
              >
                <span style={{ fontSize: '32px', fontWeight: 800, color: cond.textColor }}>
                  {cond.label}
                </span>
              </div>

              {/* Gauge height — large */}
              {gaugeHeight && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '56px', fontWeight: 800, color: '#2D2A24', letterSpacing: '-0.03em' }}>{gaugeHeight}</span>
                  <span style={{ fontSize: '22px', fontWeight: 700, color: '#857D70' }}>ft</span>
                </div>
              )}
            </div>

            {/* Gauge station name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px', fontWeight: 600, color: '#6B6459' }}>
                {gaugeName || 'USGS Gauge'}
              </span>
              <span style={{ fontSize: '15px', fontWeight: 500, color: '#A49C8E' }}>
                · USGS
              </span>
            </div>
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
