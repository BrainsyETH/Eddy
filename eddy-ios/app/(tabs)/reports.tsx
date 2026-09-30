import { TodayScreen } from '@/screens/TodayScreen';
import { LazyTabScreen } from '@/components/LazyTabScreen';

// Preserve existing /reports links and the Today tab identity.
export default function ReportsScreen() {
  return <LazyTabScreen><TodayScreen /></LazyTabScreen>;
}
