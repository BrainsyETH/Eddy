import { Stack } from 'expo-router';
import { PlannerMapScreen } from '../(map)/index';

/** Reuse the planner and its map without borrowing the kept-alive Map tab. */
export default function PlanRouteScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <PlannerMapScreen />
    </>
  );
}
