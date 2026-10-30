// src/lib/og/float-share-image.tsx
// The 9:16 float share image (docs/float-history-card-plan.md, phase 5), from
// the design's share board: the dark river-teal surface, the mood sticker, the
// mood in Fredoka, and the condition as a tilted stamp. The stamp lives here
// and only here; the app's cards use a flat badge.
//
// It draws only what the parsed share and the resolved names say. The route
// decides the otter (shareMood) before this sees it.

import { ImageResponse } from 'next/og';
import { CONDITION_SYSTEM } from '@shared/condition-system';
import { colors } from '@shared/social-brand';
import { exploredMiles, exploredPercent, floatMoodLabel, riverShortName, type FloatMood } from '@shared/float-recap';
import { shareDuration, type FloatShareState } from '@shared/float-share';
import type { FloatShareNames } from '@/lib/float-share/names';
import { loadOgFonts } from './fonts';

export const FLOAT_SHARE_WIDTH = 1080;
export const FLOAT_SHARE_HEIGHT = 1920;

const INK = '#FAFAFA';
const MUTED = 'rgba(250,250,250,0.72)';
const CORAL = colors.accent[500];

function shareDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase();
}

/** "4h 12m": the share board's compact form, which fits a third of the width. */
function compactDuration(minutes: number): string {
  if (minutes < 60) return shareDuration(minutes);
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)}h ${rest}m` : `${minutes / 60}h`;
}

function Stat({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 8 }}>
      <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 60, color: INK }}>{value}</div>
      <div style={{ display: 'flex', fontSize: 30, color: MUTED, textAlign: 'center' }}>{label}</div>
      {note ? <div style={{ display: 'flex', fontSize: 28, color: MUTED, textAlign: 'center' }}>{note}</div> : null}
    </div>
  );
}

export function FloatShareImage({
  state,
  names,
  mood,
  sticker,
}: {
  state: FloatShareState;
  names: FloatShareNames;
  /** Already through shareMood; null is the standard otter. */
  mood: FloatMood | null;
  /** The sticker as a data URL. */
  sticker: string;
}) {
  const label = floatMoodLabel(mood, state.condition?.code ?? null);
  // The standard otter's PNG carries more empty margin than the stickers.
  const size = mood ? 470 : 540;
  const route = names.putInName ? `${names.putInName} → ${names.takeOutName}` : `To ${names.takeOutName}`;
  // The route line already names the take-out; this says only what was confirmed.
  const arrival = state.reachedTakeOut ? `Reached ${names.takeOutName}` : 'Arrival not confirmed';
  // A condition label only for a reading current enough to rate (float-recap.ts).
  const stamp = state.condition?.current ? state.condition : null;
  const stampColor = stamp ? CONDITION_SYSTEM[stamp.code].solid : INK;
  const explored = state.explored;
  return (
    <div
      style={{
        width: FLOAT_SHARE_WIDTH,
        height: FLOAT_SHARE_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: colors.primary[800],
        color: INK,
        fontFamily: 'Fredoka',
        padding: '96px 90px 90px',
      }}
    >
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontSize: 100, color: CORAL }}>eddy</div>
        <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 38, color: MUTED }}>{shareDate(state.date)}</div>
      </div>

      <div
        style={{
          display: 'flex',
          marginTop: 56,
          width: 540,
          height: 540,
          borderRadius: 270,
          background: 'rgba(250,250,250,0.06)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image */}
        <img src={sticker} width={size} height={size} style={{ objectFit: 'contain' }} alt="" />
      </div>

      {label ? (
        <div style={{ display: 'flex', marginTop: 50, fontSize: 116, color: CORAL, textAlign: 'center' }}>{label}</div>
      ) : null}
      <div style={{ display: 'flex', marginTop: label ? 18 : 50, fontSize: 86, textAlign: 'center' }}>{names.riverName}</div>
      <div style={{ display: 'flex', marginTop: 14, fontSize: 42, color: MUTED, textAlign: 'center' }}>{route}</div>
      <div style={{ display: 'flex', marginTop: 10, fontSize: 36, color: MUTED, textAlign: 'center' }}>{arrival}</div>

      {stamp ? (
        <div
          style={{
            display: 'flex',
            marginTop: 48,
            transform: 'rotate(-4deg)',
            border: `6px solid ${stampColor}`,
            borderRadius: 22,
            padding: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 28,
              border: `3px solid ${stampColor}`,
              borderRadius: 14,
              padding: '16px 36px',
              color: stampColor,
            }}
          >
            <div style={{ display: 'flex', fontSize: 44, letterSpacing: 4 }}>{CONDITION_SYSTEM[stamp.code].label.toUpperCase()}</div>
            {stamp.cfs != null ? (
              <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 50 }}>
                {`${stamp.cfs.toLocaleString('en-US')} cfs`}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flex: 1, minHeight: 48 }} />

      <div style={{ display: 'flex', width: '100%', gap: 24, alignItems: 'flex-start' }}>
        {state.miles != null ? (
          <Stat value={state.miles.toFixed(1)} label="miles paddled" />
        ) : (
          <Stat value="—" label="GPS distance unavailable" />
        )}
        <Stat value={compactDuration(state.minutes)} label="on the water" />
        {explored ? (
          <Stat
            value={exploredMiles(explored.miles)}
            label="river miles explored"
            note={`${exploredPercent(explored.miles / explored.spanMiles)} of ${riverShortName(names.riverName)}`}
          />
        ) : null}
      </div>

      <div style={{ display: 'flex', marginTop: 64, fontSize: 38, color: MUTED }}>
        Plan yours at&nbsp;<span style={{ color: INK }}>eddy.guide</span>
      </div>
    </div>
  );
}

/** The PNG response, outside any caller's try block: the route catches the render, not the JSX. */
export function renderFloatShareImage(props: Parameters<typeof FloatShareImage>[0]): ImageResponse {
  return new ImageResponse(<FloatShareImage {...props} />, {
    width: FLOAT_SHARE_WIDTH,
    height: FLOAT_SHARE_HEIGHT,
    fonts: loadOgFonts(),
  });
}
