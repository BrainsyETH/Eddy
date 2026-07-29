// FIRST IMPORT, AND THE ORDER IS THE WHOLE POINT.
//
// Module bodies run after ALL of their imports have been evaluated, so anything
// this file does at module scope happens after expo-notifications, Sentry and
// Supabase have already been touched by the imports below — several of which do
// native work on import. bootstrap.ts holds the splash, arms the backstop timer
// and initialises Sentry, and being imported first is what makes those three
// survive an import further down the list throwing.
//
// It has no static imports of its own for the same reason. See its header.
import { completeLaunch, isLaunchStalled, subscribeToLaunchStall } from '@/lib/bootstrap';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import { type as t } from '@/theme/typography';
import { darkPalette, lightPalette } from '@/theme/palette';
import { report, warn } from '@/lib/monitoring';
import { sweepStaleVersions } from '@/lib/riverCache';
import { seedOfflineBundle } from '@/api/client';

/**
 * How long the splash may wait on the brand typeface before giving up.
 *
 * Generous — the fonts are bundled in the binary, so a healthy launch resolves
 * far inside this and never sees it. It exists for the unhealthy one.
 */
const FONT_TIMEOUT_MS = 5_000;

// Drop cache entries from a previous CACHE_VERSION. Fire and forget at module
// scope: it touches nothing any screen reads this launch, and a cache sweep
// that could delay a render would be the tail wagging the dog.
void sweepStaleVersions();

// Seed every river's line, put-ins and hazards from one conditional request.
// Also fire-and-forget at module scope, and for a stronger reason than the
// sweep: the launch this runs on is by definition an online one, so nothing on
// screen is waiting for it. The launch it pays off on is the one at the put-in
// with no bars, where it has already finished.
void seedOfflineBundle();

/**
 * The last net. Expo Router renders this instead of the tree when a render
 * throws anywhere below it.
 *
 * Until now the only boundary in the app was GaugeChart's ChartBoundary, so a
 * throw anywhere else unmounted to a blank screen with no way back — the worst
 * possible outcome on a phone at a put-in, and invisible to us besides.
 *
 * ── It reads the palette directly, and that is the point ────────────────────
 * Expo Router mounts this ABOVE RootLayout, so ThemeProvider does not exist
 * here — and must not, because a provider throwing on mount is one of the
 * things this catches. useColorScheme comes from React Native itself and cannot
 * fail for the same reason the tree did. Same instinct as the splash-screen
 * calls above: nothing on this path may throw.
 *
 * It also cannot use the brand typeface: a font that failed to decode is
 * another reason to be here. System font, deliberately.
 *
 * WHAT IT DOES NOT CATCH: async rejections, event handlers and native crashes.
 * Those reach Sentry's own global handlers, which is the other half of the
 * coverage and why initMonitoring() runs above.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkPalette : lightPalette;

  useEffect(() => {
    report(error, { boundary: 'root' });
  }, [error]);

  return (
    <View style={[boundaryStyles.screen, { backgroundColor: colors.bg }]}>
      <Text style={[boundaryStyles.title, { color: colors.text }]}>Eddy hit a snag</Text>
      {/* No stack, no error message. Neither is actionable by the person
          holding the phone, and the message can carry anything the throw was
          near — Sentry already has the detail, redacted. */}
      <Text style={[boundaryStyles.body, { color: colors.textMuted }]}>
        Something on this screen stopped working. Nothing you saved is affected.
      </Text>
      <Pressable
        onPress={() => void retry()}
        accessibilityRole="button"
        style={({ pressed }) => [boundaryStyles.retry, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[boundaryStyles.retryText, { color: colors.interactive }]}>Try again</Text>
      </Pressable>
    </View>
  );
}


/**
 * What the splash lifts onto when the launch never completed.
 *
 * No "Try again": there is nothing to retry. React is alive — this is
 * rendering — but the app never reached the point of painting, and the only
 * action that resolves that is relaunching. Saying so is more useful than a
 * button that re-runs the thing that already did not work.
 *
 * By the time this is on screen bootstrap.ts has already filed the report, so
 * the text does not ask anyone to send anything.
 */
function LaunchStalled() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkPalette : lightPalette;

  return (
    <View style={[boundaryStyles.screen, { backgroundColor: colors.bg }]}>
      <Text style={[boundaryStyles.title, { color: colors.text }]}>Eddy didn&apos;t finish starting</Text>
      <Text style={[boundaryStyles.body, { color: colors.textMuted }]}>
        Force-quit the app and open it again. Nothing you saved is affected.
      </Text>
    </View>
  );
}

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

  /**
   * A floor under the font wait, because `ready` gates the ENTIRE app.
   *
   * useFonts settles as loaded or errored, and the line below proceeds on
   * either — but "or neither" is a third outcome nothing was handling. If it
   * never settles, `ready` stays false, this component returns null forever,
   * ThemedShell never mounts, and ThemedShell is what calls hideAsync. The app
   * sits on the splash screen with no way out.
   *
   * That is a hang caused by a decorative asset, which is the wrong trade in
   * every direction. The comment below already argues the system font is a
   * perfectly usable fallback; this makes that true when the answer never
   * arrives, not only when it arrives as an error.
   */
  const [fontWaitElapsed, setFontWaitElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontWaitElapsed(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  // Proceed on error as well as success. A font that fails to decode should cost
  // us the brand typeface, not the whole app — the system font is a perfectly
  // usable fallback and nobody is stuck on a splash screen.
  const ready = fontsLoaded || Boolean(fontError) || fontWaitElapsed;

  useEffect(() => {
    if (fontError) warn('fonts', 'failed to load, falling back to system', fontError);
  }, [fontError]);

  useEffect(() => {
    if (fontWaitElapsed && !fontsLoaded && !fontError) {
      // Worth reporting: the fonts are bundled locally, so this should be
      // instant. Taking the timeout means something is wrong with asset
      // loading, and without this the only symptom is an app that looks slow.
      warn('fonts', 'still not settled after the timeout; using the system font');
    }
  }, [fontWaitElapsed, fontsLoaded, fontError]);

  /**
   * The other half of the backstop.
   *
   * bootstrap.ts lifting the splash is necessary and not sufficient: if `ready`
   * is still false when it fires, this component is returning null, so the
   * splash lifts onto a BLANK SCREEN. That is a different bricked app, not a
   * fixed one — and it is worse to look at than the splash, because a launch
   * image at least looks like something is happening.
   *
   * So the stall gets a screen. It is deliberately the same shape as
   * ErrorBoundary below and for the same reasons: palette read directly (no
   * ThemeProvider up here), system font (a font that never settled is one of
   * the ways to arrive here), and nothing on the path that can throw.
   */
  const [stalled, setStalled] = useState(isLaunchStalled);
  useEffect(() => subscribeToLaunchStall(() => setStalled(true)), []);

  if (!ready) return stalled ? <LaunchStalled /> : null;

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

  // Hides the splash AND disarms the backstop — see src/lib/bootstrap.ts. The
  // two have to happen together: a backstop left armed after a healthy launch
  // would file a stall report eight seconds into a working app.
  const onLayout = useCallback(() => {
    completeLaunch();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} onLayout={onLayout}>
      {/* Follows the scheme rather than being pinned light — on the light theme
          white status-bar text would be invisible against the off-white canvas. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}

const boundaryStyles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { ...t.xl, fontWeight: '700', textAlign: 'center' },
  body: { ...t.sm, textAlign: 'center', marginTop: 10 },
  retry: { marginTop: 24, paddingVertical: 8, paddingHorizontal: 12 },
  retryText: { ...t.base, fontWeight: '600' },
});
