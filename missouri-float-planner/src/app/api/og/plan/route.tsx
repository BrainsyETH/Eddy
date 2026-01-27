// src/app/api/og/plan/route.tsx
// Dynamic OG image for shared float plans
// Two-panel: Eddy branding left, plan + gauge data right

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

type ConditionCode = 'dangerous' | 'high' | 'optimal' | 'low' | 'very_low' | 'too_low' | 'unknown';

const conditionDisplay: Record<ConditionCode, {
  label: string;
  secondaryLabel: string;
  textColor: string;
  bg: string;
  otterImage: string;
}> = {
  optimal:   {
    label: 'OPTIMAL',
    secondaryLabel: 'GOOD CONDITIONS',
    textColor: '#1A3D23',
    bg: '#4EB86B',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png'
  },
  low:       {
    label: 'LOW',
    secondaryLabel: 'FLOATABLE',
    textColor: '#1A3D23',
    bg: '#84CC16',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png'
  },
  very_low:  {
    label: 'VERY LOW',
    secondaryLabel: 'SCRAPING LIKELY',
    textColor: '#2D2A24',
    bg: '#EAB308',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png'
  },
  high:      {
    label: 'HIGH WATER',
    secondaryLabel: 'EXPERIENCED ONLY',
    textColor: '#ffffff',
    bg: '#F97316',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png'
  },
  too_low:   {
    label: 'TOO LOW',
    secondaryLabel: 'NOT RECOMMENDED',
    textColor: '#2D2A24',
    bg: '#EAB308',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png'
  },
  dangerous: {
    label: 'DANGEROUS',
    secondaryLabel: 'DO NOT FLOAT',
    textColor: '#ffffff',
    bg: '#DC2626',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png'
  },
  unknown:   {
    label: 'UNKNOWN',
    secondaryLabel: 'CONDITIONS UNAVAILABLE',
    textColor: '#2D2A24',
    bg: '#C2BAAC',
    otterImage: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png'
  },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const river = searchParams.get('river') || 'Missouri River';
  const putIn = searchParams.get('putIn') || 'Start';
  const takeOut = searchParams.get('takeOut') || 'End';
  const condition = (searchParams.get('condition') || 'unknown') as ConditionCode;
  const gaugeName = searchParams.get('gaugeName') || 'USGS Gauge';
  const gaugeHeight = searchParams.get('gaugeHeight') || '';
  const dischargeCfs = searchParams.get('dischargeCfs') || '';

  const cond = conditionDisplay[condition] || conditionDisplay.unknown;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'row',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#1A3D40',
        }}
      >
        {/* LEFT PANEL — Eddy the Otter */}
        <div
          style={{
            width: '340px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0F2D35',
            borderRight: '8px solid #000',
            position: 'relative',
          }}
        >
          {/* Hard shadow effect */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              right: '-24px',
              width: '16px',
              height: '100%',
              background: '#000',
              display: 'flex',
            }}
          />

          {/* Eddy the Otter - condition-based */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cond.otterImage}
            width={280}
            height={280}
            style={{ marginBottom: '20px', objectFit: 'contain' }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '16px 24px',
              background: '#F07052',
              border: '6px solid #000',
              boxShadow: '8px 8px 0 #000',
            }}
          >
            <span style={{ fontSize: '28px', fontWeight: 900, color: 'white', letterSpacing: '0.15em' }}>
              EDDY
            </span>
          </div>
        </div>

        {/* RIGHT PANEL — content */}
        <div
          style={{
            flex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#1A3D40',
            padding: '48px 56px',
          }}
        >
          {/* Float Plan Label */}
          <div
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              padding: '12px 24px',
              background: '#F07052',
              border: '5px solid #000',
              boxShadow: '6px 6px 0 #000',
              marginBottom: '24px',
            }}
          >
            <span style={{ fontSize: '24px', fontWeight: 900, color: 'white', letterSpacing: '0.1em' }}>
              FLOAT PLAN
            </span>
          </div>

          {/* River name — HUGE */}
          <h1
            style={{
              fontSize: '68px',
              fontWeight: 900,
              color: 'white',
              lineHeight: 0.95,
              letterSpacing: '-0.02em',
              margin: '0 0 32px 0',
              fontStyle: 'italic',
            }}
          >
            {river.toUpperCase()}
          </h1>

          {/* Route info with icons */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              marginBottom: '32px',
              padding: '20px 24px',
              background: '#0F2D35',
              border: '4px solid #000',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  background: '#4EB86B',
                  border: '3px solid #000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '20px', color: '#000' }}>📍</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#A0C4C7', letterSpacing: '0.1em' }}>PUT-IN LOCATION</span>
                <span style={{ fontSize: '22px', fontWeight: 800, color: 'white' }}>{putIn}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  background: '#F07052',
                  border: '3px solid #000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '20px', color: '#000' }}>🎯</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#A0C4C7', letterSpacing: '0.1em' }}>TAKE-OUT POINT</span>
                <span style={{ fontSize: '22px', fontWeight: 800, color: 'white' }}>{takeOut}</span>
              </div>
            </div>
          </div>

          {/* CURRENT WATER FLOW - Brutalist card */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '28px 32px',
              background: '#F4EFE7',
              border: '6px solid #000',
              boxShadow: '10px 10px 0 #000',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Label */}
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#6B6459', letterSpacing: '0.15em' }}>
                CURRENT WATER FLOW
              </span>

              {/* Condition Status - MASSIVE */}
              <div
                style={{
                  display: 'inline-flex',
                  alignSelf: 'flex-start',
                  padding: '16px 32px',
                  background: cond.bg,
                  border: '5px solid #000',
                  boxShadow: '8px 8px 0 #000',
                  marginBottom: '8px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '52px', fontWeight: 900, color: cond.textColor, lineHeight: 1, letterSpacing: '-0.02em' }}>
                    {cond.label}
                  </span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: cond.textColor, opacity: 0.8, marginTop: '4px' }}>
                    {cond.secondaryLabel}
                  </span>
                </div>
              </div>

              {/* Gauge data grid */}
              <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-end' }}>
                {/* Gauge Height */}
                {gaugeHeight && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#857D70', letterSpacing: '0.1em', marginBottom: '4px' }}>
                      GAUGE HEIGHT
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ fontSize: '48px', fontWeight: 900, color: '#2D2A24', letterSpacing: '-0.03em' }}>
                        {gaugeHeight}
                      </span>
                      <span style={{ fontSize: '24px', fontWeight: 800, color: '#6B6459' }}>ft</span>
                    </div>
                  </div>
                )}

                {/* CFS */}
                {dischargeCfs && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#857D70', letterSpacing: '0.1em', marginBottom: '4px' }}>
                      DISCHARGE (CFS)
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ fontSize: '48px', fontWeight: 900, color: '#2D2A24', letterSpacing: '-0.03em' }}>
                        {dischargeCfs}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Gauge name */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '8px',
                  padding: '8px 16px',
                  background: '#E5DED2',
                  border: '3px solid #C2BAAC',
                }}
              >
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#6B6459' }}>
                  {gaugeName}
                </span>
              </div>
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
