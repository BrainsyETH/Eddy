import { useCallback } from 'react';
import { useNavigation, useRouter } from 'expo-router';

/** Close the entire task, not just the editor's inner push. */
export function useCloseAlertCreation() {
  const root = useNavigation('/');
  const router = useRouter();
  return useCallback(() => {
    if (root.canGoBack()) root.goBack();
    else router.replace('/alerts');
  }, [root, router]);
}
