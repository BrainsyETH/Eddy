// src/app/opengraph-image.tsx
// Homepage OG image

import { ImageResponse } from 'next/og';
import { loadOGFonts, loadEddyAvatar } from '@/lib/og/fonts';
import { BRAND_COLORS } from '@/lib/og/colors';

export const alt = 'Plan your float trip with Eddy — Missouri Ozark river trip planner';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const [fonts, eddyAvatar] = await Promise.all([loadOGFonts(), loadEddyAvatar()]);

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #161748 0%, #1a1f5c 50%, #1B4965 100%)',
          padding: 48,
          position: 'relative',
        }}
      >
        {/* Eddy Avatar */}
        <div
          style={{
            display: 'flex',
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${BRAND_COLORS.greenTreeline} 0%, ${BRAND_COLORS.mossGreen} 100%)`,
            border: '3px solid rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            marginBottom: 24,
          }}
        >
{/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={eddyAvatar}
            width={64}
            height={64}
            alt=""
            style={{ objectFit: 'cover' }}
          />
        </div>

        {/* Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontFamily: 'Space Grotesk',
              fontSize: 42,
              fontWeight: 700,
              color: 'white',
              lineHeight: 1.1,
            }}
          >
            Plan your float trip
          </span>
          <span
            style={{
              fontFamily: 'Space Grotesk',
              fontSize: 42,
              fontWeight: 700,
              color: BRAND_COLORS.bluewater,
              lineHeight: 1.1,
            }}
          >
            with Eddy
          </span>
        </div>

        {/* Tagline */}
        <span
          style={{
            fontFamily: 'Inter',
            fontSize: 18,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.7)',
            marginBottom: 32,
          }}
        >
          Missouri&apos;s Ozark rivers — live gauges, access points, and trip planning
        </span>

        {/* Feature Pills */}
        <div
          style={{
            display: 'flex',
            gap: 8,
          }}
        >
          {/* Live USGS Data - Blue */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(57,160,202,0.2)',
              color: '#39a0ca',
              border: '1px solid rgba(57,160,202,0.3)',
              borderRadius: 100,
              padding: '6px 14px',
              fontFamily: 'Space Grotesk',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Live USGS Data
          </div>

          {/* 30+ Access Points - Green */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(71,133,89,0.2)',
              color: '#81B29A',
              border: '1px solid rgba(71,133,89,0.3)',
              borderRadius: 100,
              padding: '6px 14px',
              fontFamily: 'Space Grotesk',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            30+ Access Points
          </div>

          {/* Float Times - Coral */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(240,112,82,0.15)',
              color: '#F07052',
              border: '1px solid rgba(240,112,82,0.25)',
              borderRadius: 100,
              padding: '6px 14px',
              fontFamily: 'Space Grotesk',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Float Times
          </div>
        </div>

        {/* Wave Lines */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            bottom: 60,
            left: 48,
            right: 200,
            gap: 8,
          }}
        >
          <div
            style={{
              height: 2,
              background:
                'linear-gradient(90deg, transparent 0%, rgba(57,160,202,0.4) 30%, rgba(57,160,202,0.4) 70%, transparent 100%)',
              borderRadius: 1,
            }}
          />
          <div
            style={{
              height: 2,
              background:
                'linear-gradient(90deg, transparent 0%, rgba(57,160,202,0.3) 25%, rgba(57,160,202,0.3) 75%, transparent 100%)',
              borderRadius: 1,
            }}
          />
          <div
            style={{
              height: 2,
              background:
                'linear-gradient(90deg, transparent 0%, rgba(57,160,202,0.2) 20%, rgba(57,160,202,0.2) 80%, transparent 100%)',
              borderRadius: 1,
            }}
          />
        </div>

        {/* Domain Watermark */}
        <span
          style={{
            position: 'absolute',
            bottom: 24,
            right: 48,
            fontFamily: 'Space Grotesk',
            fontSize: 14,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          eddy.guide
        </span>
      </div>
    ),
    {
      ...size,
      fonts,
    }
  );
}
