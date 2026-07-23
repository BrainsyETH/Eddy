import { useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';
import type { AppConfigResponse } from '@eddy/types';
import { fetchAppConfig } from '@/lib/api';

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number); const right = b.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta) return delta;
  }
  return 0;
}

export function AppConfigGate({ children }: PropsWithChildren) {
  const [config, setConfig] = useState<AppConfigResponse | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void fetchAppConfig().then(setConfig).catch(() => setError(true)); }, []);
  if (!config && !error) return <View style={styles.center}><ActivityIndicator /></View>;
  if (config?.maintenance) return <View style={styles.center}><Text>Eddy is taking a short maintenance break.</Text></View>;
  const version = Application.nativeApplicationVersion || '0.0.0';
  if (config && compareVersions(version, config.minimumSupportedVersion) < 0) {
    return <View style={styles.center}><Text>Please update Eddy to keep using the app.</Text></View>;
  }
  return children;
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 } });
