import React from 'react';
import { Audio, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { readingTimeline, readingDuration, READ_CTA_FRAMES } from '../../../../shared/eddy-read-reel';
import { REEL_SAFE, SURFACES, LABELS } from '../../../../shared/social-brand';
import { ReelPage } from '../../components/ReelPage';
import { ReelMasthead } from '../../components/ReelMasthead';
import { fontFamilies } from '../../design-tokens/fonts';

export interface EddyReadReelProps extends Record<string, unknown> { riverName: string; readingText: string; dateLabel: string; }
export const EddyReadReel: React.FC<EddyReadReelProps> = ({ riverName, readingText, dateLabel }) => {
  const frame = useCurrentFrame();
  const pages = readingTimeline(readingText);
  const duration = readingDuration(readingText);
  const end = frame >= duration - READ_CTA_FRAMES;
  const index = pages.findIndex(page => frame < page.start + page.frames);
  const active = pages[Math.max(0, index)];
  const progress = active ? interpolate(frame - active.start, [0, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  return <ReelPage>
    <Audio loop src={staticFile('audio/background-music.wav')} volume={f => interpolate(f, [0, 30, duration - 45, duration], [0, 0.16, 0.16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    <ReelMasthead pinned label={LABELS.eddyRead} title={riverName} subtitle={dateLabel} />
    <div style={{ position: 'absolute', top: 570, left: REEL_SAFE.left, right: REEL_SAFE.right, bottom: REEL_SAFE.bottom + 90, overflow: 'hidden', fontFamily: fontFamilies.display }}>
      {end ? <div style={{ fontSize: 48, lineHeight: 1.25, color: SURFACES.light.ink, paddingTop: 120 }}>Find your put-in and take-out on Eddy.<div style={{ fontSize: 38, marginTop: 40 }}>eddy.guide</div></div> : <>
        <div style={{ minHeight: 100, fontSize: 26, lineHeight: 1.3, opacity: 0.35, color: SURFACES.light.ink }}>{index > 0 ? pages[index - 1].text.slice(-85) : 'The full river reading'}</div>
        <div style={{ transform: `translateY(${(1 - progress) * 48}px)`, opacity: progress, fontSize: 42, lineHeight: 1.4, overflowWrap: 'anywhere', color: SURFACES.light.ink, borderLeft: '6px solid #F07052', paddingLeft: 24 }}>{active?.text}</div>
      </>}
    </div>
    <div style={{ position: 'absolute', bottom: REEL_SAFE.bottom + 25, left: REEL_SAFE.left, fontSize: 24, fontFamily: fontFamilies.display, color: SURFACES.light.inkSecondary }}>{end ? 'Check the latest conditions before your trip' : `${Math.max(0,index) + 1} / ${pages.length}`}</div>
  </ReelPage>;
};
