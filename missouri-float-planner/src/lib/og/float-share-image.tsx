// The same presentation primitives drive this server PNG and the offline SVG.
// Measurements, condition verification and mood selection remain with callers.
import { ImageResponse } from 'next/og';
import { exploredMiles, floatMoodLabel, type FloatMood } from '@shared/float-recap';
import { shareDuration, type FloatShareState } from '@shared/float-share';
import { compactShareDuration, floatShareLayout, FLOAT_SHARE_WIDTH, FLOAT_SHARE_HEIGHT } from '@shared/float-share-layout';
import type { FloatShareNames } from '@/lib/float-share/names';
import { loadFloatShareFonts } from './float-share-fonts';

export { FLOAT_SHARE_WIDTH, FLOAT_SHARE_HEIGHT } from '@shared/float-share-layout';

const faces = {
  display: { fontFamily: 'Fredoka', fontWeight: 600 as const },
  heading: { fontFamily: 'Geist', fontWeight: 700 as const },
  body: { fontFamily: 'Geist', fontWeight: 400 as const },
  mono: { fontFamily: 'Geist Mono', fontWeight: 700 as const },
};

export function FloatShareImage({ state, names, mood, sticker }: {
  state: FloatShareState;
  names: FloatShareNames;
  /** Already through shareMood; null is the standard otter. */
  mood: FloatMood | null;
  sticker: string;
}) {
  const { elements, art } = floatShareLayout({
    river: names.riverName, from: names.putInName ?? 'Started on the river', to: names.takeOutName,
    date: state.date, duration: compactShareDuration(shareDuration(state.minutes)),
    distance: state.explored ? `${exploredMiles(state.explored.miles)} mi` : null,
    distanceLabel: 'River miles explored',
    arrival: state.reachedTakeOut ? 'Reached the take-out' : 'Arrival not confirmed',
    tracking: state.tracking === 'none' ? 'GPS tracking unavailable'
      : state.tracking === 'partial' ? 'Limited GPS tracking' : null,
    moodLabel: floatMoodLabel(mood, state.condition?.code ?? null),
    cautious: mood === 'big-water',
    condition: state.condition?.current ? state.condition : null,
  });
  return <div style={{ display: 'flex', width: FLOAT_SHARE_WIDTH, height: FLOAT_SHARE_HEIGHT, position: 'relative' }}>
    {elements.map((item, i) => item.kind === 'box' ? <div key={i} style={{
      display: 'flex', position: 'absolute', left: item.x, top: item.y,
      width: item.width, height: item.height, background: item.fill, borderRadius: item.radius,
      ...(item.border ? { border: `2px solid ${item.border}` } : {}),
    }} /> : item.kind === 'path' ? <svg key={i} width={FLOAT_SHARE_WIDTH} height={FLOAT_SHARE_HEIGHT}
      viewBox="0 0 1080 1920" style={{ position: 'absolute', left: 0, top: 0 }}>
      <path d={item.d} fill={item.fill} stroke={item.stroke} strokeWidth={item.strokeWidth} />
    </svg> : <div key={i} style={{
      display: 'flex', position: 'absolute', left: item.x, top: item.y, width: item.width,
      fontSize: item.size, lineHeight: 1.2, color: item.color, ...faces[item.face],
      justifyContent: item.center ? 'center' : 'flex-start', whiteSpace: 'nowrap',
    }}>{item.text}</div>)}
    {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders the bundled sticker */}
    <img src={sticker} width={art.width} height={art.height} alt="" style={{
      position: 'absolute', left: art.x, top: art.y, objectFit: 'contain',
    }} />
  </div>;
}

export function renderFloatShareImage(props: Parameters<typeof FloatShareImage>[0]): ImageResponse {
  return new ImageResponse(<FloatShareImage {...props} />, {
    width: FLOAT_SHARE_WIDTH, height: FLOAT_SHARE_HEIGHT, fonts: loadFloatShareFonts(),
  });
}
