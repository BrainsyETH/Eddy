import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiFetch } from '@/lib/api';
import { getLocalFavorites, toggleLocalFavorite } from '@/storage/favorites';

interface RiverListItem { id: string; name: string; slug: string; currentCondition: { label: string; code: string } | null }

export function RiverReportsScreen() {
  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => { void apiFetch<{ rivers: RiverListItem[] }>('/api/rivers').then((value) => setRivers(value.rivers)); void getLocalFavorites().then(setFavorites); }, []);
  if (!rivers) return <View style={styles.center}><ActivityIndicator /></View>;
  return <FlatList data={rivers} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} renderItem={({ item }) => (
    <View style={styles.card}><View><Text style={styles.title}>{item.name}</Text><Text>{item.currentCondition?.label || 'Condition unavailable'}</Text></View>
      <Pressable accessibilityRole="button" onPress={() => void toggleLocalFavorite(item.slug).then(setFavorites)}><Text style={styles.star}>{favorites.includes(item.slug) ? '★' : '☆'}</Text></Pressable>
    </View>
  )} />;
}
const styles = StyleSheet.create({ center: { flex: 1, justifyContent: 'center' }, list: { padding: 16, gap: 12 }, card: { padding: 16, borderRadius: 14, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between' }, title: { fontSize: 18, fontWeight: '700' }, star: { fontSize: 30, color: '#e67700' } });
