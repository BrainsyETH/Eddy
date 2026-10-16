import { Alert, Pressable, StyleSheet } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';

export function FloatInfoTip({ title, message }: { title: string; message: string }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`About ${title.toLowerCase()}`}
    onPress={() => Alert.alert(title, message, [{ text: 'Got it' }])} style={styles.button}>
    <ControlIcon name="information-circle-outline" size={20} color={colors.textMuted} />
  </Pressable>;
}
const styles = StyleSheet.create({ button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' } });
