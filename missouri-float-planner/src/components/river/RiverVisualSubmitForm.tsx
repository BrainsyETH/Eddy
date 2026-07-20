'use client';

// src/components/river/RiverVisualSubmitForm.tsx
// Form for submitting a river visual photo with gauge data
// Auto-populates gauge readings from current conditions, user can edit

import { useState, useEffect } from 'react';
import { Camera, Upload, CheckCircle, AlertTriangle, X, Loader2, Clock } from 'lucide-react';
import type { AccessPoint } from '@/types/api';

/** Local YYYY-MM-DD for a native <input type="date">. */
function toDateInputValue(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
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

  // Update gauge values if they change externally
  useEffect(() => {
    if (currentGaugeHeightFt != null && !gaugeHeight) {
      setGaugeHeight(currentGaugeHeightFt.toString());
    }
    if (currentDischargeCfs != null && !dischargeCfs) {
      setDischargeCfs(currentDischargeCfs.toString());
    }
  }, [currentGaugeHeightFt, currentDischargeCfs, gaugeHeight, dischargeCfs]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a JPEG, PNG, WebP, or GIF image.');
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
      setGaugeHeight(currentGaugeHeightFt?.toString() ?? '');
      setDischargeCfs(currentDischargeCfs?.toString() ?? '');
      return;
    }

    const label = when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    if (!gaugeStationId) {
      setReadingNote(`Using ${label}. Enter the level below.`);
      return;
    }

    setReadingLoading(true);
    try {
      const res = await fetch(
        `/api/gauge-reading-at?gaugeStationId=${gaugeStationId}&at=${encodeURIComponent(when.toISOString())}`
      );
      const data = res.ok ? await res.json() : null;
      if (data?.found) {
        if (data.gaugeHeightFt != null) setGaugeHeight(String(data.gaugeHeightFt));
        if (data.dischargeCfs != null) setDischargeCfs(String(data.dischargeCfs));
        setReadingSource('historical');
        setReadingNote(`Stage & flow pulled from USGS for ${label}.`);
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

    try {
      setSubmitting(true);

      // 1. Upload image via public endpoint
      setUploading(true);
      const formData = new FormData();
      formData.append('file', imageFile);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const uploadError = await uploadRes.json();
        throw new Error(uploadError.error || 'Failed to upload image');
      }

      const uploadData = await uploadRes.json();
      const imageUrl: string = uploadData.url;
      setUploading(false);

      // 2. Get coordinates from selected access point or use river center
      let latitude = 37.5; // Default Missouri center
      let longitude = -91.5;

      if (selectedAccessPointId && accessPoints) {
        const ap = accessPoints.find((p) => p.id === selectedAccessPointId);
        if (ap) {
          latitude = ap.coordinates.lat;
          longitude = ap.coordinates.lng;
        }
      }

      // 3. Submit report
      const reportPayload = {
        riverId,
        type: 'river_visual',
        latitude,
        longitude,
        imageUrl,
        description: description.trim(),
        gaugeHeightFt: gaugeHeight ? parseFloat(gaugeHeight) : undefined,
        dischargeCfs: dischargeCfs ? parseFloat(dischargeCfs) : undefined,
        accessPointId: selectedAccessPointId || undefined,
        gaugeStationId: gaugeStationId || undefined,
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
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit');
      }

      // Show the success confirmation; notify the parent when the user dismisses
      // it (below) rather than immediately — otherwise the host unmounts this
      // component and the "Photo Submitted!" screen is never seen.
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
      <div className="bg-white rounded-xl border border-neutral-200 p-6 text-center space-y-3">
        <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
        <h3 className="text-lg font-semibold text-neutral-800">Photo Submitted!</h3>
        <p className="text-sm text-neutral-500">
          Your river visual has been submitted for review. Once approved by an admin,
          it will appear in the gallery for others to see.
        </p>
        <button
          onClick={() => { onSubmitted?.(); onClose(); }}
          className="mt-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-sm font-medium text-neutral-700 transition-colors"
        >
          Close
        </button>
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
                    accept="image/jpeg,image/png,image/webp,image/gif"
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
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
              <span className="text-xs text-neutral-400">JPEG, PNG, WebP, GIF (max 10MB)</span>
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
            Nearest Access Point
          </label>
          <select
            value={selectedAccessPointId}
            onChange={(e) => setSelectedAccessPointId(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          >
            <option value="">Select access point (optional)</option>
            {accessPoints?.map((ap) => (
              <option key={ap.id} value={ap.id}>
                {ap.name}
              </option>
            ))}
          </select>
        </div>

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
          disabled={submitting || !imageFile}
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
