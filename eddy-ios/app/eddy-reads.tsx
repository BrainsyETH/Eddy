import { useLocalSearchParams } from 'expo-router';
import { TodayScreen } from '@/screens/TodayScreen';
import { readFilterFromParam } from '@/lib/todayNavigation';

export default function EddyReadsScreen() {
  const { filter } = useLocalSearchParams<{ filter?: string | string[] }>();
  return <TodayScreen browseMode="reads" initialReadFilter={readFilterFromParam(filter)} />;
}
