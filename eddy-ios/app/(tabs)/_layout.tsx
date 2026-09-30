import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

// Five tabs: Today, Map, Alerts, Favorites, Settings.
//
// The first tab's route file is still `reports.tsx` — only its labels changed.
// Renaming the file would mean chasing `initialRouteName` below, every
// router.push('/reports'), and any deep link already in the wild, for nothing.
//
// "TODAY", NOT "SEARCH". The tab was named after its mechanism rather than its
// job. Nobody opens Eddy in order to search; they open it to find out what the
// water is doing, and searching is one of the things they do once they are
// here. Search keeps its own magnifying glass; the tab icon names the home screen.
//
// TODAY LAUNCHES, NOT MAP. The app opens on the screen that answers the
// question people came with — "what can I float today?" — rather than on the
// one screen that cannot render at all in Expo Go (Mapbox is a native module;
// see src/map/runtime.ts) and that answers it least directly. Map is still one
// tap away and still second in the bar.
//
// Tab colours come from the hook rather than a constant because the bar has to
// repaint when the system flips scheme — a frozen tabBarStyle would leave a
// teal bar sitting under a light app.

// The file is still app/(tabs)/index.tsx, so expo-router would otherwise make
// Map the initial route by filename. This is what actually moves the landing
// screen; reordering the <Tabs.Screen> children below only moves the icons.
export const unstable_settings = { initialRouteName: 'reports' };

export default function TabsLayout() {
  const { colors } = useTheme();

  if (Platform.OS === 'ios') {
    return (
      <NativeTabs
        tintColor={colors.interactive}
        minimizeBehavior="never"
        // FlatList and the map don't reliably report a native scroll edge.
        // Keep the system material visible without supplying a painted backing,
        // custom blur, label font, or inactive color over the glass.
        disableTransparentOnScrollEdge
      >
        {/* Each primary list opts into automatic insets itself. Disable the
            navigator's first-descendant heuristic so horizontal filters and
            map-sheet scrollers don't accidentally inherit tab-bar padding. */}
        <NativeTabs.Trigger name="reports" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="index" disableAutomaticContentInsets disableScrollToTop>
          <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="alerts" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>Alerts</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'bell', selected: 'bell.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="favorites" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>Favorites</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'star', selected: 'star.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="gearshape" />
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  // Preserve the existing non-iOS navigation. UIKit supplies both Liquid Glass
  // on iOS 26+ and the version-appropriate native tab bar on older iOS releases.
  return (
    <Tabs
      screenOptions={{
        // Content screens own their titles; Map uses floating controls over its
        // full canvas, so the tab navigator must not add another header.
        // `title` below is still used — it names the tab in the bar.
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.chrome, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontFamily: fonts.medium },
        tabBarActiveTintColor: colors.interactive,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favorites',
          tabBarIcon: ({ color, size }) => <Ionicons name="star-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
