// eddy-ios/src/float/start/LocationGate.tsx
// The one card that gets location into a usable state: prompt, Settings, or a fix.

import { Text } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import type { StartLocation } from './useStart';
import { Card, PrimaryButton, styles } from './ui';

export function LocationGate({ location, summary = false }: { location: StartLocation; summary?: boolean }) {
  const { colors } = useTheme();
  const copy = {
    checking: ['Checking location', ''],
    request: ['Use your location', 'Eddy uses your location to track your float.'],
    settings: ['Location is off', 'Turn it on to track your float.'],
    precise:
      location.precise === 'ask'
        ? ['Allow precise location', 'Eddy needs your precise location to place you on the river.']
        : ['Turn on Precise Location', 'In Settings, turn on Precise Location for Eddy to track your float.'],
    services: [
      'Location Services are off',
      'Turn on Location Services in iPhone Settings to track your float.',
    ],
    ready: ['Find your location', 'Eddy uses your location to track your float.'],
  }[location.state];
  const settings =
    ['settings', 'services'].includes(location.state) || (location.state === 'precise' && location.precise === 'settings');
  return (
    <Card>
      <ControlIcon name="locate-outline" size={28} color={colors.interactive} />
      <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text }]}>
        {copy[0]}
      </Text>
      {copy[1] ? <Text style={[styles.body, { color: colors.textMuted }]}>{copy[1]}</Text> : null}
      {location.error ? (
        <Text style={[styles.body, { color: colors.textMuted }]}>{location.error}</Text>
      ) : null}
      <PrimaryButton
        label={
          settings
            ? 'Open Settings'
            : location.state === 'precise'
              ? 'Allow precise location'
              : summary
                ? 'Enable location'
                : 'Find me on the river'
        }
        busy={location.busy}
        onPress={() => void location.act()}
      />
    </Card>
  );
}
