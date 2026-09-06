// eddy-ios/src/components/SearchBar.tsx
// One search field, used by the Map and by River Reports.
//
// Shared for the same reason RiverRow is: two screens that search the same data
// should not be able to drift on how searching looks or feels. The Map searches
// the server, Reports filters a list it already holds, and neither difference
// belongs in this component.
//
// The keyboard is deliberately configured rather than left to defaults:
// autoCorrect and autoCapitalize both work against river and place names
// ("Jacks Fork" becomes "Jacks For"), and returnKeyType "search" is what the
// on-screen keyboard should say when the field is a search field.

import { memo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** Rendered inside the field, right of the clear button. Used for a spinner. */
  trailing?: React.ReactNode;
  onFocus?: () => void;
  /**
   * Fires when the field gives up focus. Reports uses it to put the screen back
   * to rest; the Map does not pass one.
   */
  onBlur?: () => void;
  autoFocus?: boolean;
}

function SearchBarComponent({
  value,
  onChangeText,
  placeholder,
  trailing,
  onFocus,
  onBlur,
  autoFocus = false,
}: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name="search" size={17} color={colors.textSubtle} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        style={[styles.input, { color: colors.text }]}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel={placeholder}
      />
      {trailing}
      {value.length > 0 ? (
        // Our own clear button rather than iOS's clearButtonMode, so it sits
        // inside the same padded row as everything else and keeps a 44pt target
        // via hitSlop instead of the system's ~20pt glyph.
        <Pressable
          onPress={() => onChangeText('')}
          // 18pt glyph + 13pt each side = 44pt. It was 12, which is 42.
          hitSlop={13}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
        </Pressable>
      ) : null}
    </View>
  );
}

export const SearchBar = memo(SearchBarComponent);

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    // A FLOOR, not a fixed height: 44 so the field is itself a full target,
    // and free to grow at accessibility text sizes — a fixed 42 clipped a
    // 14pt input at 3.1× scale. The map below reads the field's laid-out
    // height, so growing is safe.
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  // No vertical padding on the input: a TextInput with padding grows the row
  // differently on each platform. The row's own minHeight sets the size.
  input: { flex: 1, ...t.sm, fontFamily: fonts.body, padding: 0 },
});
