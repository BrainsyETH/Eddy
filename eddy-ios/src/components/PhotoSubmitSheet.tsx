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
//
// It is a DROPDOWN rather than a chip row. Chips are the right control for a
// short, fixed set of alternatives — the feedback sheet's six types — and the
// wrong one here: the Current River has thirty-odd access points, which as
// chips is a wall of pills between the photo and the Send button, with the
// chosen one somewhere in the middle of it. A closed row that names the
// selection is one line; the list opens over the form when it is wanted.
//
// ── The photo does NOT read the phone's location ────────────────────────────
// Only its EXIF capture TIME (`exif: true` below), which is what lets the
// server file it against the reading the river was at. No coordinate is taken
// from the image or from Core Location, and none is asked for: the position
// that is sent is the access point the user picks from the list. That is the
// honest answer to "where was this taken" — a phone's fix is where the phone is
// NOW, which on a photo chosen from the camera roll is a different county.
//
// ── Overriding the reading ─────────────────────────────────────────────────
// The server derives the level from the capture time by default. Somebody who
// was standing at the staff gauge can say what they actually read instead —
// see the manual-reading section below and `readingSource: 'manual'`, which
// exists on the route for exactly this and had no client sending it.

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

/**
 * Every photo is re-drawn before upload; the only question is whether it must
 * also shrink.
 *
 * ── Why there is no pass-through any more ─────────────────────────────────
 * The original bytes of a camera-roll photo carry the camera's own EXIF —
 * including a GPS tag, on most phones. The location permission copy promises
 * "It is never sent to our servers", and the server does strip metadata
 * before storage — but a pass-through sent the tag across the wire anyway,
 * which is not what "never sent" means. A no-resize re-draw at the original
 * dimensions drops every metadata block (capturedAt is read out first, above)
 * for the price of one encode; only a file that is over the limit — or grows
 * past it at this quality — takes the shrinking ladder below.
 */
async function prepareUpload(asset: ImagePicker.ImagePickerAsset): Promise<Prepared> {
  const decision = uploadPreparation(asset);
  const capturedAt = exifDate(asset.exif as Record<string, unknown> | undefined);

  const manipulator = loadImageManipulator();
  if (!manipulator) throw new Error('Image preparation is unavailable');

  if (!decision.reencode) {
    // Small and already a supported format: strip at full size. PNG stays
    // PNG (screenshots, and lossless); everything else lands on JPEG — the
    // server re-encodes to webp regardless, so the format here only has to
    // be one the route accepts.
    const png = decision.type === 'image/png';
    const stripped = await manipulator.manipulateAsync(asset.uri, [], {
      compress: 0.9,
      format: png ? manipulator.SaveFormat.PNG : manipulator.SaveFormat.JPEG,
    });
    const size = localFileSize(stripped.uri);
    // Unmeasurable is not oversize — the ladder's own rule.
    if (size === null || size <= UPLOAD_SAFE_BYTES) {
      return {
        uri: stripped.uri,
        capturedAt,
        name: png ? 'river-photo.png' : 'river-photo.jpg',
        type: png ? 'image/png' : 'image/jpeg',
      };
    }
    // Grew past the limit at this quality — fall through and let the ladder
    // shrink it like any other oversize photo.
  }

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
      // Explicit, not `...decision`: the ladder always writes JPEG, and on a
      // fall-through from the strip above the decision could still name png.
      return { uri: result.uri, capturedAt, name: 'river-photo.jpg', type: 'image/jpeg' };
    }

    if (size <= UPLOAD_SAFE_BYTES) {
      return { uri: result.uri, capturedAt, name: 'river-photo.jpg', type: 'image/jpeg' };
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
  const [placeOpen, setPlaceOpen] = useState(false);
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  /**
   * The reading the submitter says they saw, when they want to override.
   *
   * Held as the typed STRING, not a number: "3." is a state a text field passes
   * through on the way to "3.5", and parsing on every keystroke would fight the
   * keyboard. Parsed once, at send.
   */
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideValue, setOverrideValue] = useState('');
  const [overrideUnit, setOverrideUnit] = useState<'ft' | 'cfs'>('ft');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Only points with a real coordinate. One without cannot satisfy the route's
  // corridor check, so offering it would be offering a guaranteed failure.
  const placeable = useMemo(
    () => accessPoints.filter((p) => p.coordinates?.lat != null && p.coordinates?.lng != null),
    [accessPoints],
  );

  /** The chosen point, or null. Read by the trigger, the summary and send(). */
  const selectedPoint = useMemo(
    () => placeable.find((p) => p.id === accessPointId) ?? null,
    [placeable, accessPointId],
  );

  /**
   * The filed-level line, when the submitter has overridden it.
   *
   * Null while the override is closed or empty, which is what lets the two
   * derived cases below keep their own wording — "filed under today's level"
   * and "filed under the level it was at then" are different claims and neither
   * survives being merged with this one.
   */
  const manualLine = useMemo(() => {
    const trimmed = overrideValue.trim();
    if (!overrideOpen || !trimmed) return null;
    return `Filed at ${trimmed} ${overrideUnit}, as you read it — not the gauge's own number.`;
  }, [overrideOpen, overrideValue, overrideUnit]);

  /** Clear on the way out, in the handler — never in an effect. See FeedbackSheet. */
  const dismiss = useCallback(() => {
    setPhoto(null);
    setAccessPointId(initialAccessPointId ?? null);
    setPlaceOpen(false);
    setNote('');
    setName('');
    setOverrideOpen(false);
    setOverrideValue('');
    setOverrideUnit('ft');
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
    const point = selectedPoint;
    if (!point) {
      setError('Choose where this was taken.');
      return;
    }
    const description = note.trim();
    // ── SAID HERE, BECAUSE THE SERVER SAYS IT ANYWAY ──────────────────────
    // The field used to be labelled "(optional)" and POST /api/reports refuses
    // every report without a description — so the one instruction on screen was
    // contradicted by the only thing that could act on it, after the upload,
    // several seconds in, in the server's words rather than the form's. The
    // note is genuinely required (a moderator has to know what they are
    // looking at), so the form now asks for it up front and refuses before
    // spending somebody's data on an upload that cannot land.
    if (!description) {
      setError('Say what the photo shows — a moderator needs it to file the photo.');
      return;
    }

    /**
     * The submitter's own reading, when they gave one.
     *
     * Validated to the route's own ranges (-100..100 ft, 0..1,000,000 cfs) so a
     * fat-fingered number is refused HERE rather than after the upload — the
     * same reason the description check moved up. An open-but-empty override is
     * not an error: it is somebody who opened the section and thought better
     * of it.
     */
    let manual: { gaugeHeightFt?: number; dischargeCfs?: number } | null = null;
    if (overrideOpen && overrideValue.trim()) {
      const value = Number(overrideValue.trim());
      const ok =
        Number.isFinite(value) &&
        (overrideUnit === 'ft' ? value >= -100 && value <= 100 : value >= 0 && value <= 1_000_000);
      if (!ok) {
        setError(
          overrideUnit === 'ft'
            ? 'That gauge height does not look right. Feet, e.g. 3.4.'
            : 'That discharge does not look right. Cubic feet per second, e.g. 940.',
        );
        return;
      }
      manual = overrideUnit === 'ft' ? { gaugeHeightFt: value } : { dischargeCfs: value };
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
        description,
        submitterName: name.trim() || undefined,
        capturedAt: photo.capturedAt ?? undefined,
        ...(manual ?? {}),
        // WHERE THE NUMBER CAME FROM, so a moderator can weigh it — and the
        // phone may only speak for itself. 'manual' is a claim this client can
        // actually make: the submitter typed a number they read off a staff
        // gauge, and the server must not overwrite it.
        //
        // Anything else is left to the server, which is the only side that
        // knows. This used to send 'historical' whenever the photo had EXIF,
        // asserting a USGS lookup at capture time that NOTHING performed —
        // /api/reports stored what it was handed and derived nothing, so those
        // rows landed with a provenance label and no reading to attach it to.
        // The lookup now genuinely runs server-side; the label comes from
        // whichever branch of it actually ran.
        ...(manual ? { readingSource: 'manual' as const } : {}),
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

              {/* ── Where, as a dropdown ────────────────────────────────
                  One line closed, naming the choice; the list opens over the
                  form. See the header for why this stopped being chips. */}
              <Text style={[styles.label, { color: colors.text }]}>Where was it taken?</Text>
              <Pressable
                onPress={() => setPlaceOpen(true)}
                style={({ pressed }) => [
                  styles.select,
                  {
                    borderColor: selectedPoint ? colors.interactive : colors.border,
                    backgroundColor: colors.bg,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  selectedPoint
                    ? `Where it was taken: ${selectedPoint.name}. Change it`
                    : 'Choose where this was taken'
                }
              >
                <Ionicons
                  name="location-outline"
                  size={17}
                  color={selectedPoint ? colors.interactive : colors.textSubtle}
                />
                <Text
                  style={[
                    styles.selectText,
                    { color: selectedPoint ? colors.text : colors.textSubtle },
                  ]}
                  numberOfLines={1}
                >
                  {selectedPoint?.name ?? 'Choose an access point'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.textSubtle} />
              </Pressable>
              {/* THERE IS NO EXPLANATORY LINE UNDER THIS CONTROL. It read
                  "This is the location filed with the photo. Eddy does not read
                  your phone's location or the picture's" — two sentences
                  answering a question the label above already answers ("Where
                  was it taken?") and then denying an accusation nobody in the
                  middle of uploading a photo had made. A privacy denial printed
                  beside a control is the one place it reads as a confession.

                  The claim itself is still true and still documented — see the
                  header, and `exif: true` in pick(), which takes the capture
                  TIME and no coordinate. Where it belongs is the privacy policy,
                  not under a dropdown. */}

              {/* Required, and says so where it is asked rather than after the
                  upload. See send(). */}
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="What does it show? Water level, the ramp, a hazard…"
                placeholderTextColor={colors.textSubtle}
                multiline
                style={[
                  styles.input,
                  styles.noteInput,
                  { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
                ]}
                accessibilityLabel="What the photo shows"
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

              {/* ── The level this gets filed under, and a way to correct it ──
                  The server derives it from the capture time, which is right
                  almost always and wrong in the case this feature is best at:
                  somebody standing at the staff gauge who can read the number
                  off the plate. A gauge is also a point on a long river, and a
                  photo taken eight miles downstream is filed against a number
                  measured somewhere else.

                  So the derived answer is stated plainly, and overriding it is
                  one tap away rather than the default — most people should not
                  touch this, and a form that opens with an empty number field
                  invites a guess. `readingSource: 'manual'` is what tells the
                  moderator which of the two they are looking at. */}
              {manualLine ? (
                <Text style={[styles.hint, { color: colors.textSubtle }]}>{manualLine}</Text>
              ) : photo?.capturedAt ? (
                <Text style={[styles.hint, { color: colors.textSubtle }]}>
                  Taken {new Date(photo.capturedAt).toLocaleDateString()} — it will be filed under
                  the level the river was at then.
                </Text>
              ) : (
                <Text style={[styles.hint, { color: colors.textSubtle }]}>
                  Filed under today&apos;s level.
                </Text>
              )}

              {overrideOpen ? (
                <View style={styles.override}>
                  <View style={styles.overrideRow}>
                    <TextInput
                      value={overrideValue}
                      onChangeText={setOverrideValue}
                      placeholder={overrideUnit === 'ft' ? '3.40' : '940'}
                      placeholderTextColor={colors.textSubtle}
                      keyboardType="decimal-pad"
                      style={[
                        styles.input,
                        styles.overrideInput,
                        {
                          borderColor: colors.border,
                          color: colors.text,
                          backgroundColor: colors.bg,
                        },
                      ]}
                      accessibilityLabel={
                        overrideUnit === 'ft' ? 'Gauge height in feet' : 'Discharge in cfs'
                      }
                    />
                    {/* BOTH UNITS, because the ladders are defined in both and
                        18 of 24 rivers are rated in cfs. A single field
                        labelled "ft" would collect feet from people reading a
                        cfs river, which is the cross-unit mistake every reading
                        helper in this codebase refuses to make. */}
                    {(['ft', 'cfs'] as const).map((unit) => {
                      const on = overrideUnit === unit;
                      return (
                        <Pressable
                          key={unit}
                          onPress={() => setOverrideUnit(unit)}
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
                            style={[
                              styles.chipText,
                              { color: on ? colors.text : colors.textMuted },
                            ]}
                          >
                            {unit}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={[styles.hint, { color: colors.textSubtle }]}>
                    Read off the staff gauge, if you were standing at one. A moderator sees this
                    as your reading rather than Eddy&apos;s.
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => {
                  setOverrideOpen((open) => !open);
                  if (overrideOpen) setOverrideValue('');
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ expanded: overrideOpen }}
              >
                <Text style={[styles.overrideToggle, { color: colors.interactive }]}>
                  {overrideOpen ? 'Use the gauge reading instead' : 'Set the reading yourself'}
                </Text>
              </Pressable>

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

      {/* ── The list itself ─────────────────────────────────────────────
          A second Modal, nested inside the sheet's own, rather than an inline
          expander: thirty access points inline would push Send off the bottom
          of a form somebody is halfway through, and collapse it again under
          their thumb. Transparent with a scrim so the form stays visible
          behind — the choice is about the photo above it. */}
      <Modal
        visible={placeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPlaceOpen(false)}
      >
        <Pressable
          style={[styles.pickerScrim, { backgroundColor: colors.scrim }]}
          onPress={() => setPlaceOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close the list"
        >
          {/* Swallows taps so a press inside the card does not dismiss it. */}
          <Pressable
            style={[styles.pickerCard, { backgroundColor: colors.card }]}
            onPress={() => {}}
          >
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              Where was it taken?
            </Text>
            <ScrollView style={styles.pickerList}>
              {placeable.map((point) => {
                const on = point.id === accessPointId;
                return (
                  <Pressable
                    key={point.id}
                    onPress={() => {
                      setAccessPointId(point.id);
                      setPlaceOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.pickerRow,
                      { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Text
                      style={[
                        styles.pickerRowText,
                        { color: on ? colors.interactive : colors.text },
                      ]}
                    >
                      {point.name}
                    </Text>
                    {on ? (
                      <Ionicons name="checkmark" size={17} color={colors.interactive} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.xs, fontFamily: fonts.medium },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    // 46pt tall, past the 44pt touch minimum without hitSlop.
    paddingVertical: 13,
  },
  selectText: { flex: 1, minWidth: 0, ...t.sm, fontFamily: fonts.medium },
  pickerScrim: { flex: 1, justifyContent: 'flex-end' },
  // Capped so a river with thirty put-ins scrolls inside the card rather than
  // running the card off the top of the screen.
  pickerCard: {
    maxHeight: '70%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },
  pickerTitle: { ...t.lg, fontFamily: fonts.semibold, marginBottom: 6 },
  pickerList: { flexGrow: 0 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  pickerRowText: { flex: 1, ...t.sm, fontFamily: fonts.medium },
  override: { gap: 8 },
  overrideRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  overrideInput: { flex: 1 },
  overrideToggle: { ...t.xs, fontFamily: fonts.semibold, paddingVertical: 2 },
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
