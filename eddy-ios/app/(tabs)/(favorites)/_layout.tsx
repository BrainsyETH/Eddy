import { TabStack } from '@/components/TabStack';

export const unstable_settings = { anchor: 'favorites' };

export default function Layout() {
  return <TabStack root="favorites" title="Favorites" />;
}
