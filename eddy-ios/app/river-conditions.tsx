import { useLocalSearchParams } from 'expo-router';
import { TodayScreen } from '@/screens/TodayScreen';
import { riverFilterFromParam } from '@/lib/todayNavigation';

export default function RiverConditionsScreen() {
  const { filter } = useLocalSearchParams<{ filter?: string | string[] }>();
  return <TodayScreen browseMode="rivers" initialRiverFilter={riverFilterFromParam(filter)} />;
}
