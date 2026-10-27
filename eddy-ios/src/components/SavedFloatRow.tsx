// Saved routes remain useful offline; photos are optional and time estimates stay live.
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MenuView } from '@react-native-menu/menu';
import { ControlIcon } from '@/components/ControlIcon';
import { BrandTabIcon } from '@/components/BrandTabIcon';
import { ScenicImage } from '@/components/ScenicImage';
import type { SavedFloat } from '@/hooks/useSavedFloats';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function SavedFloatRow({
  float,
  onOpen,
  onForget,
  elevation,
  offline,
  riverPhotoUrl,
}: {
  float: SavedFloat;
  onOpen: () => void;
  onForget: () => void;
  elevation: object;
  offline?: string | null;
  riverPhotoUrl?: string;
}) {
  const { colors, isDark } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [failedUris, setFailedUris] = useState<string[]>([]);
  const opening = useRef(false);
  useFocusEffect(
    useCallback(() => {
      opening.current = false;
    }, []),
  );
  const photo = [float.photoUrl, riverPhotoUrl].find(
    (url): url is string => !!url && !failedUris.includes(url),
  );
  return (
    <View style={[styles.row, { backgroundColor: colors.card }, elevation]}>
      <Pressable
        onPress={() => {
          if (!opening.current) {
            opening.current = true;
            onOpen();
          }
        }}
        style={({ pressed }) => [
          styles.rowMain,
          fontScale > 1.6 && styles.stacked,
          { opacity: pressed ? 0.6 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${float.putInName} to ${float.takeOutName} on the ${float.riverName}, ${float.distanceLabel}${offline ? `, ${offline}` : ''}`}
      >
        <View
          style={[styles.photo, { backgroundColor: colors.selectionBg }]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <BrandTabIcon name="floats" color={colors.interactive} size={46} />
          {photo ? (
            <ScenicImage
              source={{ uri: photo }}
              imageWidth={256}
              style={StyleSheet.absoluteFill}
              accessible={false}
              onError={() => setFailedUris((uris) => [...uris, photo])}
            />
          ) : null}
        </View>
        <View style={[styles.copy, fontScale > 1.6 && styles.stackedCopy]}>
          <Text style={[styles.river, { color: colors.textMuted }]}>{float.riverName}</Text>
          <Text
            style={[styles.segment, { color: colors.text }]}
            numberOfLines={fontScale > 1.3 ? undefined : 3}
          >
            {float.putInName} → {float.takeOutName}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>{float.distanceLabel}</Text>
          {offline ? (
            <View style={styles.offline}>
              <ControlIcon
                name={offline === 'Ready offline' ? 'cloud-done-outline' : 'cloud-outline'}
                size={13}
                color={colors.interactive}
              />
              <Text style={[styles.meta, { color: colors.textMuted }]}>{offline}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      <MenuView
        themeVariant={isDark ? 'dark' : 'light'}
        shouldOpenOnLongPress={false}
        actions={[
          {
            id: 'remove',
            title: 'Remove from saved floats',
            image: 'trash',
            attributes: { destructive: true },
          },
        ]}
        onPressAction={({ nativeEvent }) => {
          if (nativeEvent.event === 'remove')
            Alert.alert('Remove saved float?', `${float.putInName} → ${float.takeOutName}`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: onForget },
            ]);
        }}
      >
        <View
          style={styles.more}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`More options for ${float.putInName} to ${float.takeOutName}`}
        >
          <ControlIcon name="ellipsis-horizontal" size={20} color={colors.textMuted} />
        </View>
      </MenuView>
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  rowMain: { flex: 1, minWidth: 0, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  photo: {
    width: 76,
    height: 86,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  stackedCopy: { flex: 0, alignSelf: 'stretch' },
  river: { ...t.xs, fontFamily: fonts.medium },
  segment: { ...t.sm, fontFamily: fonts.semibold },
  meta: { ...t.xs, fontFamily: fonts.body },
  more: { width: 44, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
});
