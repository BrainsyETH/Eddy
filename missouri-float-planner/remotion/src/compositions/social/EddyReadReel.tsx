import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Audio, continueRender, delayRender, Img, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { readingBlocks, readingTiming, readingScrollY, READ_VOICE_LEAD, READ_VOICE_GAP, type ReadingTopic, type ReadVoiceover, type ReadWeather } from '../../../../shared/eddy-read-reel';
import { conditionChip, conditionOtterMood } from '../../../../shared/condition-system';
import { cardStyle, colors, CTA, REEL_SAFE, SURFACES, LABELS } from '../../../../shared/social-brand';
import { eddyVariantFile } from '../../components/EddyMascot';
import { ReelPage } from '../../components/ReelPage';
import { ReelMasthead } from '../../components/ReelMasthead';
import { fontFamilies, loadFonts } from '../../design-tokens/fonts';
import { WeatherIcon } from './RiverCard';

export interface EddyReadReelProps extends Record<string, unknown> {
  riverName: string;
  readingText: string;
  dateLabel: string;
  conditionCode?: string;
  gaugeHeightFt?: number | null;
  weather?: ReadWeather | null;
  voiceover?: ReadVoiceover;
}

const topicLabels: Record<ReadingTopic, string> = { water: 'On the water', weather: 'Weather outlook', launch: 'Before you launch' };

/** Small editorial illustrations. The weather glyph names a topic, not a forecast. */
const TopicArt: React.FC<{ topic: ReadingTopic; phase?: number }> = ({ topic, phase = 0 }) => (
  <svg width="42" height="42" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {topic === 'water' ? <g transform={`translate(0 ${Math.sin(phase) * 1.5})`}>
      <path d="M3 14Q9 7 15 14T27 14T39 14T51 14M3 25Q9 18 15 25T27 25T39 25T51 25M3 36Q9 29 15 36T27 36T39 36T51 36" />
    </g> : topic === 'weather' ? <>
      <circle cx="16" cy="16" r="7" fill={colors.secondary[200]} />
      <path d="M16 3V1M5 6L3 4M3 16H1M25 6L28 3M29 16H32M7 26L4 29" />
      <path d="M14 38h23a8 8 0 0 0 0-16 11 11 0 0 0-21-1 9 9 0 0 0-2 17Z" fill={SURFACES.light.surface} />
    </> : <>
      <path d="M13 43V7M14 8C23 0 29 16 39 7V28C29 36 23 20 14 29" />
      <path d="M6 43h17" />
    </>}
  </svg>
);

/** Emphasize only measurements already present in the report, verbatim. */
const ReportText: React.FC<{ text: string }> = ({ text }) => <>
  {text.split(/(\b\d+(?:[,.]\d+)*(?:\s*(?:cfs|ft\b|feet\b|inches\b|mph\b|°[FC]\b)|%))/gi).map((part, i) =>
    i % 2 ? <strong key={i} style={{ color: colors.primary[800], background: colors.secondary[100], borderRadius: 5, padding: '0 3px', fontWeight: 700 }}>{part}</strong> : part)}
</>;

export const EddyReadReel: React.FC<EddyReadReelProps> = ({ riverName, readingText, dateLabel, conditionCode, gaugeHeightFt, weather, voiceover }) => {
  const frame = useCurrentFrame();
  const blocks = useMemo(() => readingBlocks(readingText), [readingText]);
  const { duration, endingStart, endingFrames } = readingTiming(readingText, voiceover);
  const end = frame >= endingStart;
  const viewport = useRef<HTMLDivElement>(null);
  const ending = useRef<HTMLDivElement>(null);
  const [measure, setMeasure] = useState({ viewport: 0, endingTop: 0 });
  const [handle] = useState(() => delayRender('Measure full Eddy Read after fonts load'));

  // Actual browser heights cover wrapped river names, paragraphs and icons.
  // The render cannot capture a frame using fallback-font measurements.
  useLayoutEffect(() => {
    let disposed = false;
    const measureReport = async () => {
      await loadFonts().catch(() => undefined);
      if (disposed) return;
      setMeasure({ viewport: viewport.current?.clientHeight ?? 0, endingTop: ending.current?.offsetTop ?? 0 });
    };
    void measureReport().finally(() => continueRender(handle));
    return () => { disposed = true; };
  }, [readingText, riverName, dateLabel, weather, handle]);

  const chip = conditionCode && conditionCode !== 'unknown' ? conditionChip(conditionCode) : null;
  const mascot = conditionCode && conditionCode !== 'unknown' ? conditionOtterMood(conditionCode) : 'standard';
  const hasHeight = typeof gaugeHeightFt === 'number' && Number.isFinite(gaugeHeightFt);
  const offset = readingScrollY(frame, duration, measure.endingTop, endingFrames);
  const closingScale = Math.min(1, Math.max(0.6, (measure.viewport - 48) / 630));
  const weatherBlock = Math.max(0, blocks.findIndex(block => block.topic === 'weather'));
  let voiceStart = READ_VOICE_LEAD;

  return <ReelPage>
    <Audio loop src={staticFile('audio/promo-music-bed.wav')} volume={f => interpolate(f, [0, 18, duration - 24, duration], [0, voiceover ? 0.035 : 0.09, voiceover ? 0.035 : 0.09, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    {voiceover?.clips.map((clip, i) => {
      const start = voiceStart;
      voiceStart += clip.durationFrames + READ_VOICE_GAP;
      return <Sequence key={i} from={start} durationInFrames={clip.durationFrames} layout="none"><Audio src={staticFile(clip.src)} volume={1} /></Sequence>;
    })}
    {voiceover && <Sequence from={endingStart} durationInFrames={voiceover.closing.durationFrames} layout="none"><Audio src={staticFile(voiceover.closing.src)} volume={1} /></Sequence>}
    <div style={{ position: 'absolute', top: REEL_SAFE.top, left: REEL_SAFE.left, right: REEL_SAFE.right + 8, bottom: REEL_SAFE.bottom, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div data-read-region="header"><ReelMasthead label={LABELS.eddyRead} title={riverName} subtitle={dateLabel} /></div>

      <div data-read-region="host" style={{ ...cardStyle(), flexShrink: 0, height: 210, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', overflow: 'hidden' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: fontFamilies.display, fontSize: 26, color: SURFACES.light.inkSecondary, marginBottom: 10 }}>Your river briefing</div>
          {chip ? <span style={{ background: chip.background, color: chip.color, border: `2px solid ${chip.borderColor}`, padding: '3px 12px', borderRadius: 10, fontSize: 30, fontWeight: 700 }}>{chip.label}</span> : <div style={{ fontFamily: fontFamilies.display, fontSize: 34 }}>A word from Eddy</div>}
          {hasHeight && <div style={{ marginTop: 10, fontSize: 24, color: SURFACES.light.inkSecondary }}>Gauge height <strong style={{ color: SURFACES.light.ink }}>{gaugeHeightFt.toFixed(1)} ft</strong></div>}
        </div>
        <div data-read-region="eddy" style={{ width: 180, height: 176, flexShrink: 0, transform: `translateY(${Math.sin(frame / 24) * 3}px)` }}>
          <Img src={staticFile(eddyVariantFile(mascot))} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      </div>

      <div ref={viewport} data-read-region="viewport" style={{ ...cardStyle(), flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        <div data-read-region="content" style={{ position: 'absolute', top: 0, left: 24, right: 24, transform: `translateY(${offset}px)`, paddingBottom: 24 }}>
          <div data-read-region="report">{blocks.map((block, i) => <div key={i} style={{ marginBottom: i < blocks.length - 1 ? 26 : 0 }}>
            {weather && i === weatherBlock && <div data-read-region="weather" style={{ marginBottom: 26, borderRadius: 16, padding: 22, background: colors.primary[50], border: `3px solid ${colors.primary[200]}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 22, fontWeight: 750, color: colors.primary[700] }}>
                <Img src={staticFile('eddy/eddy-weather.png')} style={{ width: 36, height: 44, objectFit: 'contain' }} />
                Report weather · {new Date(`${weather.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                <div><div style={{ fontFamily: fontFamilies.heading, fontWeight: 800, fontSize: 68, lineHeight: 1, color: colors.primary[900] }}>{weather.highF !== null ? `${weather.highF}°` : '—'}<span style={{ fontSize: 24, fontWeight: 600 }}> high</span></div>
                  <div style={{ fontSize: 26, marginTop: 10 }}>{weather.lowF !== null ? `${weather.lowF}° low` : ''}{weather.precipChance !== null ? ` · ${weather.precipChance}% rain` : ''}</div></div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: colors.primary[800], fontSize: 24 }}><WeatherIcon condition={weather.condition} size={100} />{weather.condition}</div>
              </div>
            </div>}
            {block.topic && block.topic !== blocks[i - 1]?.topic && <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, color: colors.primary[700], fontFamily: fontFamilies.display, fontSize: 24, fontWeight: 600 }}>
              <TopicArt topic={block.topic} phase={frame / 18} />{topicLabels[block.topic]}
            </div>}
            <p data-read-text style={{ margin: 0, fontSize: 40, fontWeight: 500, lineHeight: 1.4, overflowWrap: 'anywhere', color: SURFACES.light.ink }}><ReportText text={block.text} /></p>
          </div>)}</div>
          <div ref={ending} data-read-region="ending" style={{ marginTop: 36, minHeight: Math.max(0, measure.viewport - 48), boxSizing: 'border-box', borderRadius: 16, padding: 24 * closingScale, background: colors.secondary[100], display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 * closingScale }}>
            <div style={{ position: 'relative', height: 205 * closingScale, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 540 180" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden><path d="M-20 138Q80 76 155 120T320 118T560 113" fill="none" stroke={colors.primary[200]} strokeWidth="30" /><path d="M-20 166Q80 104 155 148T320 146T560 141" fill="none" stroke={colors.primary[300]} strokeWidth="5" /></svg>
              <Img data-read-region="closing-eddy" src={staticFile(eddyVariantFile('canoe'))} style={{ width: 280 * closingScale, height: 205 * closingScale, objectFit: 'contain', position: 'relative', transform: `translateY(${Math.sin(frame / 28) * 3}px)` }} />
            </div>
            <div data-read-region="closing-title" style={{ fontFamily: fontFamilies.heading, fontSize: 56 * closingScale, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.04, textWrap: 'balance', color: colors.primary[900] }}>{CTA.planInApp}</div>
            <div style={{ fontSize: 28 * closingScale, lineHeight: 1.35, color: colors.primary[800] }}>Check the latest conditions before you launch.</div>
            <div style={{ borderTop: `3px solid ${colors.accent[500]}`, paddingTop: 16, display: 'flex', justifyContent: 'space-between', fontFamily: fontFamilies.heading, fontSize: 28 * closingScale, fontWeight: 750, color: colors.primary[900] }}>
              <span>eddy.guide</span><span aria-hidden>↗</span>
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 20, background: `linear-gradient(${SURFACES.light.surface}, transparent)` }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 20, background: `linear-gradient(transparent, ${SURFACES.light.surface})` }} />
      </div>
      <div data-read-region="footer" style={{ flexShrink: 0, fontSize: 24, color: SURFACES.light.inkSecondary }}>
        <div style={{ height: 5, background: colors.neutral[200], marginBottom: 12, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, frame / endingStart * 100)}%`, background: colors.accent[500] }} />
        </div>
        {voiceover ? 'AI voice · Full Read in the caption' : end ? 'eddy.guide' : 'Full Read in the caption · Pause to read'}
      </div>
    </div>
  </ReelPage>;
};
