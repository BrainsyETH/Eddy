// eddy-ios/src/components/LayerZoomHint.tsx
// One sentence under a layer row: the layer is on and the camera is the reason
// nothing is drawing.
//
// The gauge filter bar carries this hint for the national tier; Public land
// had nothing, so switching it on from the opening statewide view (z6.2,
// below its z7 floor) showed an honest 0 and looked broken — the exact
// "switched on and drawing nothing" state the layers sheet exists to prevent.
// The one useful thing to say there is what would make the layer work, and it
// belongs where the switch is, styled as the filter bar's own hint: indented on
// the same hairline spine, so it reads as belonging to the row above it.

import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function LayerZoomHint({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.bar, { borderLeftColor: colors.border }]}>
      <Text style={[styles.hint, { color: colors.textSubtle }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // The gauge filter bar's own geometry, so the two kinds of row detail line
  // up when both are on screen.
  bar: {
    marginLeft: 30,
    paddingLeft: 10,
    paddingTop: 4,
    paddingBottom: 10,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  hint: { ...t.xs, fontFamily: fonts.body },
});
