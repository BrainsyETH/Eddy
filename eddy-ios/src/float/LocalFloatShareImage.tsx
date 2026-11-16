import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Image, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { compactShareDuration, floatShareLayout } from '@eddy/conditions/float-share-layout';
import { localFloatShare } from '@/lib/localFloatShare';
import { fonts } from '@/theme/typography';

const faces = { display: fonts.display, heading: fonts.heading, body: fonts.body, mono: fonts.monoMedium };

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
  const layout = floatShareLayout({ ...model, duration: compactShareDuration(model.duration), distanceLabel: 'Distance' });
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.export}>
    <Svg ref={svg} width={360} height={640} viewBox="0 0 1080 1920" onLayout={() => setLaidOut(true)}>
      {layout.elements.map((item, i) => item.kind === 'box'
        ? <Rect key={i} x={item.x} y={item.y} width={item.width} height={item.height} rx={item.radius}
          fill={item.fill} stroke={item.border} strokeWidth={item.border ? 2 : 0} />
        : item.kind === 'path' ? <Path key={i} d={item.d} fill={item.fill} stroke={item.stroke} strokeWidth={item.strokeWidth} />
        : <SvgText key={i} x={item.center ? item.x + item.width / 2 : item.x} y={item.y + item.size * 0.96}
          fill={item.color} fontFamily={faces[item.face]} fontSize={item.size}
          textAnchor={item.center ? 'middle' : 'start'}>{item.text}</SvgText>)}
      {art !== 'omit' ? <Image href={require('../../assets/otter/standard.png')} {...layout.art}
        onLoad={() => setArt(current => current === 'loading' ? 'ready' : current)} /> : null}
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
