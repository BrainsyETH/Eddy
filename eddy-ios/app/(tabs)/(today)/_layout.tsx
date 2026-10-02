import { TabStack } from '@/components/TabStack';

export const unstable_settings = { anchor: 'reports' };

export default function Layout() {
  return <TabStack root="reports" title="Today" />;
}
