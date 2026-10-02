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

import { FloatingControlSurface } from '@/components/FloatingControlSurface';
import { memo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** Rendered inside the field, right of the clear button. Used for a spinner. */
  trailing?: React.ReactNode;
  onFocus?: () => void;
  /** Fires when the field gives up focus so its screen can leave search mode. */
  onBlur?: () => void;
  autoFocus?: boolean;
  floating?: boolean;
}

function SearchBarComponent({
  value,
  onChangeText,
  placeholder,
  trailing,
  onFocus,
  onBlur,
  autoFocus = false,
  floating = false,
}: Props) {
  const { colors } = useTheme();
  const Surface = floating ? FloatingControlSurface : View;

  return (
    <Surface style={[styles.field, floating ? { borderWidth: 0 } : { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ControlIcon name="search" size={17} color={colors.textSubtle} />
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
        <Pressable
          onPress={() => onChangeText('')}
          style={styles.clear}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <ControlIcon name="close-circle" size={18} color={colors.textSubtle} />
        </Pressable>
      ) : null}
    </Surface>
  );
}

export const SearchBar = memo(SearchBarComponent);

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingLeft: 12,
    paddingRight: 4,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
  },
  // The field grows with Dynamic Type; Clear owns its space inside the border.
  input: { flex: 1, minWidth: 0, ...t.base, fontFamily: fonts.body, paddingVertical: 10, paddingHorizontal: 0 },
  clear: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
