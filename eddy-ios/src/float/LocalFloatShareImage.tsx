import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Image, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { localFloatShare, shareTextLines } from '@/lib/localFloatShare';
import { lightPalette as ink } from '@/theme/palette';
import { fonts } from '@/theme/typography';

/** Mounted only during an offline export. Existing SVG native code produces the PNG. */
function LocalFloatShareImage({ trip, ready, failed }: {
  trip: CompletedFloat; ready: (base64: string) => void; failed: (error: Error) => void;
}) {
  const svg = useRef<Svg>(null);
  const [laidOut, setLaidOut] = useState(false);
  const [art, setArt] = useState<'loading' | 'ready' | 'omit'>('loading');
  const model = localFloatShare(trip);
  useEffect(() => {
    if (art !== 'loading') return;
    // The wordmark and trip facts can stand alone when decorative art fails.
    const timeout = setTimeout(() => setArt('omit'), 1_500);
    return () => clearTimeout(timeout);
  }, [art]);
  useEffect(() => {
    const timeout = setTimeout(() => failed(new Error('Could not prepare the local image')), 10_000);
    return () => clearTimeout(timeout);
  }, [failed]);
  useEffect(() => {
    if (!laidOut || art === 'loading') return;
    const frame = requestAnimationFrame(() => {
      try { svg.current?.toDataURL(data => data ? ready(data) : failed(new Error('Empty image')), { width: 1080, height: 1920 }); }
      catch { failed(new Error('Could not draw the float image')); }
    });
    return () => cancelAnimationFrame(frame);
  }, [laidOut, art, ready, failed]);
  const lines = (value: string, y: number, size: number, family: string, color: string, limit = 28) =>
    shareTextLines(value, limit).map((line, i) => <SvgText key={`${y}-${i}`} x={90} y={y + i * (size + 12)}
      fill={color} fontFamily={family} fontSize={size}>{line}</SvgText>);
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.export}>
    <Svg ref={svg} width={360} height={640} viewBox="0 0 1080 1920" onLayout={() => setLaidOut(true)}>
      <Rect width={1080} height={1920} fill={ink.bg} />
      <SvgText x={90} y={190} fill={ink.interactive} fontFamily={fonts.display} fontSize={72}>Eddy</SvgText>
      <SvgText x={90} y={248} fill={ink.textMuted} fontFamily={fonts.body} fontSize={32}>A day on the river</SvgText>
      {art !== 'omit' ? <Image href={require('../../assets/otter/standard.png')} x={690} y={115} width={260} height={260}
        onLoad={() => setArt(current => current === 'loading' ? 'ready' : current)} /> : null}
      {lines(model.river, 470, 64, fonts.display, ink.text, 23)}
      <SvgText x={90} y={730} fill={ink.textMuted} fontFamily={fonts.body} fontSize={30}>{model.date}</SvgText>
      <Line x1={90} x2={990} y1={790} y2={790} stroke={ink.borderStrong} strokeWidth={2} />
      <SvgText x={90} y={870} fill={ink.interactive} fontFamily={fonts.semibold} fontSize={25}>FROM</SvgText>
      {lines(model.from, 930, 38, fonts.heading, ink.text, 36)}
      <SvgText x={90} y={1130} fill={ink.interactive} fontFamily={fonts.semibold} fontSize={25}>TO</SvgText>
      {lines(model.to, 1190, 38, fonts.heading, ink.text, 36)}
      <Line x1={90} x2={990} y1={1360} y2={1360} stroke={ink.borderStrong} strokeWidth={2} />
      <SvgText x={90} y={1460} fill={ink.text} fontFamily={fonts.monoMedium} fontSize={48}>{model.distance ?? model.duration}</SvgText>
      <SvgText x={90} y={1520} fill={ink.textMuted} fontFamily={fonts.body} fontSize={30}>{model.distance ? `${model.duration} on the river` : 'Total time'}</SvgText>
      <SvgText x={90} y={1610} fill={ink.textMuted} fontFamily={fonts.body} fontSize={28}>{model.tracking ?? model.arrival}</SvgText>
      <SvgText x={90} y={1770} fill={ink.interactive} fontFamily={fonts.display} fontSize={42}>eddy.guide</SvgText>
    </Svg>
  </View>;
}

export function useLocalFloatShare(trip: CompletedFloat) {
  const [request, setRequest] = useState<{ ready: (data: string) => void; failed: (error: Error) => void } | null>(null);
  const pending = useRef<((error: Error) => void) | null>(null);
  useEffect(() => () => { pending.current?.(new Error('Share closed')); }, []);
  const prepare = () => new Promise<string>((resolve, reject) => {
    pending.current = reject;
    setRequest({
      ready: data => { pending.current = null; setRequest(null); resolve(data); },
      failed: error => { pending.current = null; setRequest(null); reject(error); },
    });
  });
  return { prepare, image: request ? <LocalFloatShareImage trip={trip} {...request} /> : null };
}

const styles = StyleSheet.create({
  export: { position: 'absolute', left: -10000, top: 0, width: 360, height: 640 },
});
