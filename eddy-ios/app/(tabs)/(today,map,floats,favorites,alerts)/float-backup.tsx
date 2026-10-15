import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppleSignInButton } from '@/components/AppleSignInButton';
import { useFloatArchive } from '@/hooks/useFloatArchive';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles, type as t } from '@/theme/typography';

export default function FloatBackupScreen() {
  const archive = useFloatArchive();
  const { colors } = useTheme();
  const [changing, setChanging] = useState(false);
  const guest = archive.owner === 'guest';
  const pending = archive.rows.some((row) => row.dirty);
  const refused = archive.rows.filter((row) => row.backupError);
  const consent = async (enabled: boolean) => {
    setChanging(true);
    try {
      await archive.setConsent(enabled);
    } catch (e) {
      Alert.alert('Sharing change not confirmed', e instanceof Error ? e.message : 'Reconnect and retry.');
    } finally {
      setChanging(false);
    }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={archive.syncing}
            onRefresh={() => void archive.refresh()}
            tintColor={colors.interactive}
          />
        }
      >
        <Text style={[textStyles.pageTitle, { color: colors.text }]}>Backup &amp; sharing</Text>
        {archive.recovered ? (
          <Text accessibilityRole="alert" style={[t.base, { color: colors.textMuted }]}>
            Some local history could not be opened. A recovery copy is kept on this phone. Sign in to reload
            floats that were backed up. Unsynced floats may be missing.
          </Text>
        ) : null}
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[textStyles.cardTitle, { color: colors.text }]}>
            {guest ? 'Keep your floats safe' : 'Account backup'}
          </Text>
          <Text style={[t.base, { color: colors.textMuted }]}>
            {guest
              ? 'Your completed floats and saved routes stay on this phone. Sign in with Apple to back them up and recover them on another device.'
              : archive.syncing
                ? 'Backing up and checking for floats…'
                : archive.error
                  ? 'Backup needs attention. Your local floats are still here.'
                  : refused.length
                    ? `${refused.length} ${refused.length === 1 ? 'float could' : 'floats could'} not be backed up. Your local copies are still here.`
                    : pending
                      ? 'Saved on this phone. Waiting to back up.'
                      : 'Your completed floats and saved routes are backed up.'}
          </Text>
          {guest ? (
            <AppleSignInButton onSignedIn={() => void archive.refresh()} />
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => void archive.refresh()}
              style={styles.button}
            >
              <Text style={[t.base, { color: colors.interactive }]}>Sync now</Text>
            </Pressable>
          )}
          {archive.error ? <Text style={[t.sm, { color: colors.error }]}>{archive.error}</Text> : null}
          {!archive.ready ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void archive.refresh()}
              style={styles.button}
            >
              <Text style={[t.base, { color: colors.interactive }]}>Retry loading history</Text>
            </Pressable>
          ) : null}
          {refused.map((row) => (
            <Text key={row.id} style={[t.sm, { color: colors.error }]}>
              {row.payload?.riverName ?? 'Float'}: {row.backupError}
            </Text>
          ))}
          {refused.length && !guest ? (
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => {
                void archive
                  .retryRejected()
                  .catch(() => Alert.alert('Could not retry backup', 'Please try again.'));
              }}
            >
              <Text style={[t.base, { color: colors.interactive }]}>Retry these floats</Text>
            </Pressable>
          ) : null}
          {archive.retryAt && archive.error ? (
            <Text style={[t.sm, { color: colors.textMuted }]}>
              Backup will retry automatically. You can also tap Sync now.
            </Text>
          ) : null}
        </View>
        {!guest && archive.ready ? (
          <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.row}>
              <Text style={[textStyles.cardTitle, styles.grow, { color: colors.text }]}>
                Help improve float estimates
              </Text>
              <Switch
                accessibilityLabel="Help improve float estimates"
                value={archive.preference.enabled}
                disabled={changing}
                onValueChange={(value) => void consent(value)}
              />
            </View>
            <Text style={[t.base, { color: colors.textMuted }]}>
              Optional. Let Eddy use the summaries of floats you finish while this is on to study trip times.
              These summaries are linked to your account; raw GPS traces stay on your phone.
            </Text>
            {archive.pendingConsentOff ? (
              <Text accessibilityRole="alert" style={[t.sm, { color: colors.error }]}>
                Turning off sharing is waiting to be confirmed. Eddy will retry when connected.
              </Text>
            ) : null}
            <Text style={[t.sm, { color: colors.textMuted }]}>
              Turning this off excludes your floats from future analysis. Your backup stays available. Changes
              require a connection.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 18, paddingBottom: 40 },
  card: { padding: 16, gap: 10, borderWidth: 1, borderRadius: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  button: { paddingVertical: 10, minHeight: 44 },
});
