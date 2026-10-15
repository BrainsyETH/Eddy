import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { FloatRecap } from '@/float/FloatRecap';

/** The recap immediately after tracking stays in the recording presentation. */
export default function RecordingRecapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const root = useNavigation('/');
  const showHistory = () => {
    if (root.canGoBack()) root.goBack();
    router.navigate('/(tabs)/(floats)/float-history');
  };
  return <FloatRecap id={id} showHistory={showHistory} />;
}
