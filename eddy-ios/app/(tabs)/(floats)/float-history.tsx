import { Redirect } from 'expo-router';

/** Keep existing recap/history links working with the combined collection. */
export default function FloatHistoryScreen() {
  return <Redirect href={{ pathname: '/floats', params: { view: 'history' } }} />;
}
