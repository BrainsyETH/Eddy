import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { pickupContact } from '@/lib/pickupContactStore';
import { normalizePickupContact, type PickupContact as Contact } from '@/lib/pickupContactCore';
import { useTheme } from '@/theme/ThemeProvider';
import { EssentialsButton, essentialsStyles as s } from './essentialsUi';
import { TextButton } from './start/ui';

/**
 * The person picking you up: one number, kept on the phone, dialled or
 * texted from Float tools.
 *
 * In Float tools (`tools`) it sits inside the take-out card with Call/Text
 * actions and an inline Edit control. Ready to float (`compact`) keeps its
 * own heading and plain text planning actions.
 */
export function PickupContact({ message, disabled = false, compact = false, tools = false }: { message?: string | null; disabled?: boolean; compact?: boolean; tools?: boolean }) {
  const { colors } = useTheme();
  const [contact, setContact] = useState<Contact | null>(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Contact>({ name: '', phone: '' });
  const [revision] = useState(() => pickupContact.revision());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Button = compact ? CompactButton : ToolsButton;
  useEffect(() => {
    let active = true;
    void pickupContact.read().then(value => { if (active) { setContact(value); setReady(true); } }, () => {
      if (active) { setError('Couldn’t load contact'); setReady(true); }
    });
    return () => { active = false; };
  }, []);
  const save = async (remove = false) => {
    if (busy || disabled) return;
    const value = remove ? null : normalizePickupContact(draft);
    if (!remove && !value) { setError('Enter a valid phone number'); return; }
    setBusy(true); setError(null);
    try { await pickupContact.save(value, revision); setContact(value); setEditing(false); }
    catch { setError('Couldn’t save contact'); }
    finally { setBusy(false); }
  };
  const open = async (url: string, app: 'Phone' | 'Messages') => {
    try { await Linking.openURL(url); setError(null); }
    catch { setError(`Couldn’t open ${app} on this device. The number is shown above to dial by hand.`); }
  };
  const edit = () => { setDraft(contact ?? { name: '', phone: '' }); setEditing(true); setError(null); };
  return <View style={{ gap: 8 }}>
    {!ready ? <Text style={[s.note, { color: colors.textMuted }]}>Loading contact…</Text> : editing ? <>
      <TextInput value={draft.name} onChangeText={name => setDraft(v => ({ ...v, name }))} placeholder="Name" accessibilityLabel="Pickup contact name"
        editable={!busy && !disabled} maxLength={80} style={[styles.input, s.body, { color: colors.text, borderColor: colors.border }]} placeholderTextColor={colors.textMuted} />
      <TextInput value={draft.phone} onChangeText={phone => setDraft(v => ({ ...v, phone }))} placeholder="Phone number" accessibilityLabel="Pickup contact phone number"
        editable={!busy && !disabled} maxLength={30} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber"
        style={[styles.input, s.body, { color: colors.text, borderColor: colors.border }]} placeholderTextColor={colors.textMuted} />
      <Text style={[s.note, { color: colors.textMuted }]}>Saved on this phone</Text>
      <View style={compact ? styles.textActions : s.actions}>
        <Button label={busy ? 'Saving…' : 'Save'} disabled={busy || disabled} onPress={() => void save()} />
        <Button label="Cancel" disabled={busy} onPress={() => { setEditing(false); setError(null); }} />
        {contact ? <Button label="Remove" disabled={busy || disabled} onPress={() => void save(true)} /> : null}
      </View>
    </> : <>
      {contact ? <View style={styles.contactRow}>
        <View style={styles.contactCopy}>
          {tools ? <Text style={[s.note, { color: colors.textMuted }]}>Pickup contact</Text> : null}
          <Text selectable style={[s.title, { color: colors.text }]}>{contact.name || contact.phone}</Text>
          {/* The number itself, so it can be checked, or dialled by hand. */}
          {contact.name ? <Text selectable style={[s.note, { color: colors.textMuted }]}>{contact.phone}</Text> : null}
        </View>
        {tools ? <EssentialsButton plain label="Edit" accessibilityLabel="Edit pickup contact" onPress={edit} disabled={!ready || disabled} /> : null}
      </View> : compact ? (
        // What the number is for, said once, before there is one. Float tools
        // shows the Call and Message buttons themselves, so it needs no line.
        <Text style={[s.note, { color: colors.textMuted }]}>One tap to call or text them from the river.</Text>
      ) : null}
      <View style={compact ? styles.textActions : s.actions}>
        {contact && message !== undefined ? <>
          <Button label="Call" onPress={() => void open(`tel:${contact.phone}`, 'Phone')} />
          <Button label={tools ? 'Text' : 'Message'} onPress={() => void open(`sms:${contact.phone}${message ? `&body=${encodeURIComponent(message)}` : ''}`, 'Messages')} />
        </> : null}
        {!(tools && contact) ? <Button label={contact ? 'Edit contact' : tools ? 'Add pickup contact' : 'Add contact'} disabled={!ready || disabled} onPress={edit} /> : null}
      </View>
    </>}
    {error ? <Text accessibilityRole="alert" style={[s.note, { color: colors.error }]}>{error}</Text> : null}
  </View>;
}

function CompactButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <TextButton label={label} onPress={onPress} disabled={disabled} align="left" />;
}

function ToolsButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const call = label === 'Call';
  const text = label === 'Text' || label === 'Message';
  return <EssentialsButton label={label} onPress={onPress} disabled={disabled}
    icon={call ? 'call-outline' : text ? 'chatbubble-outline' : undefined}
    plain={label.startsWith('Add') || label.startsWith('Edit')} grow={call || text} />;
}

const styles = StyleSheet.create({
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  contactCopy: { flex: 1, gap: 2 },
  input: { minHeight: 56, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12 },
  // Text buttons have no border to space them; the gap does it.
  textActions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24 },
});
