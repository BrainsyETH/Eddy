import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

// Five tabs: River Reports, Map, Alerts, Favorites, Profile.
//
// REPORTS LAUNCHES, NOT MAP. The app opens on the screen that answers the
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
        tabBarActiveTintColor: colors.accentActive,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Rivers',
          tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size} color={color} />,
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
