import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CampsitePhoto } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** A separate target from booking: opening a photo never opens Safari. */
export function CampsitePhotos({ photos, label }: { photos: CampsitePhoto[]; label: string }) {
  const { colors } = useTheme();
  const [viewport, setViewport] = useState({ width: 1, height: 240 });
  const [index, setIndex] = useState<number | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const thumbnail = photos.find((photo) => !failed.includes(photo.url));
  const selected = index === null ? null : photos[index];
  const fail = (url: string) => setFailed((current) => current.includes(url) ? current : [...current, url]);
  if (!thumbnail && !selected) return null;

  return (
    <>
      {thumbnail ? (
        <Pressable
          style={styles.thumbnail}
          onPress={() => setIndex(photos.indexOf(thumbnail))}
          accessibilityRole="button"
          accessibilityLabel={`View ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} of ${label}`}
        >
          <Image source={{ uri: thumbnail.url, cache: 'force-cache' }} style={styles.thumbnail}
            resizeMode="cover" onError={() => fail(thumbnail.url)} accessible={false} />
        </Pressable>
      ) : null}
      <Modal visible={selected !== null} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setIndex(null)}>
        <SafeAreaView style={[styles.viewer, { backgroundColor: colors.bg }]} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{label}</Text>
            <Pressable onPress={() => setIndex(null)} style={styles.control}
              accessibilityRole="button" accessibilityLabel="Close photos">
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
          {selected ? (
            <>
              {failed.includes(selected.url) ? (
                <View style={styles.unavailable}>
                  <Text style={{ color: colors.textMuted }}>This photo couldn’t load.</Text>
                </View>
              ) : (
                <ScrollView key={selected.url} style={styles.imageArea} contentContainerStyle={styles.imageContent}
                  minimumZoomScale={1} maximumZoomScale={3} centerContent
                  onLayout={(event) => setViewport(event.nativeEvent.layout)}>
                  <Image source={{ uri: selected.url, cache: 'force-cache' }} style={{ width: viewport.width, height: viewport.height }}
                    resizeMode="contain" accessibilityLabel={selected.title || `Photo of ${label}`}
                    onError={() => fail(selected.url)} />
                </ScrollView>
              )}
              <View style={styles.caption}>
                {selected.title ? <Text style={[styles.captionText, { color: colors.text }]}>{selected.title}</Text> : null}
                <Text style={[styles.credit, { color: colors.textMuted }]}>
                  {selected.credit ? `${selected.credit} · ` : ''}Recreation.gov
                </Text>
              </View>
              <View style={styles.navigation}>
                <Pressable style={styles.control} disabled={index === 0} onPress={() => setIndex((index ?? 0) - 1)}
                  accessibilityRole="button" accessibilityLabel="Previous photo" accessibilityState={{ disabled: index === 0 }}>
                  <Ionicons name="chevron-back" size={24} color={index === 0 ? colors.textSubtle : colors.text} />
                </Pressable>
                <Text style={{ color: colors.text }}>{(index ?? 0) + 1} of {photos.length}</Text>
                <Pressable style={styles.control} disabled={index === photos.length - 1}
                  onPress={() => setIndex((index ?? 0) + 1)} accessibilityRole="button" accessibilityLabel="Next photo"
                  accessibilityState={{ disabled: index === photos.length - 1 }}>
                  <Ionicons name="chevron-forward" size={24} color={index === photos.length - 1 ? colors.textSubtle : colors.text} />
                </Pressable>
              </View>
            </>
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumbnail: { width: 68, height: 54, borderRadius: 8, overflow: 'hidden' },
  viewer: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 },
  title: { ...t.lg, fontFamily: fonts.semibold, flex: 1 },
  control: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  imageArea: { flex: 1 },
  imageContent: { flexGrow: 1 },
  unavailable: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  caption: { paddingHorizontal: 20, paddingTop: 12 },
  captionText: { ...t.sm, fontFamily: fonts.body },
  credit: { ...t.xs, fontFamily: fonts.body, marginTop: 4 },
  navigation: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
});
