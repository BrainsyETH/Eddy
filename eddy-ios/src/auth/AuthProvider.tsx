import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import Purchases from 'react-native-purchases';
import { apiFetch } from '@/lib/api';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { syncLocalFavorites } from '@/storage/favorites';
import { registerForPushNotifications } from '@/notifications/register';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  isAnonymous: boolean;
  signInWithApple(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
let revenueCatUser: string | null = null;

async function configureRevenueCat(userId: string) {
  if (!env.revenueCatIosKey || revenueCatUser === userId) return;
  Purchases.configure({ apiKey: env.revenueCatIosKey, appUserID: userId });
  revenueCatUser = userId;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      let current = (await supabase.auth.getSession()).data.session;
      if (!current) current = (await supabase.auth.signInAnonymously()).data.session;
      if (mounted) { setSession(current); setLoading(false); }
      if (current && !current.user.is_anonymous) {
        await configureRevenueCat(current.user.id);
        await registerForPushNotifications().catch((error) => console.warn('[PushRegistration]', error));
      }
    })();
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next && !next.user.is_anonymous) void configureRevenueCat(next.user.id);
    });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  async function signInWithApple() {
    const anonymousToken = session?.user.is_anonymous ? session.access_token : null;
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) throw new Error('Apple did not return an identity token');
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple', token: credential.identityToken, nonce: rawNonce,
    });
    if (error || !data.session) throw error || new Error('Apple sign-in failed');
    if (credential.fullName?.givenName || credential.fullName?.familyName) {
      const fullName = [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ');
      await supabase.auth.updateUser({ data: { full_name: fullName } });
    }
    if (anonymousToken) {
      await apiFetch('/api/me/merge-anonymous', {
        method: 'POST', body: JSON.stringify({ anonymousAccessToken: anonymousToken }),
      }, true);
    }
    await syncLocalFavorites();
    await configureRevenueCat(data.session.user.id);
    await registerForPushNotifications();
  }

  const value = useMemo(() => ({
    session, loading, isAnonymous: session?.user.is_anonymous ?? true, signInWithApple,
  }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
