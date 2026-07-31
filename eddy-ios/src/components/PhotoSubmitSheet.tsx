// eddy-ios/src/components/PhotoSubmitSheet.tsx
// Adding a photo of what the river actually looks like.
//
// ── Why the phone is the right place for this ──────────────────────────────
// The website has had this form since the gallery shipped, and it asks someone
// to remember a river, find the page, and upload a photo off a camera roll days
// later. The person who can answer "what does 900 cfs look like" is standing on
// the gravel bar holding the thing that took the picture. Every photo Eddy has
// was submitted by somebody who had already gone home.
//
// ── No account ─────────────────────────────────────────────────────────────
// /api/upload and /api/reports are both public and rate-limited by IP. Same
// posture as the feedback sheet: requiring a login here would filter for the
// users least likely to be standing in a river.
//
// ── Nothing here is published ──────────────────────────────────────────────
// The photo goes to a PRIVATE quarantine bucket and the report lands `pending`.
// A moderator verifies it before it is copied anywhere public. The success
// state says so, because "thanks!" followed by the photo never appearing is how
// people conclude the feature is broken.
//
// ── An access point is REQUIRED, and that is a divergence ──────────────────
// The website defaults coordinates to the selected access point and falls back
// to (37.5, -91.5) — the state centroid — if none is chosen. That fallback is
// dead code there (its own comment says the access point is required) and it is
// junk data where it isn't: /api/rivers/[slug]/visuals/pins explicitly filters
// that coordinate back out. Requiring the choice means every photo lands on a
// real place, and it matches how somebody on the water thinks about where they
// are. The route validates the coordinate against a corridor around the river
// regardless, so a wrong answer is refused server-side.

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { Ionicons } from '@expo/vector-icons';
import type * as ImagePicker from 'expo-image-picker';
import type * as ImageManipulator from 'expo-image-manipulator';
import type * as ExpoFileSystem from 'expo-file-system';
import type { MapAccessPoint } from '@eddy/types';
import { ApiError, submitRiverVisual, uploadCommunityPhoto } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { UPLOAD_SAFE_BYTES, uploadPreparation } from '@/lib/uploadPrep';
import { warn } from '@/lib/monitoring';

/**
 * The camera and the image compressor, behind a lazy require.
 *
 * THE TYPES ARE IMPORTED STATICALLY, THE MODULES ARE NOT, and the difference is
 * the whole point: `import type` is erased at compile time, so it costs nothing
 * at runtime, while a value import of a native module RUNS on import and throws
 * if the native side is missing.
 *
 * That throw is not local to this file. This sheet is imported at module scope
 * by app/river/[slug].tsx, and expo-router eagerly requires every route file at
 * startup to build the navigation tree — so a missing ExponentImagePicker
 * happened during app INITIALISATION, before React rendered anything. The
 * symptom was an app that sat on the splash screen forever with nothing to
 * read, which is the worst failure this app has and the hardest to attribute.
 *
 * Two other native modules in this app already do it this way and say why:
 * src/map/runtime.ts for @rnmapbox/maps and src/lib/purchases.ts for
 * react-native-purchases. Both headers make the same argument — a native module
 * that cannot load must cost you ITS feature, never the app.
 *
 * Returns null rather than throwing, so the caller renders an explanation.
 */
function loadImagePicker(): typeof ImagePicker | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-picker');
  } catch {
    return null;
  }
}

function loadImageManipulator(): typeof ImageManipulator | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-manipulator');
  } catch {
    return null;
  }
}

function loadFileSystem(): typeof ExpoFileSystem | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-file-system') as typeof ExpoFileSystem;
  } catch {
    return null;
  }
}

function localFileSize(uri: string): number | null {
  const fileSystem = loadFileSystem();
  if (!fileSystem) return null;
  try {
    const size = new fileSystem.File(uri).size;
    return typeof size === 'number' && Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

/** True when this build can actually take and prepare a photo. */
export function photoCaptureAvailable(): boolean {
  return (
    loadImagePicker() !== null &&
    loadImageManipulator() !== null &&
    loadFileSystem() !== null
  );
}

/**
 * Vercel rejects a request body over 4.5 MB, so anything near it is re-encoded
 * before it leaves the phone. The server downscales again to 2400px and strips
 * metadata — this is about getting the bytes there, not about final quality.
 */
const UPLOAD_MAX_DIMENSION = 2400;

interface Prepared {
  uri: string;
  name: string;
  type: 'image/jpeg' | 'image/png' | 'image/webp';
  /** ISO, from EXIF. Null when the picker gave us none — most screenshots. */
  capturedAt: string | null;
}

/**
 * EXIF `DateTimeOriginal`, as an ISO date.
 *
 * The format is "YYYY:MM:DD HH:MM:SS" — colons in the date part, which no Date
 * parser accepts. Converted rather than passed through, and returned as null on
 * anything unexpected: a wrong capture date files a photo under the wrong day's
 * water, which is worse than filing it under today.
 */
function exifDate(exif: Record<string, unknown> | undefined | null): string | null {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTime ?? exif?.CreateDate;
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const parsed = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  if (Number.isNaN(parsed.getTime())) return null;
  // A camera clock can be wrong, but it cannot be in the future — and a future
  // date would sort the photo ahead of every real one.
  if (parsed.getTime() > Date.now()) return null;
  return parsed.toISOString();
}

/** Re-encode when the file is near the body limit; pass it through otherwise. */
async function prepareUpload(asset: ImagePicker.ImagePickerAsset): Promise<Prepared> {
  const decision = uploadPreparation(asset);
  const capturedAt = exifDate(asset.exif as Record<string, unknown> | undefined);
  if (!decision.reencode) return { uri: asset.uri, capturedAt, ...decision };

  const manipulator = loadImageManipulator();
  if (!manipulator) throw new Error('Image preparation is unavailable');

  for (const [width, compress] of [
    [UPLOAD_MAX_DIMENSION, 0.82],
    [1800, 0.7],
    [1400, 0.62],
    [1200, 0.55],
  ] as const) {
    const result = await manipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width } }],
      { compress, format: manipulator.SaveFormat.JPEG },
    );
    const size = localFileSize(result.uri);

    // UNMEASURABLE IS NOT OVERSIZE. localFileSize returns null when
    // expo-file-system will not load or cannot stat the URI, and the original
    // loop treated that the same as "still too big" — so every rung failed, the
    // throw below fired, and a perfectly small photo was rejected for a reason
    // that had nothing to do with its size. Let the server arbitrate instead:
    // it enforces the same limit and answers 413, which the client renders as
    // "That photo is too large."
    if (size === null) {
      warn('photo', 'could not measure the encoded file; uploading anyway', { width });
      return { uri: result.uri, capturedAt, ...decision };
    }

    if (size <= UPLOAD_SAFE_BYTES) {
      return { uri: result.uri, capturedAt, ...decision };
    }
  }

  throw new Error('Prepared image remains above the upload limit');
}

interface Props {
  visible: boolean;
  onDismiss: () => void;
  riverId: string;
  riverName: string;
  /** Where the photo can be filed. The sheet cannot open without at least one. */
  accessPoints: MapAccessPoint[];
  /** Pre-selected when the sheet is opened from an access-point screen. */
  initialAccessPointId?: string;
  /** Fired after a successful submit, so a caller can refresh. */
  onSubmitted?: () => void;
}

export function PhotoSubmitSheet({
  visible,
  onDismiss,
  riverId,
  riverName,
  accessPoints,
  initialAccessPointId,
  onSubmitted,
}: Props) {
  const { colors } = useTheme();

  const [photo, setPhoto] = useState<Prepared | null>(null);
  const [accessPointId, setAccessPointId] = useState<string | null>(
    initialAccessPointId ?? null,
  );
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Only points with a real coordinate. One without cannot satisfy the route's
  // corridor check, so offering it would be offering a guaranteed failure.
  const placeable = useMemo(
    () => accessPoints.filter((p) => p.coordinates?.lat != null && p.coordinates?.lng != null),
    [accessPoints],
  );

  /** Clear on the way out, in the handler — never in an effect. See FeedbackSheet. */
  const dismiss = useCallback(() => {
    setPhoto(null);
    setAccessPointId(initialAccessPointId ?? null);
    setNote('');
    setName('');
    setError(null);
    setSent(false);
    setBusy(false);
    onDismiss();
  }, [initialAccessPointId, onDismiss]);

  const pick = useCallback(async (source: 'camera' | 'library') => {
    setError(null);

    // Resolved at the tap, not at import — see loadImagePicker. A build without
    // the native module loses photo submission and nothing else.
    const picker = loadImagePicker();
    if (!picker) {
      setError('Photo submission needs a newer version of the app.');
      return;
    }

    try {
      // Permission is requested at the moment of the tap, not on mount — the
      // iOS prompt is one-shot per install and must be spent on an action the
      // user just asked for.
      const perm =
        source === 'camera'
          ? await picker.requestCameraPermissionsAsync()
          : await picker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(
          source === 'camera'
            ? 'Eddy needs camera access to take a photo. You can turn it on in Settings.'
            : 'Eddy needs photo access to pick one. You can turn it on in Settings.',
        );
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        // The capture time is the whole reason this is worth having — it is what
        // lets the server match the photo to the reading at that moment.
        exif: true,
        quality: 0.9,
      };
      const result =
        source === 'camera'
          ? await picker.launchCameraAsync(options)
          : await picker.launchImageLibraryAsync(options);

      // Cancelling is a decision, not a failure.
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setPhoto(await prepareUpload(asset));
    } catch {
      setError('Could not read that photo. Try another one.');
    }
  }, []);

  async function send() {
    if (!photo) {
      setError('Pick a photo first.');
      return;
    }
    const point = placeable.find((p) => p.id === accessPointId);
    if (!point) {
      setError('Choose where this was taken.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const imagePath = await uploadCommunityPhoto({
        uri: photo.uri,
        name: photo.name,
        type: photo.type,
      });

      await submitRiverVisual({
        riverId,
        latitude: point.coordinates.lat,
        longitude: point.coordinates.lng,
        imagePath,
        accessPointId: point.id,
        description: note.trim() || undefined,
        submitterName: name.trim() || undefined,
        capturedAt: photo.capturedAt ?? undefined,
        // The server reads the gauge itself from the capture time. Claiming a
        // reading the phone did not measure would be inventing data.
        readingSource: photo.capturedAt ? 'historical' : 'live',
      });
      setSent(true);
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send that photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={dismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.lift}
      >
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>

          {sent ? (
            <View style={styles.done}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              <Text style={[styles.doneTitle, { color: colors.text }]}>Thank you</Text>
              {/* Says what happens NEXT. Without it, a photo that does not
                  appear in the gallery reads as a failed upload. */}
              <Text style={[styles.doneBody, { color: colors.textMuted }]}>
                A person checks every photo before it goes up, so it will not appear straight
                away. It gets filed under the level the river was at when you took it.
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
              <Text style={[styles.title, { color: colors.text }]}>Add a photo</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Show other floaters what the {riverName} looks like right now.
              </Text>

              {photo ? (
                <View style={styles.previewWrap}>
                  <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />
                  <Pressable
                    onPress={() => setPhoto(null)}
                    style={[styles.previewClear, { backgroundColor: colors.card }]}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                  >
                    <Ionicons name="close" size={16} color={colors.text} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.pickRow}>
                  {/* Camera FIRST. The point of this being on a phone is the
                      photo that has not been taken yet. */}
                  <Pressable
                    onPress={() => void pick('camera')}
                    style={({ pressed }) => [
                      styles.pickButton,
                      { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="camera-outline" size={22} color={colors.interactive} />
                    <Text style={[styles.pickText, { color: colors.text }]}>Take a photo</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void pick('library')}
                    style={({ pressed }) => [
                      styles.pickButton,
                      { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="images-outline" size={22} color={colors.interactive} />
                    <Text style={[styles.pickText, { color: colors.text }]}>Choose one</Text>
                  </Pressable>
                </View>
              )}

              <Text style={[styles.label, { color: colors.text }]}>Where was it taken?</Text>
              <View style={styles.chips}>
                {placeable.map((point) => {
                  const on = point.id === accessPointId;
                  return (
                    <Pressable
                      key={point.id}
                      onPress={() => setAccessPointId(point.id)}
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
                        {point.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Anything worth saying about it? (optional)"
                placeholderTextColor={colors.textSubtle}
                multiline
                style={[
                  styles.input,
                  styles.noteInput,
                  { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
                ]}
                accessibilityLabel="Note"
              />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name, to credit the photo (optional)"
                placeholderTextColor={colors.textSubtle}
                style={[
                  styles.input,
                  { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
                ]}
                accessibilityLabel="Your name"
              />

              {photo?.capturedAt ? (
                <Text style={[styles.hint, { color: colors.textSubtle }]}>
                  Taken {new Date(photo.capturedAt).toLocaleDateString()} — it will be filed under
                  the level the river was at then.
                </Text>
              ) : (
                <Text style={[styles.hint, { color: colors.textSubtle }]}>
                  Filed under today&apos;s level.
                </Text>
              )}

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
                    backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill,
                    opacity: busy ? 0.6 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                {busy ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={[styles.submitText, { color: colors.onAccent }]}>Send photo</Text>
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
  lift: { flex: 1 },
  sheet: { flex: 1, paddingHorizontal: 16 },
  form: { paddingTop: 10, paddingBottom: 8, gap: 10 },
  title: { ...t.xl, fontFamily: fonts.display },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: -4 },
  pickRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  pickButton: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  pickText: { ...t.sm, fontFamily: fonts.medium },
  previewWrap: { marginTop: 4 },
  preview: { width: '100%', height: 190, borderRadius: 14 },
  previewClear: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...t.sm, fontFamily: fonts.semibold, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.xs, fontFamily: fonts.medium },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    ...t.sm,
    fontFamily: fonts.body,
  },
  noteInput: { minHeight: 74, textAlignVertical: 'top' },
  hint: { ...t.xs, fontFamily: fonts.body },
  error: { ...t.xs, fontFamily: fonts.medium },
  submit: { alignItems: 'center', paddingVertical: 14, borderRadius: 12, marginTop: 4 },
  submitText: { ...t.base, fontFamily: fonts.heading },
  done: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 8 },
  doneTitle: { ...t.xl, fontFamily: fonts.display },
  doneBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
});
