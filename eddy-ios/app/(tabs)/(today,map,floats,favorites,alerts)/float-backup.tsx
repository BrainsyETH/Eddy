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
  const [failedSharingChoice, setFailedSharingChoice] = useState<boolean | null>(null);
  const [sharingDetails, setSharingDetails] = useState(false);
  const guest = archive.owner === 'guest';
  const pending = archive.rows.some((row) => row.dirty);
  const refused = archive.rows.filter((row) => row.backupError);
  const consent = async (enabled: boolean) => {
    setChanging(true);
    setFailedSharingChoice(null);
    try {
      await archive.setConsent(enabled);
    } catch {
      setFailedSharingChoice(enabled);
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
        <Text style={[t.base, { color: colors.textMuted }]}>
          Keep your saved routes and finished floats in your account.
        </Text>
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
            {!archive.ready
              ? archive.error
                ? 'Your collection could not be opened. Try loading it again.'
                : 'Loading your collection…'
              : guest
                ? 'Your completed floats and saved routes stay on this phone. Sign in with Apple to back them up and recover them on another device.'
                : archive.error
                  ? 'Backup needs attention. Your local floats are still here.'
                  : refused.length
                    ? `${refused.length} ${refused.length === 1 ? 'float could' : 'floats could'} not be backed up. Your local copies are still here.`
                    : archive.syncing
                      ? 'Backing up and checking for floats…'
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
          {!archive.ready && archive.error ? (
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
              Share future trip summaries linked to your account. Your GPS track stays on this phone.
            </Text>
            {failedSharingChoice != null && failedSharingChoice !== archive.preference.enabled && !archive.pendingConsentOff ? (
              <Text accessibilityRole="alert" style={[t.sm, { color: colors.error }]}>{failedSharingChoice
                ? 'Couldn’t turn sharing on. Try again later.'
                : 'Eddy couldn’t turn sharing off. Please try again.'}</Text>
            ) : null}
            {archive.pendingConsentOff ? (
              <Text accessibilityRole="alert" style={[t.sm, { color: colors.error }]}>
                Sharing is off on this phone. Eddy will confirm it with your account when connected.
              </Text>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: sharingDetails }}
              onPress={() => setSharingDetails(value => !value)} style={styles.button}>
              <Text style={[t.sm, { color: colors.interactive }]}>{sharingDetails ? 'Less about sharing' : 'About sharing'}</Text>
            </Pressable>
            {sharingDetails ? <Text style={[t.sm, { color: colors.textMuted }]}>
              Sharing is optional and off by default. Summaries are linked to your account and help improve
              float-time estimates. Turning sharing off excludes your floats from future analysis.
              Your backups stay available. Account changes need a connection.
            </Text> : null}
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
