import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { pickupContact } from './pickupContactStore';
import { normalizePickupContact, type PickupContact as Contact } from '@/lib/pickupContactCore';
import { useTheme } from '@/theme/ThemeProvider';
import { EssentialsButton, essentialsStyles as s } from './essentialsUi';

export function PickupContact({ message, disabled = false }: { message?: string | null; disabled?: boolean }) {
  const { colors } = useTheme();
  const [contact, setContact] = useState<Contact | null>(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Contact>({ name: '', phone: '' });
  const [revision] = useState(() => pickupContact.revision());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const open = async (url: string) => {
    try { await Linking.openURL(url); setError(null); }
    catch { setError('Couldn’t open app'); }
  };
  return <View style={{ gap: 8 }}>
    {!ready ? <Text style={[s.note, { color: colors.textMuted }]}>Loading contact…</Text> : editing ? <>
      <TextInput value={draft.name} onChangeText={name => setDraft(v => ({ ...v, name }))} placeholder="Name" accessibilityLabel="Pickup contact name"
        editable={!busy && !disabled} maxLength={80} style={[styles.input, s.body, { color: colors.text, borderColor: colors.border }]} placeholderTextColor={colors.textMuted} />
      <TextInput value={draft.phone} onChangeText={phone => setDraft(v => ({ ...v, phone }))} placeholder="Phone number" accessibilityLabel="Pickup contact phone number"
        editable={!busy && !disabled} maxLength={30} keyboardType="phone-pad" autoComplete="tel" style={[styles.input, s.body, { color: colors.text, borderColor: colors.border }]} placeholderTextColor={colors.textMuted} />
      <Text style={[s.note, { color: colors.textMuted }]}>Saved on this phone</Text>
      <View style={s.actions}>
        <EssentialsButton label={busy ? 'Saving…' : 'Save'} disabled={busy || disabled} onPress={() => void save()} />
        <EssentialsButton label="Cancel" disabled={busy} onPress={() => { setEditing(false); setError(null); }} />
        {contact ? <EssentialsButton label="Remove" disabled={busy || disabled} onPress={() => void save(true)} /> : null}
      </View>
    </> : <>
      {contact ? <Text style={[s.title, { color: colors.text }]}>{contact.name || contact.phone}</Text> : null}
      <View style={s.actions}>
        {contact && message !== undefined ? <>
          <EssentialsButton label="Call" onPress={() => void open(`tel:${contact.phone}`)} />
          <EssentialsButton label="Message" onPress={() => void open(`sms:${contact.phone}${message ? `&body=${encodeURIComponent(message)}` : ''}`)} />
        </> : null}
        <EssentialsButton label={contact ? 'Edit contact' : 'Add pickup contact'} disabled={!ready || disabled} onPress={() => {
          setDraft(contact ?? { name: '', phone: '' }); setEditing(true); setError(null);
        }} />
      </View>
    </>}
    {error ? <Text accessibilityRole="alert" style={[s.note, { color: colors.error }]}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ input: { minHeight: 56, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12 } });
