// src/app/api/og/gauges/route.tsx
// OG image for the gauges dashboard page

import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          fontFamily: 'system-ui, sans-serif',
          background: 'linear-gradient(135deg, #0F2D35 0%, #163F4A 50%, #0F2D35 100%)',
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

        {/* LEFT SIDE - Eddy the Otter (as big as possible) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '500px',
            padding: '40px',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png"
            width={400}
            height={400}
            alt="Eddy the Otter"
            style={{ objectFit: 'contain' }}
          />
        </div>

        {/* RIGHT SIDE - Text content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '60px 60px 60px 20px',
            justifyContent: 'center',
          }}
        >
          {/* Main title */}
          <h1
            style={{
              fontSize: '86px',
              fontWeight: 900,
              color: '#F07052',
              lineHeight: 1.0,
              letterSpacing: '-0.03em',
              margin: '0 0 8px 0',
            }}
          >
            River
          </h1>
          <h1
            style={{
              fontSize: '86px',
              fontWeight: 900,
              color: '#F07052',
              lineHeight: 1.0,
              letterSpacing: '-0.03em',
              margin: '0 0 32px 0',
            }}
          >
            Gauges
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: '28px',
              color: '#A3D1DB',
              lineHeight: 1.3,
              margin: '0 0 40px 0',
              maxWidth: '500px',
            }}
          >
            Real-time water levels and flow trends from USGS stations across Missouri
          </p>

          {/* Feature badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {['Live Data', 'Flow Charts', 'Condition Status'].map((feature) => (
              <div
                key={feature}
                style={{
                  padding: '10px 20px',
                  background: 'rgba(255,255,255,0.1)',
                  border: '2px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  color: '#72B5C4',
                  fontSize: '18px',
                  fontWeight: 700,
                  display: 'flex',
                }}
              >
                {feature}
              </div>
            ))}
          </div>

          {/* Domain */}
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#4A9AAD', marginTop: '32px' }}>
            eddy.guide/gauges
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
