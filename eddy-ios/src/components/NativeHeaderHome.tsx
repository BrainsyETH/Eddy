import { Stack, useNavigation, useRouter } from 'expo-router';

/** A cold detail link has no native Back button. Give it an explicit way home. */
export function NativeHeaderHome({ destination = 'map' }: { destination?: 'map' | 'today' }) {
  const navigation = useNavigation();
  const router = useRouter();

  // Leave the real Back button, its history menu, and edge-swipe to UIKit.
  if (navigation.canGoBack()) return null;

  return (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button icon="house" accessibilityLabel={destination === 'today' ? 'Go to Today' : 'Go to Map'} onPress={() => router.replace(destination === 'today' ? '/reports' : '/')}>
        {destination === 'today' ? 'Today' : 'Map'}
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}
