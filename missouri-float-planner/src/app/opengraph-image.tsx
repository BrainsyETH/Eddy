// src/app/opengraph-image.tsx
// Homepage OG image — Eddy otter + brand title in Fredoka coral

import { ImageResponse } from 'next/og';
import { loadFredokaFont, loadOtterImage, OTTER_URLS } from '@/lib/og/fonts';
import { BRAND_COLORS } from '@/lib/og/colors';

export const alt = 'Eddy - Your River Guide';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Static brand card — cache the generated PNG (regenerate daily) instead of
// rebuilding it on every request.
export const revalidate = 86400;

export default async function Image() {
  const fonts = loadFredokaFont();

  // Load otter image with fallback — if external fetch fails,
  // render the card without otter rather than failing the entire image
  let otterImage: string | null = null;
  try {
    otterImage = await loadOtterImage(OTTER_URLS.standard);
  } catch {
    // Otter image fetch failed — render text-only card
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: '#1A3D40',
          position: 'relative',
        }}
      >
        {/* LEFT — Eddy Otter */}
        {otterImage ? (
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
        ) : (
          <div style={{ display: 'flex', width: 120 }} />
        )}

        {/* RIGHT — Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: otterImage ? '80px 60px 80px 0' : '80px 80px',
            justifyContent: 'center',
          }}
        >
          {/* Brand name in Fredoka coral */}
          <span
            style={{
              fontFamily: 'Fredoka',
              fontSize: 128,
              fontWeight: 600,
              color: BRAND_COLORS.accentCoral,
              lineHeight: 1,
              letterSpacing: -2,
              marginBottom: 20,
            }}
          >
            Eddy
          </span>

          {/* Subtitle */}
          <span
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 46,
              fontWeight: 400,
              color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.3,
              maxWidth: 620,
            }}
          >
            Get live conditions, water levels, and float trip plans.
          </span>
        </div>

        {/* Domain watermark */}
        <span
          style={{
            position: 'absolute',
            bottom: 24,
            right: 48,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 18,
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
