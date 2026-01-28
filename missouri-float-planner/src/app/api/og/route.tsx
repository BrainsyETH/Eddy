// src/app/api/og/route.tsx
// Default OG image for the homepage / site-wide fallback

import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  const features = ['Live Water Levels', '8 Rivers', '30+ Access Points', 'Float Times', 'Weather'];

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

        {/* LEFT PANEL - Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '48px 48px',
            justifyContent: 'space-between',
          }}
        >
          {/* Top: Eddy branding */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png"
              width={64}
              height={64}
              style={{ objectFit: 'contain', marginRight: '16px' }}
            />
            <div
              style={{
                display: 'flex',
                padding: '10px 22px',
                background: '#F07052',
                border: '4px solid #000',
                boxShadow: '4px 4px 0 #000',
              }}
            >
              <span style={{ fontSize: '24px', fontWeight: 900, color: 'white', letterSpacing: '0.15em' }}>
                EDDY
              </span>
            </div>
          </div>

          {/* Middle: Headline */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1
              style={{
                fontSize: '62px',
                fontWeight: 900,
                color: 'white',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                margin: '0 0 16px 0',
              }}
            >
              Plan Your Missouri
            </h1>
            <h1
              style={{
                fontSize: '62px',
                fontWeight: 900,
                color: '#F07052',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                margin: '0 0 24px 0',
              }}
            >
              Float Trip
            </h1>
            <p
              style={{
                fontSize: '24px',
                color: '#A3D1DB',
                lineHeight: 1.4,
                margin: 0,
                maxWidth: '680px',
              }}
            >
              Real-time water conditions, access points, float time estimates, and weather for the Ozarks.
            </p>
          </div>

          {/* Bottom: Feature pills + CTA */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              {features.map((feature) => (
                <div
                  key={feature}
                  style={{
                    padding: '8px 18px',
                    background: 'rgba(255,255,255,0.1)',
                    border: '2px solid rgba(255,255,255,0.15)',
                    color: '#A3D1DB',
                    fontSize: '16px',
                    fontWeight: 700,
                    display: 'flex',
                    marginRight: '10px',
                    marginBottom: '10px',
                  }}
                >
                  {feature}
                </div>
              ))}
            </div>
            <span style={{ fontSize: '16px', fontWeight: 600, color: '#4A9AAD', marginTop: '4px' }}>
              eddy.guide
            </span>
          </div>
        </div>

        {/* RIGHT PANEL - Decorative card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '380px',
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
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#857D70', letterSpacing: '0.1em', marginBottom: '16px' }}>
              MISSOURI OZARKS
            </span>

            <div
              style={{
                display: 'flex',
                padding: '16px 28px',
                background: '#4EB86B',
                border: '5px solid #000',
                boxShadow: '6px 6px 0 #000',
                marginBottom: '20px',
              }}
            >
              <span style={{ fontSize: '32px', fontWeight: 900, color: '#1A3D23', letterSpacing: '-0.02em' }}>
                CHECK CONDITIONS
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#857D70', letterSpacing: '0.1em', marginBottom: '8px' }}>
                LIVE DATA
              </span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#6B6459' }}>
                USGS Gauge Stations
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
