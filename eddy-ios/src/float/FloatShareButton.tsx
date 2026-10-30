// eddy-ios/src/float/FloatShareButton.tsx
// Share a saved float as its 9:16 image (docs/float-history-card-plan.md,
// phase 5; ADR 0015, "Float share images"). The image is drawn on the server
// from shared/float-share.ts, which carries no names, times or positions; the
// link that travels with it is the river's web page.

import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { floatImagePath, floatShareState } from '@eddy/conditions/float-share';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { useShareImage } from '@/hooks/useShareImage';
import { floatShareLink, floatShareTitle } from '@/lib/floatHistoryDisplay';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function useFloatShare(trip: CompletedFloat) {
  const { busy, shareImage } = useShareImage();
  const share = () =>
    void shareImage({
      imagePath: floatImagePath(floatShareState(trip)),
      fileName: `eddy-float-${trip.id}`,
      title: floatShareTitle(trip),
      linkPath: (response) => floatShareLink(response.headers.get('X-Eddy-Share-Path')),
      // 422 is the one failure that is the float's places: an access point
      // removed or merged since. A 400 is a share this app built and the server
      // refused, which is a version mismatch, not the float, so it gets the
      // ordinary message rather than one that blames the float.
      failureMessage: (status) =>
        status === 422 ? 'This float can’t be shared as an image. Its river or access points have changed since.' : null,
    });
  return { busy, share };
}

/** The recap's primary action: the teal CTA (ADR 0007). */
export function FloatShareButton({ trip }: { trip: CompletedFloat }) {
  const { colors } = useTheme();
  const { busy, share } = useFloatShare(trip);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? 'Preparing float image' : 'Share float'}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={share}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.accentFill, opacity: pressed ? 0.8 : 1 }]}
    >
      {busy
        ? <ActivityIndicator size="small" color={colors.onAccent} />
        : <ControlIcon name="share-outline" size={20} color={colors.onAccent} />}
      <Text style={[t.base, { fontFamily: fonts.semibold, color: colors.onAccent }]}>{busy ? 'Preparing…' : 'Share float'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 50, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 12 },
});
