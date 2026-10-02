import { TabStack } from '@/components/TabStack';

export const unstable_settings = { anchor: 'alerts' };

export default function Layout() {
  return <TabStack root="alerts" title="Alerts" />;
}
