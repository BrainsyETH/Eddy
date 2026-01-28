// src/app/api/og/plan/route.tsx
// Dynamic OG image for shared float plans
// Brutalist design with condition-based Eddy the otter

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

type ConditionCode = 'dangerous' | 'high' | 'optimal' | 'low' | 'very_low' | 'too_low' | 'unknown';

const conditionDisplay: Record<ConditionCode, {
  label: string;
  textColor: string;
  bg: string;
  otterImage: string;
}> = {
  optimal:   {
    label: 'OPTIMAL',
    textColor: '#1A3D23',
    bg: '#4EB86B',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png'
  },
  low:       {
    label: 'LOW - FLOATABLE',
    textColor: '#1A3D23',
    bg: '#84CC16',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png'
  },
  very_low:  {
    label: 'VERY LOW',
    textColor: '#2D2A24',
    bg: '#EAB308',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png'
  },
  high:      {
    label: 'HIGH WATER',
    textColor: '#ffffff',
    bg: '#F97316',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png'
  },
  too_low:   {
    label: 'TOO LOW',
    textColor: '#2D2A24',
    bg: '#C2BAAC',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png'
  },
  dangerous: {
    label: 'DANGEROUS',
    textColor: '#ffffff',
    bg: '#DC2626',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png'
  },
  unknown:   {
    label: 'UNKNOWN',
    textColor: '#2D2A24',
    bg: '#C2BAAC',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png'
  },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const river = searchParams.get('river') || 'Missouri River';
  const putIn = searchParams.get('putIn') || 'Start';
  const takeOut = searchParams.get('takeOut') || 'End';
  const condition = (searchParams.get('condition') || 'unknown') as ConditionCode;
  const gaugeName = searchParams.get('gaugeName') || 'USGS Gauge';
  const gaugeHeight = searchParams.get('gaugeHeight') || '';
  const dischargeCfs = searchParams.get('dischargeCfs') || '';
  const distance = searchParams.get('distance') || '';
  const floatTime = searchParams.get('floatTime') || '';

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
        {/* LEFT PANEL - Branding + Route Info */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '480px',
            padding: '36px 40px',
            justifyContent: 'space-between',
          }}
        >
          {/* Top: Eddy branding */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cond.otterImage}
              width={72}
              height={72}
              style={{ objectFit: 'contain', marginRight: '16px' }}
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
              <span style={{ fontSize: '20px', fontWeight: 900, color: 'white', letterSpacing: '0.15em' }}>
                EDDY
              </span>
            </div>
          </div>

          {/* Middle: River name */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#72B5C4', letterSpacing: '0.1em', marginBottom: '8px' }}>
              FLOAT PLAN
            </span>
            <h1
              style={{
                fontSize: '48px',
                fontWeight: 900,
                color: 'white',
                letterSpacing: '-0.02em',
                margin: '0 0 20px 0',
                lineHeight: 1.05,
              }}
            >
              {river.toUpperCase()}
            </h1>

            {/* Put-in / Take-out with labels */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: '#4EB86B',
                    border: '3px solid #000',
                    marginRight: '12px',
                    flexShrink: 0,
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#72B5C4', letterSpacing: '0.08em' }}>PUT-IN</span>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: 'white' }}>{putIn}</span>
                </div>
              </div>

              {/* Connector line */}
              <div style={{ width: '2px', height: '12px', background: '#4A6E6F', marginLeft: '7px', marginBottom: '10px' }} />

              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: '#F07052',
                    border: '3px solid #000',
                    marginRight: '12px',
                    flexShrink: 0,
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#72B5C4', letterSpacing: '0.08em' }}>TAKE-OUT</span>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: 'white' }}>{takeOut}</span>
                </div>
              </div>
            </div>

            {/* Trip stats row */}
            {(distance || floatTime) && (
              <div style={{ display: 'flex', marginTop: '20px' }}>
                {distance && (
                  <div
                    style={{
                      display: 'flex',
                      padding: '8px 16px',
                      background: 'rgba(255,255,255,0.1)',
                      border: '2px solid rgba(255,255,255,0.15)',
                      marginRight: '10px',
                    }}
                  >
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#A3D1DB' }}>
                      {distance}
                    </span>
                  </div>
                )}
                {floatTime && (
                  <div
                    style={{
                      display: 'flex',
                      padding: '8px 16px',
                      background: 'rgba(255,255,255,0.1)',
                      border: '2px solid rgba(255,255,255,0.15)',
                    }}
                  >
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#A3D1DB' }}>
                      ~{floatTime}
                    </span>
                  </div>
                )}
              </div>
            )}
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
            flex: 1,
            padding: '36px 40px 36px 0',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '32px 36px',
              background: '#F4EFE7',
              border: '6px solid #000',
              boxShadow: '10px 10px 0 #000',
            }}
          >
            {/* Condition badge */}
            <div
              style={{
                display: 'flex',
                padding: '18px 32px',
                background: cond.bg,
                border: '5px solid #000',
                boxShadow: '6px 6px 0 #000',
                marginBottom: '24px',
              }}
            >
              <span style={{ fontSize: '44px', fontWeight: 900, color: cond.textColor, letterSpacing: '-0.02em' }}>
                {cond.label}
              </span>
            </div>

            {/* Gauge data */}
            <div style={{ display: 'flex', marginBottom: '20px' }}>
              {gaugeHeight && (
                <div style={{ display: 'flex', flexDirection: 'column', marginRight: '48px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#857D70', letterSpacing: '0.1em', marginBottom: '6px' }}>
                    GAUGE HEIGHT
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '48px', fontWeight: 900, color: '#2D2A24', letterSpacing: '-0.03em' }}>
                      {gaugeHeight}
                    </span>
                    <span style={{ fontSize: '22px', fontWeight: 800, color: '#6B6459', marginLeft: '6px' }}>
                      ft
                    </span>
                  </div>
                </div>
              )}

              {dischargeCfs && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#857D70', letterSpacing: '0.1em', marginBottom: '6px' }}>
                    DISCHARGE
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '48px', fontWeight: 900, color: '#2D2A24', letterSpacing: '-0.03em' }}>
                      {dischargeCfs}
                    </span>
                    <span style={{ fontSize: '22px', fontWeight: 800, color: '#6B6459', marginLeft: '6px' }}>
                      cfs
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Gauge name */}
            <div
              style={{
                display: 'flex',
                padding: '10px 20px',
                background: '#E5DED2',
                border: '3px solid #C2BAAC',
              }}
            >
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#6B6459' }}>
                {gaugeName}
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
