import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

// Five tabs: Today, Map, Alerts, Favorites, Profile.
//
// The first tab's route file is still `reports.tsx` — only its labels changed.
// Renaming the file would mean chasing `initialRouteName` below, every
// router.push('/reports'), and any deep link already in the wild, for nothing.
//
// "TODAY", NOT "SEARCH". The tab was named after its mechanism rather than its
// job. Nobody opens Eddy in order to search; they open it to find out what the
// water is doing, and searching is one of the things they do once they are
// here. The field below the title still says what it accepts, so nothing about
// searching became less discoverable — the icon is still a magnifying glass.
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

  return (
    <Tabs
      screenOptions={{
        // Every screen draws its own large title inside a top-edge SafeAreaView,
        // so the navigator header would be a second "Map"/"Alerts" above it.
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
          tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" size={size} color={color} />,
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
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
