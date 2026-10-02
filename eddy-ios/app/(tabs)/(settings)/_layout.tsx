import { TabStack } from '@/components/TabStack';

export const unstable_settings = { anchor: 'profile' };

export default function Layout() {
  return <TabStack root="profile" title="Settings" />;
}
