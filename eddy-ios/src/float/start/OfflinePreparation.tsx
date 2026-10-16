import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { readOfflineBadges } from '../tripDownloads';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, TextButton, styles } from './ui';

/** Readiness only displays an existing matching download; preparation lives in the planner. */
export function OfflinePreparation({ tripKey, onBuild, disabled }: {
  tripKey?: string; onBuild: () => void; disabled: boolean;
}) {
  const { colors } = useTheme();
  const [readyKey, setReadyKey] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let current = true;
    if (tripKey) void readOfflineBadges([tripKey]).then(badges => {
      if (current) setReadyKey(badges.get(tripKey) === 'Ready offline' ? tripKey : null);
    }).catch(() => { if (current) setReadyKey(null); });
    return () => { current = false; };
  }, [tripKey]));
  const ready = tripKey != null && readyKey === tripKey;
  return <Card>
    <Text style={[styles.label, { color: colors.text }]}>{ready ? 'Offline map ready' : 'Offline map · Optional'}</Text>
    {!ready ? <>
      <Text style={[styles.body, { color: colors.textMuted }]}>For an offline map, build a route and download it before you go.</Text>
      <TextButton label="Build a Route" disabled={disabled} onPress={onBuild} />
    </> : null}
  </Card>;
}
