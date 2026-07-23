import { useState } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';

export function ProfileScreen() {
  const { loading, isAnonymous, session, signInWithApple } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  return <View style={styles.container}>
    <Text style={styles.title}>{isAnonymous ? 'Guest paddler' : 'Signed in with Apple'}</Text>
    <Text style={styles.detail}>{loading ? 'Loading…' : session?.user.id}</Text>
    {isAnonymous && <Button title={signingIn ? 'Signing in…' : 'Sign in with Apple'} disabled={signingIn} onPress={() => { setSigningIn(true); void signInWithApple().catch((error) => Alert.alert('Could not sign in', error.message)).finally(() => setSigningIn(false)); }} />}
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, padding: 24, gap: 16 }, title: { fontSize: 24, fontWeight: '700' }, detail: { color: '#666', fontSize: 12 } });
