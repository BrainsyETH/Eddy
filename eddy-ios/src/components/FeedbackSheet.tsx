// eddy-ios/src/components/FeedbackSheet.tsx
// "Something here is wrong" — the app's half of the website's report-issue form.
//
// ── Why the app needed one at all ──────────────────────────────────────────
// The feedback table, its API and an admin queue have existed for a long time,
// and the app had no way to reach any of it. That is the wrong way round: the
// people best placed to say a threshold is off are standing in the river with a
// phone, not sitting at a desk with the website open. Every report Eddy has ever
// received about water came from someone who had already got home.
//
// ── No account, deliberately ───────────────────────────────────────────────
// POST /api/feedback is public and rate-limited by IP, so this sheet asks
// nobody to sign in. Making a correction require an account would filter for
// the users who least need to make one. The email field is the route's own
// requirement — it is how a reply gets back — and it is prefilled from the
// session when there IS one, which is the only thing being signed in buys here.
//
// ── The type list is shorter than the website's ────────────────────────────
// `partner` is a website flow (the embed workbench) with no app surface, and
// offering it here would be a menu item leading nowhere. The rest match, and the
// ORDER matches too: gauge recalibration first, because it is the report only
// somebody who was there can file and the one the app exists to collect.

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { FeedbackContext, FeedbackType } from '@eddy/types';
import { ApiError, submitFeedback } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { useSession } from '@/hooks/useSession';

const TYPES: { value: FeedbackType; label: string; hint: string }[] = [
  {
    value: 'gauge_recalibration',
    label: 'The reading looked wrong',
    hint: "The river didn't match what Eddy said",
  },
  { value: 'inaccurate_data', label: 'A detail is wrong', hint: 'A name, mile, phone number' },
  { value: 'missing_access_point', label: 'Missing access point', hint: "One that isn't listed" },
  { value: 'bug_report', label: 'Something is broken', hint: 'The app misbehaved' },
  { value: 'suggestion', label: 'Suggestion', hint: 'An idea for Eddy' },
  { value: 'other', label: 'Something else', hint: '' },
];

/** Same shape the route validates against — checked here to save a round trip. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  visible: boolean;
  onDismiss: () => void;
  /** What this report is about. Lands in the admin queue as its own columns. */
  context: FeedbackContext;
  /** Which type the sheet opens on, when the surface already knows. */
  defaultType?: FeedbackType;
}

export function FeedbackSheet({ visible, onDismiss, context, defaultType = 'other' }: Props) {
  const { colors, floating } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useSession();

  const [type, setType] = useState<FeedbackType>(defaultType);
  /**
   * NULL means "the user has not touched this", not "empty".
   *
   * That distinction is doing real work. The account's email is the sensible
   * prefill, and the session resolves ASYNCHRONOUSLY — a sheet that copied it
   * into state at mount would hold '' forever for anyone whose session settled
   * a moment later. Falling back at RENDER time picks it up whenever it lands,
   * and still lets someone type over it.
   */
  const [typedEmail, setTypedEmail] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Whatever the account has, if there is one. Apple's private relay address
  // counts — it is deliverable, which is the only property this field needs.
  const sessionEmail = session?.user?.email ?? '';
  const email = typedEmail ?? sessionEmail;

  /**
   * Clear on the way OUT rather than on the way in.
   *
   * Resetting when the sheet opens is the obvious version and it has to happen
   * in an effect, which means a synchronous setState in an effect body — the
   * cascading-render pattern the lint rule exists to catch. Every close goes
   * through here (backdrop, hardware back, Done), so doing it in the handler
   * covers the same ground with no effect at all, and reopening still finds a
   * blank form.
   */
  const dismiss = useCallback(() => {
    setType(defaultType);
    setTypedEmail(null);
    setMessage('');
    setError(null);
    setSent(false);
    onDismiss();
  }, [defaultType, onDismiss]);

  const hint = useMemo(() => TYPES.find((x) => x.value === type)?.hint ?? '', [type]);

  async function send() {
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Enter an email we can reply to.');
      return;
    }
    if (!trimmedMessage) {
      setError('Tell us what you saw.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await submitFeedback({
        feedbackType: type,
        userEmail: trimmedEmail,
        message: trimmedMessage,
        context,
      });
      setSent(true);
    } catch (err) {
      // The route writes its refusals for a person — "Email is required",
      // "Message is too long". Show its sentence rather than inventing one.
      setError(err instanceof ApiError ? err.message : 'Could not send that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        onPress={dismiss}
        accessibilityLabel="Close"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.lift}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.sheet,
            floating(),
            { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.grabberRow}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          </View>

          {sent ? (
            // No auto-dismiss. The website's modal closes itself after two
            // seconds, which is fine on a desktop the user is watching; on a
            // phone it can vanish while they are still reading it.
            <View style={styles.done}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              <Text style={[styles.doneTitle, { color: colors.text }]}>Thank you</Text>
              <Text style={[styles.doneBody, { color: colors.textMuted }]}>
                A person reads every one of these. We&apos;ll reply if we need more.
              </Text>
              <Pressable
                onPress={dismiss}
                style={({ pressed }) => [
                  styles.submit,
                  { backgroundColor: pressed ? colors.interactivePressed : colors.interactive },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.submitText, { color: colors.onInteractive }]}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <Text style={[styles.title, { color: colors.text }]}>Report an issue</Text>
              {context.name ? (
                <Text style={[styles.about, { color: colors.textMuted }]} numberOfLines={2}>
                  About {context.name}
                </Text>
              ) : null}

              <View style={styles.chips}>
                {TYPES.map((option) => {
                  const on = option.value === type;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setType(option.value)}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          borderColor: on ? colors.interactive : colors.border,
                          backgroundColor: on ? colors.cardRaised : 'transparent',
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <Text
                        style={[styles.chipText, { color: on ? colors.text : colors.textMuted }]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {hint ? (
                <Text style={[styles.hint, { color: colors.textSubtle }]}>{hint}</Text>
              ) : null}

              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="What did you see?"
                placeholderTextColor={colors.textSubtle}
                multiline
                style={[
                  styles.input,
                  styles.messageInput,
                  { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
                ]}
                accessibilityLabel="Details"
              />

              <TextInput
                value={email}
                onChangeText={setTypedEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textSubtle}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                style={[
                  styles.input,
                  { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
                ]}
                accessibilityLabel="Your email"
              />
              <Text style={[styles.hint, { color: colors.textSubtle }]}>
                So we can reply. Nothing else is sent.
              </Text>

              {error ? (
                <Text style={[styles.error, { color: colors.error }]} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}

              <Pressable
                onPress={() => void send()}
                disabled={busy}
                style={({ pressed }) => [
                  styles.submit,
                  {
                    backgroundColor: pressed ? colors.interactivePressed : colors.interactive,
                    opacity: busy ? 0.6 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                {busy ? (
                  <ActivityIndicator color={colors.onInteractive} />
                ) : (
                  <Text style={[styles.submitText, { color: colors.onInteractive }]}>Send</Text>
                )}
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill },
  lift: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    maxHeight: '92%',
  },
  grabberRow: { alignItems: 'center', paddingTop: 8 },
  grabber: { width: 36, height: 4, borderRadius: 999 },
  form: { paddingTop: 10, paddingBottom: 8, gap: 10 },
  title: { ...t.xl, fontFamily: fonts.display },
  about: { ...t.sm, fontFamily: fonts.body, marginTop: -4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.xs, fontFamily: fonts.medium },
  hint: { ...t.xs, fontFamily: fonts.body },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    ...t.sm,
    fontFamily: fonts.body,
  },
  messageInput: { minHeight: 96, textAlignVertical: 'top' },
  error: { ...t.xs, fontFamily: fonts.medium },
  submit: { alignItems: 'center', paddingVertical: 14, borderRadius: 12, marginTop: 4 },
  submitText: { ...t.base, fontFamily: fonts.heading },
  done: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 8 },
  doneTitle: { ...t.xl, fontFamily: fonts.display },
  doneBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
});
