// src/app/api/og/share/route.tsx
// Downloadable branded image for sharing float plans
// 1080x1350 (4:5 ratio) - optimized for group chats and social media

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
  optimal: {
    label: 'Optimal',
    textColor: '#ffffff',
    bg: '#059669',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png'
  },
  low: {
    label: 'Okay',
    textColor: '#ffffff',
    bg: '#84CC16',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png'
  },
  very_low: {
    label: 'Low',
    textColor: '#1A1814',
    bg: '#EAB308',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png'
  },
  high: {
    label: 'High',
    textColor: '#ffffff',
    bg: '#F97316',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png'
  },
  too_low: {
    label: 'Too Low',
    textColor: '#1A1814',
    bg: '#9CA3AF',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png'
  },
  dangerous: {
    label: 'Flood',
    textColor: '#ffffff',
    bg: '#DC2626',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png'
  },
  unknown: {
    label: 'Unknown',
    textColor: '#1A1814',
    bg: '#9CA3AF',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png'
  },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const river = searchParams.get('river') || 'Missouri River';
  const putIn = searchParams.get('putIn') || 'Start';
  const takeOut = searchParams.get('takeOut') || 'End';
  const distance = searchParams.get('distance') || '';
  const time = searchParams.get('time') || '';
  const condition = (searchParams.get('condition') || 'unknown') as ConditionCode;
  const gaugeHeight = searchParams.get('gaugeHeight') || '';

  const cond = conditionDisplay[condition] || conditionDisplay.unknown;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1080px',
          height: '1350px',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, sans-serif',
          background: '#F7F6F3',
          position: 'relative',
        }}
      >
        {/* Header - dark teal background */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '48px 40px 32px',
            background: '#163F4A',
          }}
        >
          {/* Eddy branding */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img
              src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png"
              width={60}
              height={60}
              alt=""
              style={{ objectFit: 'contain' }}
            />
            <span style={{ fontSize: '32px', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
              EDDY.GUIDE
            </span>
          </div>

          {/* River name */}
          <h1
            style={{
              fontSize: '48px',
              fontWeight: 900,
              color: 'white',
              letterSpacing: '-0.02em',
              margin: 0,
              textAlign: 'center',
            }}
          >
            {river}
          </h1>
          <span style={{ fontSize: '20px', fontWeight: 600, color: '#A3D1DB', marginTop: '8px' }}>
            Float Plan
          </span>
        </div>

        {/* Main content card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            margin: '32px 40px',
            padding: '32px',
            background: 'white',
            border: '4px solid #1A1814',
            boxShadow: '6px 6px 0 #1A1814',
            flex: 1,
          }}
        >
          {/* Route section */}
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '32px' }}>
            {/* Put-in */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#4EB86B',
                  marginRight: '16px',
                  flexShrink: 0,
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#4EB86B', letterSpacing: '0.05em' }}>
                  PUT-IN
                </span>
                <span style={{ fontSize: '28px', fontWeight: 700, color: '#1A1814' }}>
                  {putIn}
                </span>
              </div>
            </div>

            {/* Connector line */}
            <div
              style={{
                width: '4px',
                height: '40px',
                background: 'linear-gradient(to bottom, #4EB86B, #F07052)',
                marginLeft: '10px',
                marginBottom: '16px',
              }}
            />

            {/* Take-out */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#F07052',
                  marginRight: '16px',
                  flexShrink: 0,
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#F07052', letterSpacing: '0.05em' }}>
                  TAKE-OUT
                </span>
                <span style={{ fontSize: '28px', fontWeight: 700, color: '#1A1814' }}>
                  {takeOut}
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: '100%', height: '2px', background: '#E5E5E5', marginBottom: '32px' }} />

          {/* Stats row */}
          <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '32px' }}>
            {distance && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '48px', fontWeight: 900, color: '#2D7889' }}>
                  {distance}
                </span>
                <span style={{ fontSize: '16px', fontWeight: 600, color: '#6B7280' }}>
                  Distance
                </span>
              </div>
            )}
            {time && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '48px', fontWeight: 900, color: '#2D7889' }}>
                  {time}
                </span>
                <span style={{ fontSize: '16px', fontWeight: 600, color: '#6B7280' }}>
                  Float Time
                </span>
              </div>
            )}
          </div>

          {/* Condition badge */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '24px',
              background: cond.bg,
              border: '4px solid #1A1814',
              marginBottom: '24px',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 700, color: cond.textColor, opacity: 0.8, letterSpacing: '0.1em', marginBottom: '8px' }}>
              CURRENT CONDITIONS
            </span>
            <span style={{ fontSize: '56px', fontWeight: 900, color: cond.textColor }}>
              {cond.label}
            </span>
            {gaugeHeight && (
              <span style={{ fontSize: '24px', fontWeight: 600, color: cond.textColor, opacity: 0.9, marginTop: '8px' }}>
                {gaugeHeight} ft
              </span>
            )}
          </div>

          {/* Eddy otter illustration */}
          <div style={{ display: 'flex', justifyContent: 'center', flex: 1, alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img
              src={cond.otterImage}
              width={200}
              height={200}
              alt=""
              style={{ objectFit: 'contain' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '24px 40px 40px',
            background: '#163F4A',
          }}
        >
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#A3D1DB', marginBottom: '8px' }}>
            Plan your next float at
          </span>
          <span style={{ fontSize: '28px', fontWeight: 800, color: 'white' }}>
            eddy.guide
          </span>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1350,
    },
  );
}
