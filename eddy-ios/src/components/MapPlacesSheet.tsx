// eddy-ios/src/components/MapPlacesSheet.tsx
// A list of places on the map, in the same sheet the Layers button opens.
//
// Two jobs, one surface:
//   - "Places in this area": every place the enabled layers draw inside the
//     camera, grouped by layer, nearest the middle of the map first, with a
//     filter. It is also the route to the map for VoiceOver and Switch
//     Control, which cannot aim at a 26pt mark.
//   - "N places here": the members of a numbered stack, which is how the web
//     planner lets you choose between places that sit on top of each other.
//
// ── It is the Layers sheet's sibling, on purpose ────────────────────────────
// Same bottom-anchored card, grabber, display-font title, drag-to-dismiss and
// scrim. Each row's mark sits in the layer's outlined well, in the layer's
// colour, so the list reads as the legend it is. A plain system page of text
// rows was the version this replaces, and it looked like a debug screen.

import { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ControlIcon } from '@/components/ControlIcon';
import { EddySymbol } from '@/components/EddySymbol';
import { SearchBar } from '@/components/SearchBar';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { LAYER_SECTIONS, MAP_LAYERS, SHEET_LAYERS } from '@/map/layers';
import { layerDrawOrder } from '@/map/layerRows';
import type { MapPin } from '@/map/RiverMap';

const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);

/** Below this many places a filter field costs more room than it saves. */
const FILTER_FROM = 7;
/** Points above the list: safe area, grabber, title block and filter field. */
const HEAD_ROOM = 260;

interface Props {
  title: string;
  pins: MapPin[];
  /** The area list groups by layer and offers a filter; a stack does neither. */
  searchable?: boolean;
  /** The middle of the map, for nearest-first order. Null sorts by name. */
  center?: [number, number] | null;
  onSelect: (pin: MapPin) => void;
  onClose: () => void;
}

interface Section {
  key: string;
  title: string | null;
  data: MapPin[];
}

export function MapPlacesSheet({ title, pins, searchable = false, center = null, onSelect, onClose }: Props) {
  const { colors, floating } = useTheme();
  const reducedMotion = useReducedMotion(true);
  const { height: windowHeight } = useWindowDimensions();
  const [query, setQuery] = useState('');
  // The keyboard's height, so the list shrinks to what is left above it. The
  // avoiding view lifts the sheet; without this the list kept 60% of the
  // window and pushed the title and the filter field off the top.
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => setKeyboard(event.endCoordinates.height));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  // HEAD_ROOM covers the status bar, grabber, title block and filter field.
  const listMax = Math.max(140, Math.min(
    windowHeight * (searchable ? 0.6 : 0.45),
    windowHeight - keyboard - HEAD_ROOM,
  ));

  // ── Drag to dismiss, exactly as MapLayersSheet does it ────────────────────
  const translateY = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const sheetHeight = useSharedValue(windowHeight);
  const dismissPan = useMemo(
    () => Gesture.Pan()
      .activeOffsetY(8)
      .failOffsetX([-16, 16])
      .onStart(() => {
        cancelAnimation(translateY);
        dragStart.set(translateY.get());
      })
      .onUpdate((event) => {
        translateY.set(Math.max(0, dragStart.get() + event.translationY));
      })
      .onEnd((event) => {
        const dismiss = event.velocityY > -300 && (
          translateY.get() >= 96 || (translateY.get() >= 24 && event.velocityY >= 700)
        );
        translateY.set(withTiming(dismiss ? sheetHeight.get() : 0, {
          duration: reducedMotion ? 0 : 180,
        }, (finished) => {
          if (finished && dismiss) runOnJS(onClose)();
        }));
      })
      .onFinalize((_event, success) => {
        if (!success) translateY.set(withTiming(0, { duration: reducedMotion ? 0 : 180 }));
      }),
    [translateY, dragStart, sheetHeight, reducedMotion, onClose],
  );
  const sheetMotion = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }));

  const sections = useMemo<Section[]>(() => {
    const needle = query.trim().toLowerCase();
    const matching = pins.filter((pin) => !needle || [pin.name, pin.subtitle, pin.siteId]
      .some((field) => field?.toLowerCase().includes(needle)));
    const distance = (pin: MapPin) => center
      ? Math.hypot((pin.coordinates.lng - center[0]) * Math.cos((center[1] * Math.PI) / 180),
        pin.coordinates.lat - center[1])
      : 0;
    const ordered = [...matching].sort((a, b) =>
      distance(a) - distance(b) || a.name.localeCompare(b.name));
    if (!searchable) return ordered.length ? [{ key: 'all', title: null, data: ordered }] : [];
    // The Layers sheet's order — its rows under their headings, each row's
    // tiers beside it — so the two lists agree about what comes first. The raw
    // catalog order this used put rentals between camping and lodging.
    // Any layer no sheet row switches still lists, last, so the order can never
    // drop a place the map is drawing.
    const keys = layerDrawOrder(SHEET_LAYERS, LAYER_SECTIONS);
    for (const layer of MAP_LAYERS) if (!keys.includes(layer.key)) keys.push(layer.key);
    return keys
      .map((key) => ({
        key,
        title: MAP_LAYERS.find((layer) => layer.key === key)?.label ?? key,
        data: ordered.filter((pin) => pin.layer === key),
      }))
      .filter((section) => section.data.length > 0);
  }, [pins, query, searchable, center]);
  const shown = sections.reduce((sum, section) => sum + section.data.length, 0);

  return (
    <Modal visible transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose}>
      {/* A modal has its own safe area, without the underlying native tab bar. */}
      <SafeAreaProvider>
      {/* Native modals do not inherit the app's gesture-handler root. */}
      <GestureHandlerRootView style={styles.root}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close places"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.anchor}
        pointerEvents="box-none"
      >
      <AnimatedSafeAreaView
        edges={['bottom']}
        onLayout={(event) => { sheetHeight.set(event.nativeEvent.layout.height); }}
        onAccessibilityEscape={onClose}
        style={[styles.sheet, floating(), { backgroundColor: colors.sheet }, sheetMotion]}
      >
        <GestureDetector gesture={dismissPan}>
          <View style={styles.dragHandle}>
            <View style={styles.grabberRow}>
              <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            </View>
            <View style={styles.head}>
              <View style={styles.headText}>
                <View style={styles.titleRow}>
                  <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                    {title}
                  </Text>
                  {searchable ? (
                    <Text style={[styles.titleCount, { color: colors.textSubtle }]}>{shown}</Text>
                  ) : null}
                </View>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {searchable ? 'From the layers you have on' : 'Choose a place'}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" style={styles.done}>
                <Text style={[styles.doneText, { color: colors.interactive }]}>Done</Text>
              </Pressable>
            </View>
          </View>
        </GestureDetector>

        {searchable && pins.length >= FILTER_FROM ? (
          <View style={styles.filter}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Filter by name or site number" />
          </View>
        ) : null}

        <SectionList
          sections={sections}
          keyExtractor={(pin) => pin.id}
          style={{ maxHeight: Math.round(listMax) }}
          contentContainerStyle={styles.rows}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => section.title ? (
            <Text accessibilityRole="header" style={[styles.sectionHead, { color: colors.textMuted }]}>
              {section.title} <Text style={styles.sectionCount}>{section.data.length}</Text>
            </Text>
          ) : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <EddySymbol name="accessPoint" size={34} style={styles.emptyMark} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {query.trim() ? 'No places match' : 'Nothing here yet'}
              </Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                {query.trim()
                  ? `Nothing in this part of the map is called “${query.trim()}”.`
                  : 'None of your layers have places in this part of the map. Move the map, or turn more on in Layers.'}
              </Text>
            </View>
          }
          renderItem={({ item: pin }) => {
            const layer = MAP_LAYERS.find((candidate) => candidate.key === pin.layer);
            const tint = layer?.color(colors) ?? colors.interactive;
            const detail = [searchable ? null : layer?.label, pin.subtitle].filter(Boolean).join(' · ');
            return (
              <Pressable
                onPress={() => onSelect(pin)}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.cardRaised : 'transparent' }]}
                accessibilityRole="button"
                accessibilityLabel={[pin.name, layer?.label, pin.value, pin.codeLabel].filter(Boolean).join(', ')}
              >
                <View style={[styles.iconWell, { backgroundColor: colors.cardRaised, borderColor: tint }]}>
                  <EddySymbol name={layer?.symbol ?? 'accessPoint'} size={18} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{pin.name}</Text>
                  {detail ? (
                    <Text style={[styles.detail, { color: colors.textMuted }]} numberOfLines={1}>{detail}</Text>
                  ) : null}
                </View>
                {pin.value || pin.codeLabel ? (
                  <View style={styles.reading}>
                    {pin.value ? (
                      <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>{pin.value}</Text>
                    ) : null}
                    {pin.codeLabel ? (
                      <View style={styles.codeRow}>
                        {pin.color ? <View style={[styles.codeDot, { backgroundColor: pin.color }]} /> : null}
                        <Text style={[styles.code, { color: colors.textMuted }]} numberOfLines={1}>{pin.codeLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <ControlIcon name="chevron-forward" size={15} color={colors.textSubtle} />
              </Pressable>
            );
          }}
        />
      </AnimatedSafeAreaView>
      </KeyboardAvoidingView>
      </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  dragHandle: { minHeight: 44, marginHorizontal: -16, paddingHorizontal: 16 },
  grabberRow: { alignItems: 'center', paddingTop: 8 },
  grabber: { width: 36, height: 4, borderRadius: 999 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 10, paddingBottom: 8 },
  headText: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { ...t.lg, fontFamily: fonts.display, flexShrink: 1 },
  titleCount: { ...t.sm, fontFamily: fonts.mono },
  subtitle: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  done: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'flex-start', paddingTop: 2 },
  doneText: { ...t.sm, fontFamily: fonts.semibold },
  filter: { paddingBottom: 6 },
  rows: { paddingBottom: 8 },
  // The Layers sheet's section heading, so the two sheets read as one family.
  sectionHead: {
    ...t.xs,
    fontFamily: fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 4,
    paddingTop: 14,
    paddingBottom: 4,
  },
  sectionCount: { fontFamily: fonts.mono, letterSpacing: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  iconWell: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0 },
  name: { ...t.sm, fontFamily: fonts.semibold },
  detail: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  reading: { alignItems: 'flex-end', maxWidth: '38%' },
  value: { ...t.sm, fontFamily: fonts.mono },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  codeDot: { width: 8, height: 8, borderRadius: 999 },
  code: { ...t.xs, fontFamily: fonts.medium },
  empty: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 28, gap: 6 },
  emptyMark: { opacity: 0.8, marginBottom: 4 },
  emptyTitle: { ...t.base, fontFamily: fonts.semibold, textAlign: 'center' },
  emptyBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
});
