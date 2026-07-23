import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { RiverConditionEvent } from '@eddy/types';
import { apiFetch } from '@/lib/api';

export function AlertsScreen() {
  const [events, setEvents] = useState<RiverConditionEvent[]>([]);
  useEffect(() => { void apiFetch<{ events: RiverConditionEvent[] }>('/api/me/alerts', {}, true).then((value) => setEvents(value.events)).catch(() => undefined); }, []);
  return <FlatList data={events} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} ListEmptyComponent={<Text>Condition changes for your favorite rivers will appear here.</Text>} renderItem={({ item }) => <View style={styles.card}><Text style={styles.title}>{item.newConditionCode.replaceAll('_', ' ')}</Text><Text>{new Date(item.detectedAt).toLocaleString()}</Text></View>} />;
}
const styles = StyleSheet.create({ list: { padding: 16, gap: 10 }, card: { backgroundColor: '#fff', padding: 16, borderRadius: 12 }, title: { fontWeight: '700', textTransform: 'capitalize' } });
