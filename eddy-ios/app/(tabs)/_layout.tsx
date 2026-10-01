import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

// Five tabs: Today, Map, Alerts, Favorites, Settings.
//
// Each tab owns a stack; /reports and the other public URLs remain unchanged.
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

// Today opens by default; each child stack preserves its own history.
export const unstable_settings = { initialRouteName: '(today)' };

export default function TabsLayout() {
  const { colors, nativeColors } = useTheme();

  if (Platform.OS === 'ios') {
    return (
      <NativeTabs
        tintColor={nativeColors.interactive}
        minimizeBehavior="never"
        // FlatList and the map don't reliably report a native scroll edge.
        // Keep the system material visible without supplying a painted backing,
        // custom blur, label font, or inactive color over the glass.
        disableTransparentOnScrollEdge
      >
        {/* Each primary list opts into automatic insets itself. Disable the
            navigator's first-descendant heuristic so horizontal filters and
            map-sheet scrollers don't accidentally inherit tab-bar padding. */}
        <NativeTabs.Trigger name="(today)" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(map)" disableAutomaticContentInsets disableScrollToTop>
          <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(alerts)" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>Alerts</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'bell', selected: 'bell.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(favorites)" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>Favorites</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'star', selected: 'star.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(settings)" disableAutomaticContentInsets>
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
        name="(today)"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <ControlIcon name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="(map)"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => <ControlIcon name="map-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="(alerts)"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => <ControlIcon name="notifications-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="(favorites)"
        options={{
          title: 'Favorites',
          tabBarIcon: ({ color, size }) => <ControlIcon name="star-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="(settings)"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <ControlIcon name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
