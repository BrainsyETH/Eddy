import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

type Mode = 'signIn' | 'signUp';

export default function AccountScreen() {
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email || !password) {
      Alert.alert('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const { error } =
        mode === 'signIn'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (error) {
        Alert.alert(mode === 'signIn' ? 'Sign in failed' : 'Sign up failed', error.message);
      } else if (mode === 'signUp') {
        Alert.alert(
          'Check your email',
          'We sent a confirmation link to finish creating your account.'
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ActivityIndicator style={{ marginTop: Spacing.five }} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (session) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title">Account</ThemedText>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small">Signed in as</ThemedText>
            <ThemedText style={styles.semibold}>{session.user.email}</ThemedText>
          </ThemedView>
          <ThemedText type="small">
            Saved float plans will appear here once plan saving is wired to
            accounts.
          </ThemedText>
          <Pressable
            onPress={signOut}
            disabled={busy}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <ThemedText style={styles.buttonText}>
              {busy ? 'Signing out…' : 'Sign out'}
            </ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">
          {mode === 'signIn' ? 'Sign in' : 'Create account'}
        </ThemedText>
        <ThemedText type="small">
          Save float plans and get them on every device.
        </ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          onPress={submit}
          disabled={busy}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <ThemedText style={styles.buttonText}>
            {busy ? 'Working…' : mode === 'signIn' ? 'Sign in' : 'Sign up'}
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
        >
          <ThemedText type="link">
            {mode === 'signIn'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  semibold: {
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    color: Colors.light.text,
    backgroundColor: '#ffffff',
  },
  button: {
    backgroundColor: '#0E7490',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
