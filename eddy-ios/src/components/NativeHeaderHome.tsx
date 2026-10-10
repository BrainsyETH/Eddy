import { Stack, useNavigation, useRouter } from 'expo-router';

/** A cold detail link has no native Back button. Give it an explicit way home. */
export function NativeHeaderHome({ destination = 'map' }: { destination?: 'map' | 'today' }) {
  const navigation = useNavigation();
  const router = useRouter();

  // Leave the real Back button, its history menu, and edge-swipe to UIKit.
  if (navigation.canGoBack()) return null;

  const label = destination === 'today' ? 'Today' : 'Map';
  const path = destination === 'today' ? '/reports' : '/';
  const icon = destination === 'today' ? 'house' : 'map';

  return (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button icon={icon} accessibilityLabel={`Go to ${label}`} onPress={() => router.replace(path)}>
        {label}
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}
