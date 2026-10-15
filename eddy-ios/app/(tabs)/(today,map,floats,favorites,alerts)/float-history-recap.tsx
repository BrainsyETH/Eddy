import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { FloatRecap } from '@/float/FloatRecap';

/** Browsing a finished float is a normal detail in the originating tab. */
export default function HistoryRecapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const showHistory = () => {
    const state = navigation.getState();
    if (state && state.routes[state.index - 1]?.name === 'floats') navigation.goBack();
    else router.replace({ pathname: '/floats', params: { view: 'history' } });
  };
  return <FloatRecap id={id} showHistory={showHistory} />;
}
