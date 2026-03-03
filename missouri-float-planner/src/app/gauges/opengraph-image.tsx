// src/app/gauges/opengraph-image.tsx
// OG image for the gauges dashboard — Flood otter + "River Levels" in Fredoka coral

import { ImageResponse } from 'next/og';
import { loadFredokaFont, loadOtterImage, OTTER_URLS } from '@/lib/og/fonts';
import { BRAND_COLORS } from '@/lib/og/colors';
import { createClient } from '@/lib/supabase/server';

export const alt = 'River Levels — Real-time water levels on eddy.guide';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 300;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '...';
}

export default async function Image() {
  const fonts = loadFredokaFont();
  const otterImage = await loadOtterImage(OTTER_URLS.flood);

  // Fetch global Eddy summary for the OG card
  let eddyQuoteSnippet: string | null = null;
  try {
    const supabase = await createClient();
    const { data: eddyData } = await supabase
      .from('eddy_updates')
      .select('summary_text, quote_text')
      .eq('river_slug', 'global')
      .is('section_slug', null)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (eddyData) {
      eddyQuoteSnippet = eddyData.summary_text || eddyData.quote_text || null;
    }
  } catch {
    // Eddy quote fetch failed, skip
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          background: '#1A3D40',
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
              fontSize: 108,
              fontWeight: 600,
              color: BRAND_COLORS.accentCoral,
              lineHeight: 1,
              letterSpacing: -2,
              marginBottom: 20,
            }}
          >
            River Levels
          </span>

          {/* Subtitle */}
          <span
            style={{
              fontSize: 30,
              fontWeight: 400,
              color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.4,
              maxWidth: 540,
            }}
          >
            Real-time USGS water levels and flow trends across Missouri
          </span>

          {/* Eddy quote snippet */}
          {eddyQuoteSnippet && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                backgroundColor: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                padding: '12px 16px',
                marginTop: 24,
                maxWidth: 540,
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.8)',
                  lineHeight: 1.4,
                  fontStyle: 'italic',
                }}
              >
                &ldquo;{truncate(eddyQuoteSnippet, 120)}&rdquo;
              </span>
            </div>
          )}

          {/* Feature pills */}
          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: eddyQuoteSnippet ? 16 : 32,
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
                padding: '10px 20px',
                fontSize: 18,
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
                padding: '10px 20px',
                fontSize: 18,
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
