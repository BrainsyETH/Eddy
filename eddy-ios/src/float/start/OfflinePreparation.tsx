import { useCallback, useState, type ComponentProps } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { readOfflineBadges } from '../tripDownloads';
import { TripDownloadCard } from '../TripDownloadCard';
import { onForeground } from '@/lib/foreground';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, TextButton, styles } from './ui';

/** New downloads live in the planner; an existing one can be checked or resumed here. */
export function OfflinePreparation({ tripKey, onBuild, disabled, download }: {
  tripKey?: string; onBuild: () => void; disabled: boolean;
  download?: Omit<ComponentProps<typeof TripDownloadCard>, 'tripKey'>;
}) {
  const { colors } = useTheme();
  const [answer, setAnswer] = useState<{ key: string; badge: string | null } | null>(null);
  const [revision, setRevision] = useState(0);
  const [managing, setManaging] = useState(false);
  useFocusEffect(useCallback(() => {
    let ticket = 0;
    let active = true;
    const read = async () => {
      if (!tripKey) return;
      const request = ++ticket;
      let badge: string | null;
      try { badge = (await readOfflineBadges([tripKey])).get(tripKey) ?? null; }
      catch { badge = 'Couldn’t check offline map'; }
      if (active && request === ticket) setAnswer({ key: tripKey, badge });
    };
    void read();
    const off = onForeground(() => void read());
    return () => { active = false; off(); };
    // Check again and Done re-read native completion counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripKey, revision]));
  const checking = tripKey != null && answer?.key !== tripKey;
  const badge = answer?.key === tripKey ? answer?.badge : null;
  const failed = badge === 'Couldn’t check offline map';
  const action = badge === 'Map needs update' ? 'Update download'
    : badge === 'Map partly saved' || badge === 'Download incomplete' ? 'Resume download'
      : badge === 'Route saved' ? 'Download map' : 'Manage download';
  return <Card>
    <Text style={[styles.label, { color: colors.text }]}>
      {checking ? 'Checking offline map…' : badge ?? 'Offline map · Optional'}
    </Text>
    {failed ? <TextButton label="Check again" disabled={disabled} onPress={() => setRevision(n => n + 1)} /> : null}
    {badge && download && tripKey ? <>
      <TextButton label={managing ? 'Done' : action} disabled={disabled} onPress={() => {
        setManaging(value => !value); setRevision(n => n + 1);
      }} />
      {managing ? <View><TripDownloadCard key={tripKey} {...download} tripKey={tripKey} compact /></View> : null}
    </> : !checking ? <TextButton label="Open the float planner" disabled={disabled} onPress={onBuild} /> : null}
  </Card>;
}
