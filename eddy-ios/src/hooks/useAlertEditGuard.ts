import { useRef, type RefObject } from 'react';
import { Alert, Keyboard } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';

/** Includes native swipe dismissal and removal of the parent modal stack. */
export function useAlertEditGuard(dirty: boolean, busy: boolean, busyRef: RefObject<boolean>, message = 'Your unsaved changes will be lost. Any alert status changes are already saved.') {
  const navigation = useNavigation();
  const allowExitRef = useRef(false);
  const confirming = useRef(false);
  usePreventRemove(dirty || busy, ({ data }) => {
    if (busyRef.current) return;
    if (allowExitRef.current || !dirty) { navigation.dispatch(data.action); return; }
    if (confirming.current) return;
    confirming.current = true;
    Keyboard.dismiss();
    Alert.alert('Discard edits?', message, [
      { text: 'Keep editing', style: 'cancel', onPress: () => { confirming.current = false; } },
      { text: 'Discard edits', style: 'destructive', onPress: () => {
        confirming.current = false;
        navigation.dispatch(data.action);
      } },
    ], { cancelable: false });
  });
  return allowExitRef;
}
