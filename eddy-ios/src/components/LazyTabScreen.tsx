import { useState, type ReactNode } from 'react';
import { useIsFocused } from 'expo-router';

/**
 * NativeTabs in SDK 57 mounts every route eagerly. Match the previous JS tabs:
 * start a screen's effects on its first visit, then keep its state on tab switches
 * and detail pushes. No extra native view that could intercept scroll insets.
 */
export function LazyTabScreen({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  const [visited, setVisited] = useState(focused);
  if (focused && !visited) setVisited(true);
  return focused || visited ? children : null;
}
