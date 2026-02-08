// src/app/opengraph-image.tsx
// Homepage OG image — Eddy otter + brand title in Fredoka coral

import { ImageResponse } from 'next/og';
import { formatFredokaFont, loadOtterImage, OTTER_URLS } from '@/lib/og/fonts';
import { BRAND_COLORS } from '@/lib/og/colors';

// new URL() in the route file so webpack bundles the font into this serverless function
const fredokaFont = fetch(
  new URL('./fonts/Fredoka-SemiBold.ttf', import.meta.url),
).then((res) => res.arrayBuffer());

export const alt = 'Eddy — Missouri River Float Trip Planner';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const dynamic = 'force-dynamic';

export default async function Image() {
  const [fontData, otterImage] = await Promise.all([
    fredokaFont,
    loadOtterImage(OTTER_URLS.standard),
  ]);
  const fonts = formatFredokaFont(fontData);

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #161748 0%, #1a1f5c 50%, #1B4965 100%)',
          position: 'relative',
        }}
      >
        {/* LEFT — Eddy Otter */}
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
          {/* Brand name in Fredoka coral */}
          <span
            style={{
              fontFamily: 'Fredoka',
              fontSize: 96,
              fontWeight: 600,
              color: BRAND_COLORS.accentCoral,
              lineHeight: 1,
              letterSpacing: -1,
              marginBottom: 16,
            }}
          >
            Eddy
          </span>

          {/* Subtitle */}
          <span
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 24,
              fontWeight: 400,
              color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.4,
              maxWidth: 480,
            }}
          >
            Missouri River Float Trip Planner
          </span>

          {/* Feature pills */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 32,
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
                fontFamily: 'system-ui, sans-serif',
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
                fontFamily: 'system-ui, sans-serif',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              30+ Access Points
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'rgba(240,112,82,0.15)',
                color: '#F07052',
                border: '1px solid rgba(240,112,82,0.25)',
                borderRadius: 100,
                padding: '8px 16px',
                fontFamily: 'system-ui, sans-serif',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Float Times
            </div>
          </div>
        </div>

        {/* Domain watermark */}
        <span
          style={{
            position: 'absolute',
            bottom: 24,
            right: 48,
            fontFamily: 'system-ui, sans-serif',
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
