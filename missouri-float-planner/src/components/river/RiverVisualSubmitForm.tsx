'use client';

// src/components/river/RiverVisualSubmitForm.tsx
// Form for submitting a river visual photo with gauge data
// Auto-populates gauge readings from current conditions, user can edit

import { useState, useEffect } from 'react';
import { Camera, Upload, CheckCircle, AlertTriangle, X, Loader2, Clock, MapPin } from 'lucide-react';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { computeCondition, type ConditionThresholds } from '@/lib/conditions';
import type { AccessPoint } from '@/types/api';

/** Local YYYY-MM-DD for a native <input type="date">. */
function toDateInputValue(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Matches the server-side Missouri bounds check in /api/reports. */
function withinMissouri(lat: number, lng: number): boolean {
  return lat >= 35 && lat <= 41 && lng >= -97 && lng <= -88;
}

// Vercel's serverless functions reject request bodies larger than ~4.5 MB
// before they ever reach /api/upload, so a 5–10 MB phone photo (allowed by the
// 10 MB field cap) failed at the platform — the browser then surfaced the
// non-JSON error page as a cryptic "string did not match the expected pattern".
// Downscale anything over the safe threshold to a JPEG that comfortably fits.
const UPLOAD_SAFE_BYTES = 4 * 1024 * 1024;
const UPLOAD_MAX_DIMENSION = 2400; // mirrors the server-side normalize step

/**
 * Prepare a selected photo for upload. Large images are re-encoded to a smaller
 * JPEG so the request stays under the platform body-size limit. EXIF
 * orientation is baked in here (`imageOrientation: 'from-image'`) because the
 * re-encode drops the orientation tag the server would otherwise honor. On any
 * failure we fall back to the original file untouched.
 */
async function prepareUpload(file: File): Promise<Blob> {
  if (file.size <= UPLOAD_SAFE_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const encodeAt = (maxDim: number, quality: number): Promise<Blob | null> => {
        const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return Promise.resolve(null);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      };
      let blob = await encodeAt(UPLOAD_MAX_DIMENSION, 0.82);
      if (!blob || blob.size > UPLOAD_SAFE_BYTES) {
        blob = (await encodeAt(1800, 0.7)) ?? blob;
      }
      if (blob && blob.size > 0) return blob;
    } finally {
      bitmap.close?.();
    }
  } catch {
    // Fall through to the original file; the server and error handling cope.
  }
  return file;
}

/**
 * Read a fetch Response as JSON without ever throwing a cryptic parse error when
 * the body isn't JSON (e.g. a platform 413/502 HTML page). Returns {} for any
 * non-JSON body so callers fall back to a friendly, status-based message.
 */
async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Pull each gauge's ladder out of a /api/conditions response's gauges array. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function harvestThresholds(gauges: Array<Record<string, any>>): Record<string, ConditionThresholds> {
  const out: Record<string, ConditionThresholds> = {};
  for (const g of gauges) {
    if (g?.id && g?.thresholds) out[g.id as string] = g.thresholds as ConditionThresholds;
  }
  return out;
}

/** Friendly, human-readable message for a failed upload/report HTTP status. */
function httpFailMessage(status: number, action: 'upload the photo' | 'submit the report'): string {
  if (status === 413) return 'That photo is too large to upload. Please try a smaller photo.';
  if (status === 429) return 'You’ve reached the submission limit. Please wait a bit and try again.';
  if (status >= 500) return `Couldn’t ${action} right now. Please try again in a moment.`;
  return `Couldn’t ${action} (error ${status}). Please try again.`;
}

interface RiverVisualSubmitFormProps {
  riverId: string;
  riverSlug?: string;
  accessPoints: AccessPoint[] | undefined;
  currentGaugeHeightFt: number | null;
  currentDischargeCfs: number | null;
  currentConditionCode?: string;
  gaugeStationId?: string | null;
  onSubmitted?: () => void;
  onClose: () => void;
}

export default function RiverVisualSubmitForm({
  riverId,
  accessPoints,
  currentGaugeHeightFt,
  currentDischargeCfs,
  gaugeStationId,
  onSubmitted,
  onClose,
}: RiverVisualSubmitFormProps) {
  const [submitterName, setSubmitterName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAccessPointId, setSelectedAccessPointId] = useState('');
  const [gaugeHeight, setGaugeHeight] = useState(currentGaugeHeightFt?.toString() ?? '');
  const [dischargeCfs, setDischargeCfs] = useState(currentDischargeCfs?.toString() ?? '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // When the photo/float happened. The date field is the source of truth (EXIF
  // pre-fills it); changing it re-pulls the USGS reading for that day.
  const [photoDate, setPhotoDate] = useState<string>(() => toDateInputValue(new Date()));
  const [capturedAt, setCapturedAt] = useState<string | null>(() => new Date().toISOString());
  const [readingSource, setReadingSource] = useState<'live' | 'historical' | 'manual'>('live');
  const [readingNote, setReadingNote] = useState<string | null>(null);
  const [readingLoading, setReadingLoading] = useState(false);

  // The photo's own GPS (from EXIF), when it's a real on-water Missouri shot.
  // Off by default; opting in pins the visual exactly where it was taken instead
  // of at the (coarser) access point.
  const [photoGps, setPhotoGps] = useState<{ lat: number; lng: number } | null>(null);
  const [usePhotoLocation, setUsePhotoLocation] = useState(false);

  // Reach-based gauge: when the submitter picks the nearest access point, resolve
  // the gauge that represents that stretch of river (the same segment-aware
  // selection the conditions API uses) rather than the river's single primary
  // gauge — so a photo near Akers isn't tagged to a gauge 50 miles downstream.
  // Falls back to the gauge the form opened with.
  const [reachGauge, setReachGauge] = useState<
    { id: string; gaugeHeightFt: number | null; dischargeCfs: number | null } | null
  >(null);

  // Per-gauge condition ladders (from /api/conditions), so the form can show
  // live which level band this photo will file under as the reading changes.
  const [gaugeThresholds, setGaugeThresholds] = useState<Record<string, ConditionThresholds>>({});
  // Band captured at submit time, echoed on the success screen.
  const [submittedBand, setSubmittedBand] = useState<string | null>(null);

  const effGaugeStationId = reachGauge?.id ?? gaugeStationId;
  const effCurrentGaugeHeightFt = reachGauge ? reachGauge.gaugeHeightFt : currentGaugeHeightFt;
  const effCurrentDischargeCfs = reachGauge ? reachGauge.dischargeCfs : currentDischargeCfs;

  // Live "files under" preview: band the entered reading with the effective
  // gauge's ladder. This is the level the photo will be grouped by in the
  // gallery/map, which otherwise surprises submitters (a photo taken during
  // High water can file under Dangerous and seem to vanish).
  const previewThresholds = effGaugeStationId ? gaugeThresholds[effGaugeStationId] : undefined;
  const parsedHeight = parseFloat(gaugeHeight);
  const parsedCfs = parseFloat(dischargeCfs);
  const previewHeight = gaugeHeight.trim() !== '' && Number.isFinite(parsedHeight) ? parsedHeight : null;
  const previewCfs = dischargeCfs.trim() !== '' && Number.isFinite(parsedCfs) ? parsedCfs : null;
  const previewBand =
    previewThresholds && (previewHeight != null || previewCfs != null)
      ? computeCondition(previewHeight, previewThresholds, previewCfs).code
      : null;

  // Resolve the reach gauge for the chosen access point via the conditions
  // endpoint (which runs the segment-aware DB selection). Best-effort.
  useEffect(() => {
    if (!selectedAccessPointId || !riverId) {
      setReachGauge(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/conditions/${riverId}?putInAccessPointId=${encodeURIComponent(selectedAccessPointId)}`
        );
        if (!res.ok) return;
        const json = await res.json();
        const usgsId: string | null = json?.condition?.gaugeUsgsId ?? null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gauges: Array<Record<string, any>> = Array.isArray(json?.gauges) ? json.gauges : [];
        if (!cancelled) setGaugeThresholds((prev) => ({ ...prev, ...harvestThresholds(gauges) }));
        const match = usgsId ? gauges.find((g) => g.usgsSiteId === usgsId) : null;
        if (cancelled || !match) return;
        setReachGauge({
          id: match.id as string,
          gaugeHeightFt: json?.condition?.gaugeHeightFt ?? match.gaugeHeightFt ?? null,
          dischargeCfs: json?.condition?.dischargeCfs ?? match.dischargeCfs ?? null,
        });
      } catch {
        // Best-effort — keep the default gauge.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedAccessPointId, riverId]);

  // Seed the ladders on open (before an access point is chosen) so the
  // "files under" preview works from the first keystroke. Best-effort.
  useEffect(() => {
    if (!riverId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/conditions/${riverId}`);
        if (!res.ok) return;
        const json = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gauges: Array<Record<string, any>> = Array.isArray(json?.gauges) ? json.gauges : [];
        if (!cancelled) setGaugeThresholds((prev) => ({ ...harvestThresholds(gauges), ...prev }));
      } catch {
        // Preview is a nicety — the form works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [riverId]);

  // Keep the live reading in sync with the effective gauge's current values,
  // unless the user picked a past date or hand-edited the field.
  useEffect(() => {
    if (readingSource !== 'live') return;
    setGaugeHeight(effCurrentGaugeHeightFt != null ? String(effCurrentGaugeHeightFt) : '');
    setDischargeCfs(effCurrentDischargeCfs != null ? String(effCurrentDischargeCfs) : '');
  }, [effCurrentGaugeHeightFt, effCurrentDischargeCfs, readingSource]);

  // When the reach gauge changes for an already-chosen past date, re-pull the
  // reading from the new gauge so the stored stage/flow matches the location.
  useEffect(() => {
    if (readingSource === 'live' || readingSource === 'manual') return;
    void selectDate(photoDate, capturedAt ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effGaugeStationId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB.');
      return;
    }

    setImageFile(file);
    setError(null);

    // Generate preview
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);

    // Read capture time from EXIF; for older photos, backfill the reading from
    // USGS for when the photo was actually taken (not now).
    void extractCaptureAndBackfill(file);
  }

  // Pull the USGS reading for a chosen day. Shared by the date field and the
  // EXIF pre-fill; `exactIso` carries EXIF's precise time when we have it.
  async function selectDate(dateStr: string, exactIso?: string) {
    if (!dateStr) return;
    setPhotoDate(dateStr);
    const when = new Date(exactIso ?? `${dateStr}T12:00:00`);
    if (isNaN(when.getTime())) return;
    setCapturedAt(when.toISOString());

    // Today (or within a few hours) — the live reading the form opened with is
    // right; restore it in case an older date had been chosen first.
    const isToday = dateStr === toDateInputValue(new Date());
    if (isToday || Date.now() - when.getTime() < 6 * 60 * 60 * 1000) {
      setReadingSource('live');
      setReadingNote(null);
      setGaugeHeight(effCurrentGaugeHeightFt != null ? String(effCurrentGaugeHeightFt) : '');
      setDischargeCfs(effCurrentDischargeCfs != null ? String(effCurrentDischargeCfs) : '');
      return;
    }

    const label = when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    if (!effGaugeStationId) {
      setReadingNote(`Using ${label}. Enter the level below.`);
      return;
    }

    setReadingLoading(true);
    try {
      const res = await fetch(
        `/api/gauge-reading-at?gaugeStationId=${effGaugeStationId}&at=${encodeURIComponent(when.toISOString())}`
      );
      const data = res.ok ? await res.json() : null;
      if (data?.found) {
        // Overwrite from the historical reading, clearing any field the record
        // doesn't carry (older daily-mean records have discharge but no stage)
        // so the form never keeps the live value it was seeded with for a past
        // date.
        setGaugeHeight(data.gaugeHeightFt != null ? String(data.gaugeHeightFt) : '');
        setDischargeCfs(data.dischargeCfs != null ? String(data.dischargeCfs) : '');
        setReadingSource('historical');
        setReadingNote(
          data.gaugeHeightFt != null
            ? `Stage & flow pulled from USGS for ${label}.`
            : `Flow pulled from USGS for ${label}; enter the stage if you know it.`
        );
      } else {
        setReadingNote(`No USGS reading found for ${label} — please enter the level.`);
      }
    } finally {
      setReadingLoading(false);
    }
  }

  // On photo select, use EXIF capture time to pre-fill the date field (which
  // triggers the USGS lookup). Best-effort — many photos carry no EXIF date.
  async function extractCaptureAndBackfill(file: File) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import('exifr');
      const exifr = mod.default ?? mod;
      const exif = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']).catch(() => null);
      const taken: Date | undefined = exif?.DateTimeOriginal ?? exif?.CreateDate;
      if (taken instanceof Date && !isNaN(taken.getTime())) {
        await selectDate(toDateInputValue(taken), taken.toISOString());
      }

      // Read the photo's GPS. If it's inside Missouri (a real on-water shot),
      // offer to pin the visual exactly there — off by default, the submitter
      // opts in with the toggle.
      const gps = await exifr.gps(file).catch(() => null);
      if (
        gps &&
        typeof gps.latitude === 'number' &&
        typeof gps.longitude === 'number' &&
        withinMissouri(gps.latitude, gps.longitude)
      ) {
        setPhotoGps({ lat: gps.latitude, lng: gps.longitude });
      } else {
        setPhotoGps(null);
      }
      setUsePhotoLocation(false);
    } catch {
      // EXIF is best-effort; the date field defaults to today.
    }
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    setPhotoDate(toDateInputValue(new Date()));
    setCapturedAt(new Date().toISOString());
    setReadingSource('live');
    setReadingNote(null);
    setReadingLoading(false);
    setPhotoGps(null);
    setUsePhotoLocation(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!imageFile) {
      setError('Please select a photo to upload.');
      return;
    }
    if (!description.trim()) {
      setError('Please add a brief description.');
      return;
    }
    if (!selectedAccessPointId) {
      setError('Please choose the nearest access point so the photo is attached to the correct river location.');
      return;
    }

    try {
      setSubmitting(true);

      // 1. Upload image via public endpoint. Large phone photos are downscaled
      // first so the request stays under the platform's body-size limit.
      setUploading(true);
      const uploadBlob = await prepareUpload(imageFile);
      const formData = new FormData();
      formData.append(
        'file',
        uploadBlob,
        uploadBlob instanceof File ? uploadBlob.name : 'river-photo.jpg'
      );

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const uploadError = await readJsonSafe(uploadRes);
        throw new Error((uploadError.error as string) || httpFailMessage(uploadRes.status, 'upload the photo'));
      }

      // The upload endpoint quarantines the photo and returns its storage
      // path; the photo only becomes publicly visible after moderation.
      const uploadData = await readJsonSafe(uploadRes);
      const imagePath = typeof uploadData.path === 'string' ? uploadData.path : '';
      if (!imagePath) {
        throw new Error('The photo upload didn’t complete. Please try again.');
      }
      setUploading(false);

      // 2. Location: the access point is required (checked above), so coordinates
      // default to it; a submitter who opts in overrides with the photo's own GPS
      // (the precise on-water spot).
      const accessPoint = accessPoints?.find((p) => p.id === selectedAccessPointId);
      let latitude = accessPoint?.coordinates.lat ?? 37.5;
      let longitude = accessPoint?.coordinates.lng ?? -91.5;
      if (usePhotoLocation && photoGps) {
        latitude = photoGps.lat;
        longitude = photoGps.lng;
      }

      // 3. Submit report
      const reportPayload = {
        riverId,
        type: 'river_visual',
        latitude,
        longitude,
        imagePath,
        description: description.trim(),
        gaugeHeightFt: gaugeHeight ? parseFloat(gaugeHeight) : undefined,
        dischargeCfs: dischargeCfs ? parseFloat(dischargeCfs) : undefined,
        accessPointId: selectedAccessPointId || undefined,
        gaugeStationId: effGaugeStationId || undefined,
        submitterName: submitterName.trim() || undefined,
        capturedAt: capturedAt || undefined,
        readingSource,
      };

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportPayload),
      });

      if (!res.ok) {
        const data = await readJsonSafe(res);
        throw new Error((data.error as string) || httpFailMessage(res.status, 'submit the report'));
      }

      // Show the success confirmation; notify the parent when the user dismisses
      // it (below) rather than immediately — otherwise the host unmounts this
      // component and the "Photo Submitted!" screen is never seen.
      setSubmittedBand(previewBand);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  if (success) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden text-center">
        <div className="bg-teal-50 px-6 pt-8 pb-6">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-600">
            <CheckCircle className="h-8 w-8 text-white" />
          </span>
          <h3 className="mt-3 text-lg font-bold text-neutral-900">Photo submitted</h3>
          <p className="mt-1 text-sm text-neutral-600">Thanks for showing fellow floaters the river.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          {imagePreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreview}
              alt=""
              className="mx-auto h-24 w-24 rounded-lg border border-neutral-200 object-cover"
            />
          )}
          {submittedBand && submittedBand !== 'unknown' && (
            <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-neutral-600">
              <span>Once approved, it&apos;ll appear under</span>
              <ConditionBadge code={submittedBand} size="sm" />
            </p>
          )}
          <p className="text-xs text-neutral-400">
            A quick review keeps the gallery trustworthy — your photo goes live as soon
            as it&apos;s approved.
          </p>
          <button
            onClick={() => { onSubmitted?.(); onClose(); }}
            className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-neutral-500" />
          <h3 className="text-sm font-semibold text-neutral-800">Show us what the river looks like</h3>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-neutral-400 hover:text-neutral-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Image upload */}
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">
            Photo <span className="text-red-500">*</span>
          </label>
          {imagePreview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full h-48 object-cover rounded-lg border border-neutral-200"
              />
              <button
                type="button"
                onClick={clearImage}
                aria-label="Remove photo"
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-neutral-300 rounded-lg hover:border-neutral-400 hover:bg-neutral-50 transition-colors">
              <div className="flex items-center gap-3 mb-2">
                {/* Camera button — opens camera on mobile */}
                <label className="flex flex-col items-center cursor-pointer px-4 py-2 rounded-lg hover:bg-neutral-100 transition-colors">
                  <Camera className="w-7 h-7 text-teal-600 mb-1" />
                  <span className="text-xs font-medium text-teal-700">Take Photo</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                <div className="w-px h-10 bg-neutral-200" />
                {/* Gallery button — opens file picker */}
                <label className="flex flex-col items-center cursor-pointer px-4 py-2 rounded-lg hover:bg-neutral-100 transition-colors">
                  <Upload className="w-7 h-7 text-neutral-400 mb-1" />
                  <span className="text-xs font-medium text-neutral-500">Upload</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
              <span className="text-xs text-neutral-400">JPEG, PNG, or WebP (max 10MB)</span>
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Looking downstream from the gravel bar, nice clear water..."
            rows={2}
            maxLength={500}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          />
        </div>

        {/* Access point */}
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">
            Nearest Access Point <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedAccessPointId}
            onChange={(e) => setSelectedAccessPointId(e.target.value)}
            required
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          >
            <option value="">Select the nearest access point</option>
            {accessPoints?.map((ap) => (
              <option key={ap.id} value={ap.id}>
                {ap.name}
              </option>
            ))}
          </select>
        </div>

        {/* Precise location from the photo's GPS — shown only when the photo
            was geotagged inside Missouri. Off by default; opt in with the toggle.
            The whole row is the switch, for a comfortable tap target on mobile. */}
        {photoGps && (
          <button
            type="button"
            role="switch"
            aria-checked={usePhotoLocation}
            aria-label="Pin it where I took the photo"
            onClick={() => setUsePhotoLocation((v) => !v)}
            className="flex w-full items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-left transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-800">
                <MapPin className="h-4 w-4 shrink-0 text-teal-600" />
                Pin it where I took the photo
              </span>
              <span className="mt-0.5 block text-xs text-neutral-500">
                Uses your photo&apos;s GPS to drop the pin exactly where you stood, instead of at the access point.
              </span>
            </span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                usePhotoLocation ? 'bg-teal-600' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${
                  usePhotoLocation ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </span>
          </button>
        )}

        {/* Date of photo / float — drives the USGS reading lookup */}
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">
            Date of photo / float
          </label>
          <input
            type="date"
            value={photoDate}
            max={toDateInputValue(new Date())}
            onChange={(e) => { void selectDate(e.target.value); }}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          />
          <p className="mt-1 text-xs text-neutral-400">
            We&apos;ll pull the USGS gauge reading for this day.
          </p>
        </div>

        {/* Capture-time reading note */}
        {(readingNote || readingLoading) && (
          <div className="flex items-start gap-1.5 text-xs text-teal-800 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
            {readingLoading
              ? <Loader2 className="w-3.5 h-3.5 shrink-0 mt-px animate-spin" />
              : <Clock className="w-3.5 h-3.5 shrink-0 mt-px" />}
            <span>
              {readingLoading ? 'Checking USGS for the reading when this photo was taken…' : readingNote}
            </span>
          </div>
        )}

        {/* Gauge readings - auto-populated, editable */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">
              Gauge Height (ft)
            </label>
            <input
              type="number"
              step="0.01"
              value={gaugeHeight}
              onChange={(e) => { setGaugeHeight(e.target.value); setReadingSource('manual'); }}
              placeholder="Auto-filled"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">
              Discharge (CFS)
            </label>
            <input
              type="number"
              step="1"
              value={dischargeCfs}
              onChange={(e) => { setDischargeCfs(e.target.value); setReadingSource('manual'); }}
              placeholder="Auto-filled"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            />
          </div>
        </div>

        {/* Where this reading files the photo — set expectations before submit */}
        {previewBand && previewBand !== 'unknown' && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            <span>This photo will file under</span>
            <ConditionBadge code={previewBand} size="sm" />
            <span className="text-neutral-400">— the level readers find it grouped by.</span>
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">
            Your Name (optional)
          </label>
          <input
            type="text"
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            placeholder="Anonymous"
            maxLength={100}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !imageFile || !selectedAccessPointId}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-neutral-300 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {uploading ? 'Uploading photo...' : 'Submitting...'}
            </>
          ) : (
            <>
              <Camera className="w-4 h-4" />
              Submit River Photo
            </>
          )}
        </button>

        <p className="text-xs text-neutral-400 text-center">
          By submitting, you confirm this is your own photo and grant Eddy
          permission to display it. Photos are reviewed before appearing publicly.
        </p>
      </form>
    </div>
  );
}
