import { useRef } from 'react';
import { Stack, useGlobalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ControlIcon } from '@/components/ControlIcon';
import { Pressable } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { recordingScreenId } from '@/lib/floatNavigation';

/** One presentation above the tabs; dismissing it never stops recording. */
export default function RecordingLayout() {
  const router = useRouter();
  const root = useNavigation('/');
  const params = useGlobalSearchParams<{ coldRecording?: string }>();
  const cold = useRef(params.coldRecording === '1');
  const { colors } = useTheme();
  const close = () => {
    if (root.canGoBack()) {
      root.goBack();
      if (cold.current) router.navigate('/(tabs)/(floats)/float-home');
    } else router.replace('/(tabs)/(floats)/float-home');
  };
  const closeButton = () => <Pressable accessibilityRole="button" accessibilityLabel="Close float view"
    onPress={close} style={{ minWidth: 56, minHeight: 56, justifyContent: 'center', alignItems: 'center' }}>
    <ControlIcon name="close" size={22} color={colors.interactive} />
  </Pressable>;
  return <SafeAreaProvider><Stack screenOptions={{ orientation: 'portrait',
    headerBackButtonDisplayMode: 'generic', contentStyle: { backgroundColor: colors.bg } }}>
    <Stack.Screen name="float-mode" dangerouslySingular={recordingScreenId}
      options={{ title: 'River Mode', headerLeft: closeButton }} />
    <Stack.Screen name="float-options" dangerouslySingular={recordingScreenId} options={{ title: 'Essentials', presentation: 'formSheet',
        sheetAllowedDetents: [0.65, 1], sheetGrabberVisible: true, sheetExpandsWhenScrolledToEdge: true, headerShown: false }} />
    <Stack.Screen name="float-recap" dangerouslySingular={recordingScreenId}
      options={{ title: 'Float recap', headerLeft: closeButton }} />
  </Stack></SafeAreaProvider>;
}
