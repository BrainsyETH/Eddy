// src/app/gauges/opengraph-image.tsx
// OG image for the gauges dashboard page

import { ImageResponse } from 'next/og';
import { loadOGFonts } from '@/lib/og/fonts';

export const alt = 'River Gauges - Real-time water levels on eddy.guide';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const fonts = await loadOGFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          fontFamily: 'system-ui, sans-serif',
          background: 'linear-gradient(135deg, #161748 0%, #1a1f5c 50%, #1B4965 100%)',
          position: 'relative',
        }}
      >
        {/* LEFT SIDE - Eddy the Otter */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 480,
            padding: 20,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png"
            width={400}
            height={400}
            alt=""
            style={{ objectFit: 'contain' }}
          />
        </div>

        {/* RIGHT SIDE - Text content */}
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
          <span
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: 'white',
              lineHeight: 1,
              letterSpacing: -1,
              marginBottom: 8,
            }}
          >
            River
          </span>
          <span
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: '#39a0ca',
              lineHeight: 1,
              letterSpacing: -1,
              marginBottom: 32,
            }}
          >
            Gauges
          </span>

          {/* Subtitle */}
          <span
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 22,
              color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.4,
              maxWidth: 480,
            }}
          >
            Real-time water levels and flow trends from USGS stations across Missouri
          </span>

          {/* Feature pills */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 28,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'rgba(57,160,202,0.2)',
                color: '#39a0ca',
                border: '1px solid rgba(57,160,202,0.3)',
                borderRadius: 100,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Live USGS Data
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'rgba(71,133,89,0.2)',
                color: '#81B29A',
                border: '1px solid rgba(71,133,89,0.3)',
                borderRadius: 100,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Flow Trends
            </div>
          </div>
        </div>

        {/* Domain watermark */}
        <span
          style={{
            position: 'absolute',
            bottom: 24,
            right: 40,
            fontSize: 14,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          eddy.guide
        </span>

        {/* Bottom accent bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background: 'linear-gradient(90deg, #39a0ca 0%, #478559 100%)',
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts,
    }
  );
}
