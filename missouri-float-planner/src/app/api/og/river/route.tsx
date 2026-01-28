// src/app/api/og/river/route.tsx
// Dynamic OG image for river pages
// Shows river name, current conditions, key stats

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

type ConditionCode = 'dangerous' | 'high' | 'optimal' | 'low' | 'very_low' | 'too_low' | 'unknown';

const conditionDisplay: Record<ConditionCode, { label: string; textColor: string; bg: string }> = {
  optimal:   { label: 'OPTIMAL',           textColor: '#1A3D23', bg: '#4EB86B' },
  low:       { label: 'LOW - FLOATABLE',   textColor: '#1A3D23', bg: '#84CC16' },
  very_low:  { label: 'VERY LOW',          textColor: '#2D2A24', bg: '#EAB308' },
  high:      { label: 'HIGH WATER',        textColor: '#ffffff', bg: '#F97316' },
  too_low:   { label: 'TOO LOW',           textColor: '#2D2A24', bg: '#C2BAAC' },
  dangerous: { label: 'DANGEROUS',         textColor: '#ffffff', bg: '#DC2626' },
  unknown:   { label: 'UNKNOWN',           textColor: '#2D2A24', bg: '#C2BAAC' },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const name = searchParams.get('name') || 'Missouri River';
  const condition = (searchParams.get('condition') || 'unknown') as ConditionCode;
  const length = searchParams.get('length') || '';
  const difficulty = searchParams.get('difficulty') || '';
  const region = searchParams.get('region') || 'Missouri Ozarks';
  const gaugeHeight = searchParams.get('gaugeHeight') || '';
  const flowDesc = searchParams.get('flowDesc') || '';

  const cond = conditionDisplay[condition] || conditionDisplay.unknown;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          fontFamily: 'system-ui, sans-serif',
          background: '#1A3D40',
          position: 'relative',
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

        {/* LEFT PANEL - River info */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '48px 48px',
            justifyContent: 'space-between',
          }}
        >
          {/* Top: Logo + region */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png"
              width={52}
              height={52}
              style={{ objectFit: 'contain', marginRight: '14px' }}
            />
            <div
              style={{
                display: 'flex',
                padding: '8px 18px',
                background: '#F07052',
                border: '4px solid #000',
                boxShadow: '4px 4px 0 #000',
              }}
            >
              <span style={{ fontSize: '18px', fontWeight: 900, color: 'white', letterSpacing: '0.15em' }}>
                EDDY
              </span>
            </div>
            {region && (
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#72B5C4', marginLeft: '16px' }}>
                {region}
              </span>
            )}
          </div>

          {/* Middle: River name + stats */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1
              style={{
                fontSize: '56px',
                fontWeight: 900,
                color: 'white',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                margin: '0 0 20px 0',
              }}
            >
              {name}
            </h1>

            {/* Stats pills */}
            <div style={{ display: 'flex' }}>
              {length && (
                <div
                  style={{
                    display: 'flex',
                    padding: '8px 18px',
                    background: 'rgba(255,255,255,0.1)',
                    border: '2px solid rgba(255,255,255,0.15)',
                    marginRight: '10px',
                  }}
                >
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#A3D1DB' }}>
                    {length} miles
                  </span>
                </div>
              )}
              {difficulty && (
                <div
                  style={{
                    display: 'flex',
                    padding: '8px 18px',
                    background: 'rgba(255,255,255,0.1)',
                    border: '2px solid rgba(255,255,255,0.15)',
                  }}
                >
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#A3D1DB' }}>
                    {difficulty}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom: CTA */}
          <div style={{ display: 'flex' }}>
            <span style={{ fontSize: '16px', fontWeight: 600, color: '#4A9AAD' }}>
              eddy.guide
            </span>
          </div>
        </div>

        {/* RIGHT PANEL - Conditions card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '420px',
            padding: '48px 48px 48px 0',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '28px 32px',
              background: '#F4EFE7',
              border: '6px solid #000',
              boxShadow: '10px 10px 0 #000',
            }}
          >
            {/* Section label */}
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#857D70', letterSpacing: '0.1em', marginBottom: '16px' }}>
              CURRENT CONDITIONS
            </span>

            {/* Condition badge - brutalist style */}
            <div
              style={{
                display: 'flex',
                padding: '16px 28px',
                background: cond.bg,
                border: '5px solid #000',
                boxShadow: '6px 6px 0 #000',
                marginBottom: '24px',
              }}
            >
              <span style={{ fontSize: '36px', fontWeight: 900, color: cond.textColor, letterSpacing: '-0.02em' }}>
                {cond.label}
              </span>
            </div>

            {/* Gauge height */}
            {gaugeHeight && (
              <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#857D70', letterSpacing: '0.1em', marginBottom: '6px' }}>
                  GAUGE HEIGHT
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '44px', fontWeight: 900, color: '#2D2A24', letterSpacing: '-0.03em' }}>
                    {gaugeHeight}
                  </span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#6B6459', marginLeft: '6px' }}>
                    ft
                  </span>
                </div>
              </div>
            )}

            {/* Flow description */}
            {flowDesc && (
              <div
                style={{
                  display: 'flex',
                  padding: '10px 16px',
                  background: '#E5DED2',
                  border: '3px solid #C2BAAC',
                }}
              >
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#6B6459' }}>
                  {flowDesc}
                </span>
              </div>
            )}

            {/* Live data badge */}
            <div style={{ display: 'flex', marginTop: '16px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#857D70', letterSpacing: '0.05em' }}>
                LIVE FROM USGS GAUGES
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
