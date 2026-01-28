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

  const cond = conditionDisplay[condition] || conditionDisplay.unknown;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'row',
          fontFamily: 'system-ui, sans-serif',
          background: '#1A3D40',
        }}
      >
        {/* LEFT PANEL */}
        <div
          style={{
            width: '320px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0F2D35',
            borderRight: '8px solid #000',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cond.otterImage}
            width={260}
            height={260}
            style={{ objectFit: 'contain' }}
          />
          <div
            style={{
              display: 'flex',
              padding: '16px 32px',
              background: '#F07052',
              border: '6px solid #000',
              boxShadow: '8px 8px 0 #000',
              marginTop: '20px',
            }}
          >
            <span style={{ fontSize: '28px', fontWeight: 900, color: 'white', letterSpacing: '0.15em' }}>
              EDDY
            </span>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div
          style={{
            width: '880px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            background: '#1A3D40',
            padding: '32px 48px',
          }}
        >
          {/* River name */}
          <h1
            style={{
              fontSize: '58px',
              fontWeight: 900,
              color: 'white',
              letterSpacing: '-0.02em',
              margin: '0 0 24px 0',
            }}
          >
            {river.toUpperCase()}
          </h1>

          {/* Put-in/Take-out */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginBottom: '24px',
              padding: '18px 22px',
              background: '#0F2D35',
              border: '4px solid #000',
            }}
          >
            <div style={{ display: 'flex', marginBottom: '12px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  background: '#4EB86B',
                  border: '3px solid #000',
                  marginRight: '12px',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#A0C4C7', letterSpacing: '0.1em', marginBottom: '2px' }}>
                  PUT-IN LOCATION
                </span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: 'white' }}>{putIn}</span>
              </div>
            </div>

            <div style={{ display: 'flex' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  background: '#F07052',
                  border: '3px solid #000',
                  marginRight: '12px',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#A0C4C7', letterSpacing: '0.1em', marginBottom: '2px' }}>
                  TAKE-OUT POINT
                </span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: 'white' }}>{takeOut}</span>
              </div>
            </div>
          </div>

          {/* Gauge data card */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '24px 28px',
              background: '#F4EFE7',
              border: '6px solid #000',
              boxShadow: '10px 10px 0 #000',
            }}
          >

            {/* Condition badge */}
            <div
              style={{
                display: 'flex',
                padding: '12px 24px',
                background: cond.bg,
                border: '5px solid #000',
                boxShadow: '8px 8px 0 #000',
                marginBottom: '16px',
              }}
            >
              <span style={{ fontSize: '44px', fontWeight: 900, color: cond.textColor, letterSpacing: '-0.02em' }}>
                {cond.label}
              </span>
            </div>

            {/* Gauge data */}
            <div style={{ display: 'flex', marginBottom: '14px' }}>
              {gaugeHeight && (
                <div style={{ display: 'flex', flexDirection: 'column', marginRight: '32px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#857D70', letterSpacing: '0.1em', marginBottom: '4px' }}>
                    GAUGE HEIGHT
                  </span>
                  <div style={{ display: 'flex' }}>
                    <span style={{ fontSize: '42px', fontWeight: 900, color: '#2D2A24', letterSpacing: '-0.03em' }}>
                      {gaugeHeight}
                    </span>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#6B6459', marginLeft: '6px', marginTop: '12px' }}>
                      ft
                    </span>
                  </div>
                </div>
              )}

              {dischargeCfs && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#857D70', letterSpacing: '0.1em', marginBottom: '4px' }}>
                    DISCHARGE (CFS)
                  </span>
                  <span style={{ fontSize: '42px', fontWeight: 900, color: '#2D2A24', letterSpacing: '-0.03em' }}>
                    {dischargeCfs}
                  </span>
                </div>
              )}
            </div>

            {/* Gauge name */}
            <div
              style={{
                display: 'flex',
                padding: '8px 14px',
                background: '#E5DED2',
                border: '3px solid #C2BAAC',
              }}
            >
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#6B6459' }}>
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
