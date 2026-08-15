import { useCallback, useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// Imported per WEIGHT, not from the package root. Each @expo-google-fonts
// package's index re-exports every weight it ships, and Metro bundles whatever
// is reachable — importing the root pulled all 40-odd faces across the three
// families and put ~8 MB of TTFs in the export for the eight we actually use.
import { useFonts } from 'expo-font';
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Fredoka_700Bold } from '@expo-google-fonts/fredoka/700Bold';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';
import { AppConfigProvider } from '@/hooks/useAppConfig';
import { SessionProvider } from '@/hooks/useSession';
import { StarredRiversProvider } from '@/hooks/useStarredRivers';
import { SavedFloatsProvider } from '@/hooks/useSavedFloats';
import { AlertRulesProvider } from '@/hooks/useAlertRules';
import { PushProvider } from '@/hooks/usePush';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { UpgradeGate } from '@/components/UpgradeGate';

// Hold the native splash until the fonts are ready. Without this the app renders
// a frame in the system font and then reflows when Geist arrives — a visible
// pop on every cold start, and worse on the screens where a heading changes
// width. Failures are swallowed: a splash that will not hide is a bricked app,
// so nothing here may throw.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Remote config loads once here and wraps everything, so the version gate and
// feature flags have a single home. Both fail open — see useAppConfig.
//
// Stars sit INSIDE the upgrade gate deliberately: if a build is too old to run,
// it should not be writing to the local store that a future version will sync.
//
// SessionProvider wraps the star store because the store syncs against whatever
// session exists. It is deliberately NOT a gate: it acquires an anonymous
// identity in the background and every failure is non-fatal, so the app is fully
// usable with no session at all.
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });

  // Proceed on error as well as success. A font that fails to decode should cost
  // us the brand typeface, not the whole app — the system font is a perfectly
  // usable fallback and nobody is stuck on a splash screen.
  const ready = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (fontError) console.warn('[fonts] failed to load, falling back to system', fontError);
  }, [fontError]);

  if (!ready) return null;

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AppConfigProvider>
          <UpgradeGate>
            <SessionProvider>
              <StarredRiversProvider>
                {/* Beside the stars, and for the same reason: a share-code
                    history is local, works with no account, and never blocks a
                    render on disk. */}
                <SavedFloatsProvider>
                  {/* Server state, not a local store: an alert exists to make
                      the backend push, so one that lived only on the phone
                      would be one the delivery cron has never heard of. Inside
                      SessionProvider because it has nothing to read without a
                      token, and signing in with Apple changes the answer. */}
                  <AlertRulesProvider>
                    {/* Inside SessionProvider: registration needs a token, and the
                        backend only accepts one from a permanent account. */}
                    <PushProvider>
                      <ThemedShell />
                    </PushProvider>
                  </AlertRulesProvider>
                </SavedFloatsProvider>
              </StarredRiversProvider>
            </SessionProvider>
          </UpgradeGate>
        </AppConfigProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

/**
 * Split out because it needs useTheme, which only resolves BELOW ThemeProvider.
 * It also owns hiding the splash: doing that on this component's first layout
 * means the splash lifts onto a painted, correctly-themed screen rather than a
 * blank one.
 */
function ThemedShell() {
  const { colors, isDark } = useTheme();

  const onLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }} onLayout={onLayout}>
      {/* Follows the scheme rather than being pinned light — on the light theme
          white status-bar text would be invisible against the off-white canvas. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
