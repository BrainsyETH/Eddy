import 'react-native-url-polyfill/auto';
import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Sentry from '@sentry/react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthProvider';
import { AppConfigGate } from './src/components/AppConfigGate';
import { AlertsScreen } from './src/screens/AlertsScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { MapScreen } from './src/screens/MapScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { RiverReportsScreen } from './src/screens/RiverReportsScreen';
import { posthog } from './src/telemetry/posthog';

Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN, enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN });

const Tabs = createBottomTabNavigator();

function App() {
  useEffect(() => { posthog?.capture('app_opened'); }, []);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppConfigGate>
          <NavigationContainer>
            <StatusBar style="auto" />
            <Tabs.Navigator screenOptions={{ headerShown: true, tabBarActiveTintColor: '#087f5b' }}>
              <Tabs.Screen name="Map" component={MapScreen} />
              <Tabs.Screen name="River Reports" component={RiverReportsScreen} />
              <Tabs.Screen name="Alerts" component={AlertsScreen} />
              <Tabs.Screen name="Favorites" component={FavoritesScreen} />
              <Tabs.Screen name="Profile" component={ProfileScreen} />
            </Tabs.Navigator>
          </NavigationContainer>
        </AppConfigGate>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
