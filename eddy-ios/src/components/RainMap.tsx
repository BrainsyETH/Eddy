import { useEffect, useId, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Mask, Path, Pattern, Rect, Text as SvgText } from 'react-native-svg';
import type { RainDetail } from '@eddy/conditions/rainfall';
import { rainfallMap } from '@eddy/conditions/rainfall-map';
import { loadMapbox, STYLE_URL } from '@/map/runtime';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

const HEIGHT = 260;
const ATTRIBUTION_SPACE = 36;

type BasemapState = 'loading' | 'ready' | 'failed' | 'unavailable';

/** Fixed camera: native geography and the rainfall SVG share one Mercator viewport. */
function Basemap({ bounds, onState }: { bounds: ReturnType<typeof rainfallMap>['bounds']; onState: (state: BasemapState) => void }) {
  const Mapbox = useMemo(() => loadMapbox(), []);
  const [state, setState] = useState<BasemapState>(Mapbox ? 'loading' : 'unavailable');
  useEffect(() => { onState(state); }, [state, onState]);
  useEffect(() => {
    if (state !== 'loading') return;
    const timer = setTimeout(() => setState('failed'), 12_000);
    return () => clearTimeout(timer);
  }, [state]);
  if (!Mapbox || state === 'failed') return null;
  return <Mapbox.MapView style={StyleSheet.absoluteFill} styleURL={STYLE_URL}
    scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
    compassEnabled={false} scaleBarEnabled={false}
    logoEnabled logoPosition={{ bottom: 8, left: 8 }}
    attributionEnabled attributionPosition={{ bottom: 8, left: 90 }}
    onDidFinishLoadingMap={() => setState('ready')} onMapLoadingError={() => setState('failed')}>
    <Mapbox.Camera defaultSettings={{ bounds, heading: 0, pitch: 0,
      padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 }, animationDuration: 0 }} />
  </Mapbox.MapView>;
}

/** The data stays visible when native maps, their token, or background tiles are unavailable. */
export function RainMap({ data }: { data: RainDetail }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [basemap, setBasemap] = useState<BasemapState>('loading');
  const [attempt, setAttempt] = useState(0);
  const map = useMemo(() => rainfallMap(data, Math.max(width, 280), HEIGHT, ATTRIBUTION_SPACE), [data, width]);
  const id = `rain-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const hasBackground = basemap === 'ready';
  const gaugeLabelX = Math.max(32, Math.min(Math.max(width, 280) - 32, map.gauge.x));
  const gaugeLabelY = Math.min(HEIGHT - ATTRIBUTION_SPACE - 8, map.gauge.y + 19);
  return <View style={styles.container}>
    <View style={[styles.map, { backgroundColor: colors.bg, borderColor: colors.border }]}
      onLayout={event => {
        const next = Math.round(event.nativeEvent.layout.width) - 2;
        if (next > 0 && next !== width) { setWidth(next); setBasemap('loading'); }
      }}>
      {width > 0 ? <Basemap key={`${width}-${attempt}`} bounds={map.bounds} onState={setBasemap} /> : null}
      {/* Leave native branding and the tappable attribution completely uncovered. */}
      {hasBackground ? <View pointerEvents="none" style={[styles.mute, { backgroundColor: colors.card, opacity: 0.24 }]} /> : null}
      <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible
        accessibilityLabel={`Land draining to ${data.basin.name}. ${data.shading ? 'Rain estimates for the past 24 hours. Striped areas have no estimate.' : 'Rain estimates are unavailable.'}${map.riverName ? ` River: ${map.riverName}.` : ''}`}>
        <Svg viewBox={`0 0 ${Math.max(width, 280)} ${HEIGHT}`} width="100%" height={HEIGHT} accessible={false}>
          <Defs>
            <ClipPath id={`${id}-basin`}><Path d={map.path} fillRule="evenodd" clipRule="evenodd" /></ClipPath>
            <Pattern id={`${id}-missing`} width={7} height={7} patternUnits="userSpaceOnUse">
              <Rect width={7} height={7} fill={colors.cardRaised} />
              <Path d="M-1,1L1,-1M0,7L7,0M6,8L8,6" stroke={colors.textSubtle} strokeWidth={1} />
            </Pattern>
            <Mask id={`${id}-gaps`} maskType="luminance" maskUnits="userSpaceOnUse" x={0} y={0} width={Math.max(width, 280)} height={HEIGHT}>
              <Path d={map.path} fill="white" fillRule="evenodd" />
              <Path d={map.shading.join('')} fill="black" />
            </Mask>
          </Defs>
          <Path d={map.path} fill={colors.cardRaised} fillOpacity={hasBackground ? 0.2 : 1} fillRule="evenodd" />
          <G clipPath={`url(#${id}-basin)`}>
            {map.shading.map((d, i) => i > 0 && d ? <Path key={i} d={d} fill={colors.rainHeavy} fillOpacity={0.15 + i * 0.16} /> : null)}
            <Path d={map.path} fill={`url(#${id}-missing)`} fillRule="evenodd" mask={`url(#${id}-gaps)`} />
          </G>
          <Path d={map.path} fill="none" stroke={colors.interactive} strokeWidth={1.7} />
          {map.river ? <G clipPath={`url(#${id}-basin)`}>
            <Path d={map.river} fill="none" stroke={colors.card} strokeWidth={4} />
            <Path d={map.river} fill="none" stroke={colors.interactive} strokeWidth={2} />
          </G> : null}
          <SvgText x={gaugeLabelX} y={gaugeLabelY} textAnchor="middle" fontSize={12} fontWeight="600" fill={colors.card} stroke={colors.card} strokeWidth={4} strokeLinejoin="round">Gauge</SvgText>
          <SvgText x={gaugeLabelX} y={gaugeLabelY} textAnchor="middle" fontSize={12} fontWeight="600" fill={colors.text}>Gauge</SvgText>
          <Circle cx={map.gauge.x} cy={map.gauge.y} r={5} fill={colors.accent} stroke={colors.card} strokeWidth={2} />
        </Svg>
      </View>
      {!hasBackground ? <View pointerEvents="none" style={styles.backgroundStatus}>
        <Text style={[styles.caption, { color: colors.textMuted }]}>{basemap === 'loading' ? 'Loading map background' : 'Area outline'}</Text>
      </View> : null}
    </View>
    {basemap === 'failed' ? <Pressable accessibilityRole="button" onPress={() => { setBasemap('loading'); setAttempt(value => value + 1); }} style={styles.retry}>
      <Text style={[styles.caption, { color: colors.textMuted }]}>Map background unavailable</Text>
      <Text style={[styles.retryLabel, { color: colors.interactive }]}>Retry</Text>
    </Pressable> : null}
    {basemap === 'unavailable' ? <Text style={[styles.caption, { color: colors.textMuted }]}>Map background unavailable</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 2 }, map: { height: HEIGHT + 2, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  mute: { position: 'absolute', top: 0, left: 0, right: 0, bottom: ATTRIBUTION_SPACE },
  backgroundStatus: { position: 'absolute', top: 10, left: 12 }, caption: { ...t.xs },
  retry: { minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  retryLabel: { ...t.xs, fontFamily: fonts.semibold },
});
