import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { createNavigationGate } from '@/lib/navigationGate';

/** Lock synchronously until this screen is visited again, including before a render. */
export function useNavigationAction() {
  const [gate] = useState(createNavigationGate);
  useFocusEffect(
    useCallback(() => {
      gate.reset();
    }, [gate]),
  );
  return gate.run;
}
