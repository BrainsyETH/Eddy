// eddy-ios/src/components/PhotoSubmitSheetLazy.tsx
// PhotoSubmitSheet, loaded only when someone actually opens it.
//
// ── The bug this exists to prevent ─────────────────────────────────────────
//
// PhotoSubmitSheet imports expo-image-picker and expo-image-manipulator at
// module scope. Both are NATIVE modules, so a binary built before they were
// added throws `Cannot find native module 'ExponentImagePicker'` the moment the
// module is evaluated — and because the river screen imported the sheet at
// module scope too, that throw happened while [slug].tsx itself was loading.
//
// The whole river screen died. Not the photo button: the screen. On a stale
// binary you could not read hazards, put-ins or the reading, because of a
// feature you had not touched.
//
// A React error boundary cannot help there. Boundaries catch throws during
// RENDER, and this one happens during module evaluation, before any component
// exists. The only fix is to not evaluate the module until it is needed, which
// is what lazy() does — and lazy() moves the failure into render, where a
// boundary CAN catch it.
//
// ── Why a boundary as well as lazy() ──────────────────────────────────────
//
// lazy() alone converts a dead screen into a dead screen at a different moment:
// the import still rejects, and React re-throws that rejection during render.
// The boundary is what turns it into "photos need a newer app" while the river
// stays on screen.
//
// Shaped after ChartBoundary in GaugeChart.tsx — the app's only other class
// component, written for this same class of failure. Its docblock says the fix
// is a rebuild rather than an apology, and this copy follows it: "update the
// app" is the only action a person seeing this can take.

import { Component, Suspense, lazy, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { warn } from '@/lib/monitoring';
import type { MapAccessPoint } from '@eddy/types';

const PhotoSubmitSheet = lazy(() =>
  import('@/components/PhotoSubmitSheet').then((m) => ({ default: m.PhotoSubmitSheet })),
);

interface Props {
  visible: boolean;
  onDismiss: () => void;
  riverId: string;
  riverName: string;
  accessPoints: MapAccessPoint[];
  initialAccessPointId?: string;
  onSubmitted?: () => void;
}

class PhotoBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Said out loud once. "The photo sheet did nothing" reads as a broken
    // button rather than as a binary that predates the feature.
    warn('photo', 'sheet failed to load; native expo-image-picker missing?', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Same modal chrome as the real sheet, so the failure lands where the sheet would. */
function Unavailable({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const { colors, floating } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        onPress={onDismiss}
        accessibilityLabel="Close"
      />
      <View style={[styles.card, floating(), { backgroundColor: colors.card }]}>
        <Text style={[styles.title, { color: colors.text }]}>Photos need a newer app</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Adding a photo needs a newer version of Eddy. Everything else on this screen is up to
          date.
        </Text>
        <Pressable
          onPress={onDismiss}
          style={[styles.action, { borderColor: colors.border }]}
          accessibilityRole="button"
        >
          <Text style={[styles.actionText, { color: colors.textMuted }]}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export function PhotoSubmitSheetLazy(props: Props) {
  // Not merely an optimisation: while this is false the module is never
  // imported, so a stale binary reaches the river screen at all.
  if (!props.visible) return null;

  return (
    <PhotoBoundary fallback={<Unavailable visible={props.visible} onDismiss={props.onDismiss} />}>
      {/* null, not a spinner. The import resolves from the bundle already in
          memory, so any visible loading state would be a flash rather than
          information. */}
      <Suspense fallback={null}>
        <PhotoSubmitSheet {...props} />
      </Suspense>
    </PhotoBoundary>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingBottom: 36,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 10,
  },
  title: { ...t.lg, fontFamily: fonts.display },
  body: { ...t.sm, fontFamily: fonts.body, lineHeight: 20 },
  action: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionText: { ...t.sm, fontFamily: fonts.medium },
});
