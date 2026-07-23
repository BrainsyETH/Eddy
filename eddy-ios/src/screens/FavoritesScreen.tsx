import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { getLocalFavorites } from '@/storage/favorites';

export function FavoritesScreen() {
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => { void getLocalFavorites().then(setFavorites); }, []);
  return <FlatList data={favorites} keyExtractor={(item) => item} contentContainerStyle={styles.list} ListEmptyComponent={<Text>Star a river to keep it close.</Text>} renderItem={({ item }) => <View style={styles.card}><Text>{item.replaceAll('-', ' ')}</Text></View>} />;
}
const styles = StyleSheet.create({ list: { padding: 16, gap: 10 }, card: { backgroundColor: '#fff', padding: 16, borderRadius: 12 } });
