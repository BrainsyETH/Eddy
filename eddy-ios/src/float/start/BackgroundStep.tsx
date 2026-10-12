// eddy-ios/src/float/start/BackgroundStep.tsx
// The once-per-install explanation of background location, shown at Start.

import { useCallback, useState } from 'react';
import { AppState, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { LocationGate } from './LocationGate';
import type { StartLocation, useStart } from './useStart';
import { PrimaryButton, Shell, TextButton, styles } from './ui';

export function BackgroundStep({
  location,
  start,
}: {
  location: StartLocation;
  start: ReturnType<typeof useStart>;
}) {
  const { colors } = useTheme();
  const [background, setBackground] = useState<Location.PermissionResponse | null>(null);
  useFocusEffect(
    useCallback(() => {
      let current = true;
      const read = () =>
        void Location.getBackgroundPermissionsAsync()
          .then((value) => {
            if (current) setBackground(value);
          })
          .catch(() => {});
      read();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') read();
      });
      return () => {
        current = false;
        subscription.remove();
      };
    }, []),
  );
  const settings = background && background.status !== 'granted' && !background.canAskAgain;
  return (
    <Shell>
      <ControlIcon name="locate-outline" size={32} color={colors.interactive} />
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        Keep tracking when your phone is locked
      </Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Allow background location to keep tracking while your phone is locked.
      </Text>
      {location.state !== 'ready' ? (
        <LocationGate location={location} summary />
      ) : (
        <>
          <PrimaryButton
            label={background?.status === 'granted' ? 'Start float' : settings ? 'Open Settings' : 'Continue'}
            busy={start.busy}
            onPress={() => void start.run('background')}
          />
          <TextButton
            label="Start without background tracking"
            disabled={start.busy}
            onPress={() => void start.run('foreground')}
          />
        </>
      )}
      {start.error ? (
        <Text accessibilityRole="alert" style={[styles.body, { color: colors.error }]}>
          {start.error}
        </Text>
      ) : null}
    </Shell>
  );
}
