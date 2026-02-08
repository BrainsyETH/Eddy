// src/app/gauges/opengraph-image.tsx
// OG image for the gauges dashboard — Flood otter + "River Levels" in Fredoka coral

import { ImageResponse } from 'next/og';
import { loadFredokaFont, loadOtterImage, OTTER_URLS } from '@/lib/og/fonts';
import { BRAND_COLORS } from '@/lib/og/colors';

export const alt = 'River Levels — Real-time water levels on eddy.guide';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const dynamic = 'force-dynamic';

export default async function Image() {
  const fonts = loadFredokaFont();
  const otterImage = await loadOtterImage(OTTER_URLS.flood);

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: 'linear-gradient(135deg, #161748 0%, #1a1f5c 50%, #1B4965 100%)',
          position: 'relative',
        }}
      >
        {/* LEFT — Eddy Flood Otter */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 480,
            padding: 40,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={otterImage}
            width={380}
            height={380}
            alt=""
            style={{ objectFit: 'contain' }}
          />
        </div>

        {/* RIGHT — Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '80px 60px 80px 0',
            justifyContent: 'center',
          }}
        >
          {/* Page title in Fredoka coral */}
          <span
            style={{
              fontFamily: 'Fredoka',
              fontSize: 80,
              fontWeight: 600,
              color: BRAND_COLORS.accentCoral,
              lineHeight: 1,
              letterSpacing: -1,
              marginBottom: 16,
            }}
          >
            River Levels
          </span>

          {/* Subtitle */}
          <span
            style={{
              fontSize: 22,
              fontWeight: 400,
              color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.4,
              maxWidth: 480,
            }}
          >
            Real-time USGS water levels and flow trends across Missouri
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
                padding: '8px 16px',
                fontSize: 14,
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
                padding: '8px 16px',
                fontSize: 14,
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
            background: `linear-gradient(90deg, ${BRAND_COLORS.accentCoral} 0%, ${BRAND_COLORS.bluewater} 100%)`,
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
