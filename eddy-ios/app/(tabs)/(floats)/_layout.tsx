import { TabStack } from '@/components/TabStack';

export const unstable_settings = { anchor: 'float-home' };

export default function Layout() {
  return <TabStack root="float-home" title="Floats" />;
}
