import React, { useEffect, useMemo, useState } from 'react';
import { Audio, cancelRender, continueRender, delayRender, Img, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { readingCues, readingTiming, READ_VOICE_LEAD, READ_VOICE_GAP, type ReadScene, type ReadVoiceover, type ReadWeather } from '../../../../shared/eddy-read-reel';
import { conditionChip, conditionOtterMood } from '../../../../shared/condition-system';
import { colors, REEL_SAFE, SURFACES, LABELS } from '../../../../shared/social-brand';
import { eddyVariantFile } from '../../components/EddyMascot';
import { ReelPage, SafeImg } from '../../components/ReelPage';
import { fontFamilies, loadFonts } from '../../design-tokens/fonts';

export interface EddyReadReelProps extends Record<string, unknown> {
  riverName: string;
  readingText: string;
  dateLabel: string;
  conditionCode?: string;
  gaugeHeightFt?: number | null;
  weather?: ReadWeather | null;
  scenes?: ReadScene[];
  voiceover?: ReadVoiceover;
}

/** One river and one spoken phrase at a time. The report never auto-scrolls
 * away from its narrator. Measured sentence clips anchor the visual changes. */
export const EddyReadReel: React.FC<EddyReadReelProps> = (props) => {
  const { readingText, dateLabel, voiceover } = props;
  const frame = useCurrentFrame();
  const [fontHandle] = useState(() => delayRender('Load Eddy Read fonts'));
  useEffect(() => { void loadFonts().then(() => continueRender(fontHandle)).catch(cancelRender); }, [fontHandle]);
  const scenes = useMemo(() => props.scenes?.length ? props.scenes : [{
    riverName: props.riverName, text: readingText, conditionCode: props.conditionCode,
  }], [props.scenes, props.riverName, readingText, props.conditionCode]);
  const cues = useMemo(() => readingCues(readingText, voiceover, scenes), [readingText, voiceover, scenes]);
  const { duration, endingStart } = readingTiming(readingText, voiceover);
  const closing = frame >= endingStart;
  // Hold the last phrase through its breath; the first is visible at frame 0.
  const cue = [...cues].reverse().find(item => frame >= item.from) ?? cues[0];
  const sceneIndex = Math.min(cue?.sceneIndex ?? 0, scenes.length - 1);
  const scene = scenes[sceneIndex];
  const photo = 'photo' in scene ? scene.photo : undefined;
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const showPhoto = !closing && photo && photo.url !== failedPhoto;
  const chip = scene.conditionCode && scene.conditionCode !== 'unknown' ? conditionChip(scene.conditionCode) : null;
  const mood = scene.conditionCode && scene.conditionCode !== 'unknown' ? conditionOtterMood(scene.conditionCode) : 'standard';
  const ink = SURFACES.light.ink;
  const section = closing ? 'Before you go' : cue?.topic === 'weather' ? 'Weather outlook' : cue?.topic === 'launch' ? 'Before you launch' : 'On the water';
  const sentenceText = closing ? 'Check your stretch.\nPlan your float.' : cue?.text || readingText;
  const reveal = interpolate(frame - (cue?.from ?? 0), [0, 8], [7, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  let voiceStart = READ_VOICE_LEAD;

  return <ReelPage>
    <Audio loop src={staticFile('audio/promo-music-bed.wav')} volume={f => interpolate(f, [0, 18, duration - 24, duration], [0, voiceover ? 0.035 : 0.09, voiceover ? 0.035 : 0.09, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    {voiceover?.clips.map((clip, i) => {
      const start = voiceStart;
      voiceStart += clip.durationFrames + READ_VOICE_GAP;
      return <Sequence key={i} from={start} durationInFrames={clip.durationFrames} layout="none"><Audio src={staticFile(clip.src)} volume={1} /></Sequence>;
    })}
    {voiceover && <Sequence from={endingStart} durationInFrames={voiceover.closing.durationFrames} layout="none"><Audio src={staticFile(voiceover.closing.src)} volume={1} /></Sequence>}

    {/* Scenery may reach the edge. Every title, caption and mascot stays UI-safe. */}
    <div style={{ position: 'absolute', top: 555, left: 0, right: 0, height: 465, overflow: 'hidden', background: colors.primary[100], borderBottom: `7px solid ${colors.accent[500]}` }}>
      {showPhoto ? <SafeImg key={photo.url} src={photo.url} onFailure={() => setFailedPhoto(photo.url)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1 + frame / duration * 0.045})` }} /> :
        <svg viewBox="0 0 1080 465" width="1080" height="465" aria-hidden>
          <path d="M-60 390Q230 20 580 230T1160 30" fill="none" stroke={colors.primary[200]} strokeWidth="185" />
          <path d="M-80 410Q230 40 580 250T1160 50" fill="none" stroke={colors.primary[300]} strokeWidth="4" />
          <path d="M-80 450Q230 80 580 290T1160 90" fill="none" stroke={colors.primary[300]} strokeWidth="4" />
        </svg>}
    </div>

    <div style={{ position: 'absolute', top: REEL_SAFE.top, bottom: REEL_SAFE.bottom, left: REEL_SAFE.left, right: REEL_SAFE.right, display: 'flex', flexDirection: 'column' }}>
      <div data-read-region="header" style={{ height: 305, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: colors.primary[700], fontFamily: fontFamilies.display, fontSize: 29, fontWeight: 600 }}>
          <Img src={staticFile('eddy/eddy-favicon.png')} style={{ width: 44, height: 44, objectFit: 'contain' }} />
          {LABELS.eddyRead}
          <span style={{ marginLeft: 'auto', fontFamily: fontFamilies.body, fontSize: 22, color: SURFACES.light.inkSecondary }}>{scenes.length > 1 ? `${sceneIndex + 1} / ${scenes.length} rivers` : 'River report'}</span>
        </div>
        <div data-read-region="title" style={{ fontFamily: fontFamilies.display, fontSize: scene.riverName.length > 26 ? 58 : 76, lineHeight: 1.02, fontWeight: 650, letterSpacing: -1.5, marginTop: 22, overflowWrap: 'anywhere' }}>
          {closing ? 'See you on the river.' : scene.riverName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18, fontSize: 23 }}>
          {!closing && chip && <span style={{ color: chip.color, background: chip.background, border: `2px solid ${chip.borderColor}`, borderRadius: 10, padding: '5px 12px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{chip.label} now</span>}
          <span style={{ color: SURFACES.light.inkSecondary }}>{scenes.length > 1 ? 'Current water · Weekend forecast' : typeof props.gaugeHeightFt === 'number' && Number.isFinite(props.gaugeHeightFt) ? `${props.gaugeHeightFt.toFixed(1)} ft at the gauge` : 'Current water conditions'}</span>
        </div>
      </div>

      <div data-read-region="scene" style={{ height: 465, flexShrink: 0, position: 'relative' }}>
        <Img data-read-region="eddy" src={staticFile(eddyVariantFile(closing ? 'canoe' : mood))} style={{ position: 'absolute', bottom: 45, left: showPhoto ? 460 : 110, width: showPhoto ? 190 : 430, height: showPhoto ? 200 : 345, objectFit: 'contain', transform: `translateY(${Math.sin(frame / 32) * 3}px)` }} />
        {showPhoto && <div data-read-region="credit" style={{ position: 'absolute', left: 0, bottom: 18, maxWidth: 660, color: 'white', background: colors.primary[900], padding: '6px 10px', fontSize: 18, lineHeight: 1.3 }}>River photo · {photo.author} · Not live</div>}
      </div>

      <div data-read-region="caption" style={{ flex: 1, minHeight: 0, paddingTop: 28, color: ink }}>
        <div style={{ fontSize: 22, fontFamily: fontFamilies.display, color: colors.primary[700], marginBottom: 14 }}>{section}</div>
        <div data-read-text data-read-cue={closing ? 'closing' : cue?.from} style={{ fontFamily: closing ? fontFamilies.display : fontFamilies.body, fontSize: closing ? 64 : 48, lineHeight: 1.17, fontWeight: closing ? 650 : 620, letterSpacing: -0.8, whiteSpace: 'pre-line', overflowWrap: 'anywhere', transform: closing ? undefined : `translateY(${reveal}px)` }}>{sentenceText}</div>
      </div>

      <div data-read-region="footer" style={{ flexShrink: 0, paddingTop: 14, borderTop: `2px solid ${colors.primary[200]}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontFamily: fontFamilies.display, fontSize: 29, fontWeight: 600, color: colors.primary[800] }}>eddy.guide</span>
          <span style={{ fontSize: 19, color: SURFACES.light.inkSecondary }}>{voiceover ? 'AI voice · ' : ''}{closing ? 'Plan it on the Eddy app' : 'Full Read in caption'}</span>
        </div>
        <div data-read-region="source" style={{ fontSize: 17, lineHeight: 1.25, color: SURFACES.light.inkSecondary, marginTop: 6 }}>{'dateLabel' in scene && scene.dateLabel ? scene.dateLabel : dateLabel}</div>
      </div>
    </div>
  </ReelPage>;
};
