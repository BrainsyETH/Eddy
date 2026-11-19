import { StyleSheet, Text, View } from 'react-native';
import { floodStageColor } from '@eddy/conditions/flood-stage';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import type { ReadingFlood } from '@/lib/readingFlood';

export function FloodNotices({ notices }: Pick<ReadingFlood, 'notices'>) {
  const { colors } = useTheme();
  if (!notices.length) return null;
  return <View style={styles.group}>
    {notices.map(({ text, emphasized }) => (
      <Text key={text} style={[styles.notice, { color: emphasized ? floodStageColor() : colors.text }]}>{text}</Text>
    ))}
  </View>;
}

const styles = StyleSheet.create({
  group: { marginTop: 6, gap: 3 },
  notice: { ...t.sm, fontFamily: fonts.semibold },
});
