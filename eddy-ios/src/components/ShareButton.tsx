// eddy-ios/src/components/ShareButton.tsx
// The share control in a screen's nav row.
//
// One component rather than three copies of the same Pressable, because the
// three screens that carry it — river, gauge, access point — all put it in the
// same place and it should be the same size and the same glyph in each. The
// star beside it is NOT shared in the same way, and deliberately: each screen's
// star is bound to a different entity with different rules about when it may
// appear at all.
//
// `share-outline` rather than `share-social-outline`: the former is the iOS
// system share glyph everyone already reads as "send this somewhere", the
// latter is Android's.

import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { shareLink } from '@/lib/share';

export function ShareButton({
  title,
  path,
  label,
}: {
  /** What the recipient sees above the link. Usually the thing's own name. */
  title: string;
  /**
   * Canonical WEBSITE path — served by the API, never composed from the app's
   * own route. See the header of src/lib/share.ts for why that distinction is
   * load-bearing.
   */
  path: string;
  /** Screen-reader label, e.g. "Share Current River". */
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => void shareLink(title, path)}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="share-outline" size={23} color={colors.textSubtle} />
    </Pressable>
  );
}
