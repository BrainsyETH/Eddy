import { TabStack } from '@/components/TabStack';

export const unstable_settings = { anchor: 'index' };

export default function Layout() {
  return <TabStack root="index" title="Map" />;
}
