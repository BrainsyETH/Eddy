import { Placeholder } from '@/components/Placeholder';

export default function FavoritesScreen() {
  return (
    <Placeholder
      title="Favorites"
      blurb="Starred rivers and saved floats. Stars work offline first and sync once you sign in."
      waitingOn="local-first store + /api/me/starred-rivers sync"
    />
  );
}
