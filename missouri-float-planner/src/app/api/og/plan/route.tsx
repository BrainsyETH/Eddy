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
    bg: '#059669', // emerald-600
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png'
  },
  low:       {
    label: 'OKAY',
    textColor: '#1A3D23',
    bg: '#84CC16', // lime-500
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png'
  },
  very_low:  {
    label: 'LOW',
    textColor: '#2D2A24',
    bg: '#EAB308', // yellow-500
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
    bg: '#9CA3AF', // neutral-400
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png'
  },
  dangerous: {
    label: 'FLOOD',
    textColor: '#ffffff',
    bg: '#DC2626',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png'
  },
  unknown:   {
    label: 'UNKNOWN',
    textColor: '#2D2A24',
    bg: '#9CA3AF',
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
  // Reserved for future use
  const _dischargeCfs = searchParams.get('dischargeCfs') || '';
  const _distance = searchParams.get('distance') || '';
  const _floatTime = searchParams.get('floatTime') || '';
  void _dischargeCfs; void _distance; void _floatTime;

  const cond = conditionDisplay[condition] || conditionDisplay.unknown;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, sans-serif',
          background: '#1A3D40',
          padding: '32px 40px',
          position: 'relative',
        }}
      >
        {/* TOP LEFT - Otter (absolute) */}
        <div style={{ position: 'absolute', top: '24px', left: '32px', display: 'flex' }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img
            src={cond.otterImage}
            width={100}
            height={100}
            alt=""
            style={{ objectFit: 'contain' }}
          />
        </div>

        {/* River name - large */}
        <h1
          style={{
            fontSize: '56px',
            fontWeight: 900,
            color: 'white',
            letterSpacing: '-0.02em',
            margin: '0 0 12px 120px',
            lineHeight: 1.0,
          }}
        >
          {river.toUpperCase()}
        </h1>

        {/* Put-in / Take-out - single line with squares */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', marginLeft: '120px' }}>
          <div
            style={{
              width: '18px',
              height: '18px',
              background: '#4EB86B',
              marginRight: '8px',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: '22px', fontWeight: 600, color: 'white', marginRight: '28px' }}>{putIn}</span>

          <div
            style={{
              width: '18px',
              height: '18px',
              background: '#F07052',
              marginRight: '8px',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: '22px', fontWeight: 600, color: 'white' }}>{takeOut}</span>
        </div>

        {/* Condition badge - VERY LARGE, full width */}
        <div
          style={{
            display: 'flex',
            padding: '24px 36px',
            background: cond.bg,
            border: '6px solid #000',
            marginBottom: '24px',
          }}
        >
          <span style={{ fontSize: '80px', fontWeight: 900, color: cond.textColor, letterSpacing: '-0.02em' }}>
            {cond.label}
          </span>
        </div>

        {/* Gauge data */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {gaugeHeight && (
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#72B5C4', letterSpacing: '0.1em', marginBottom: '4px' }}>
                GAUGE HEIGHT
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontSize: '52px', fontWeight: 900, color: 'white', letterSpacing: '-0.03em' }}>
                  {gaugeHeight}
                </span>
                <span style={{ fontSize: '22px', fontWeight: 700, color: '#A3D1DB', marginLeft: '8px' }}>
                  ft
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Gauge name */}
        <div
          style={{
            display: 'flex',
            padding: '8px 14px',
            background: 'rgba(255,255,255,0.08)',
            border: '2px solid rgba(255,255,255,0.15)',
            alignSelf: 'flex-start',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#A3D1DB' }}>
            {gaugeName}
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
