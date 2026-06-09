import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SavedPlanSummary } from '@eddy/shared/types/api';
import {
  formatDistance,
  formatFloatTime,
} from '@eddy/shared/calculations/floatTime';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

type Mode = 'signIn' | 'signUp';

function SavedPlans() {
  const [plans, setPlans] = useState<SavedPlanSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMyPlans()
      .then(({ plans }) => setPlans(plans))
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Failed to load plans')
      );
  }, []);

  return (
    <View style={styles.plansSection}>
      <ThemedText type="subtitle">My saved plans</ThemedText>
      {error ? (
        <ThemedText type="small">{error}</ThemedText>
      ) : plans === null ? (
        <ActivityIndicator />
      ) : plans.length === 0 ? (
        <ThemedText type="small">
          No saved plans yet. Save a float plan and it will show up here.
        </ThemedText>
      ) : (
        <ScrollView contentContainerStyle={styles.plansList}>
          {plans.map((plan) => (
            <ThemedView
              key={plan.shortCode}
              type="backgroundElement"
              style={styles.card}
            >
              <ThemedText style={styles.semibold}>
                {plan.riverName ?? 'Unknown river'}
              </ThemedText>
              <ThemedText type="small">
                {plan.startName ?? '?'} → {plan.endName ?? '?'}
              </ThemedText>
              <ThemedText type="small">
                {plan.distanceMiles != null
                  ? formatDistance(plan.distanceMiles)
                  : ''}
                {plan.estimatedFloatMinutes != null
                  ? ` · ${formatFloatTime(plan.estimatedFloatMinutes)}`
                  : ''}
              </ThemedText>
            </ThemedView>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

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
          <SavedPlans />
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
  plansSection: {
    flex: 1,
    gap: Spacing.two,
  },
  plansList: {
    gap: Spacing.two,
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
