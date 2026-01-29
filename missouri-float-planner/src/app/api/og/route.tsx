// src/app/api/og/route.tsx
// Default OG image for the homepage / site-wide fallback

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
            height: '8px',
            background: '#F07052',
            display: 'flex',
          }}
        />

        {/* LEFT SIDE - Eddy the Otter (large) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '520px',
            padding: '20px',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png"
            width={480}
            height={480}
            alt="Eddy the Otter"
            style={{ objectFit: 'contain' }}
          />
        </div>

        {/* RIGHT SIDE - Text content vertically centered */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '80px 60px 80px 0',
            justifyContent: 'center',
          }}
        >
          {/* Main title */}
          <h1
            style={{
              fontSize: '160px',
              fontWeight: 900,
              color: '#F07052',
              lineHeight: 0.95,
              letterSpacing: '-0.04em',
              margin: '0 0 24px 0',
            }}
          >
            Eddy
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: '32px',
              color: '#A3D1DB',
              lineHeight: 1.3,
              margin: 0,
              maxWidth: '550px',
            }}
          >
            Missouri Float Trip Planner
          </p>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
