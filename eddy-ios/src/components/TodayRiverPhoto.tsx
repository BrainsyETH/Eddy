import { useState } from 'react';
import { Image } from 'react-native';
/** Editorial scenery from curated floats, never a live-condition photo. */
export function TodayRiverPhoto({ uri, name }: { uri?: string | null; name: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!uri || failed === uri) return null;
  return <Image source={{ uri }} accessibilityLabel={name + ', river scenery'} onError={() => setFailed(uri)}
    style={{ width: '100%', height: 100, borderRadius: 10, marginBottom: 12 }} resizeMode="cover" />;
}

