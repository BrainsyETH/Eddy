// Shared admin read/write helpers for the `feedback` table, used by the list,
// status/notes and reply routes so they return the same shape.
import type { Database } from '@/types/database';
import type {
  Feedback,
  FeedbackContextType,
  FeedbackStatus,
  FeedbackType,
} from '@/types/api';

export type FeedbackRow = Database['public']['Tables']['feedback']['Row'];

export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  'pending',
  'reviewed',
  'resolved',
  'dismissed',
];

/** Same cap as a submitted message; notes are internal and never sent. */
export const MAX_ADMIN_NOTES_LENGTH = 5000;

export const FEEDBACK_PAGE_SIZE = 50;

/** App Store reporting route for community photos; the remedy is a takedown. */
export const REPORTED_PHOTO_TYPE = 'objectionable_content' satisfies FeedbackType;

export interface ReportedPhotoContext {
  /** The community_reports row behind the photo. */
  reportId: string;
  /** URL the reporter saw; may since have been taken down. */
  imageUrl: string | null;
  accessPointName: string | null;
  description: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read the photo a "Reported Photo" item points at. Context data is
 * client-submitted, so every field is checked: only a UUID can address a
 * report, and only an https URL is rendered as an image.
 */
export function reportedPhotoContext(item: Pick<Feedback, 'feedbackType' | 'contextData'>): ReportedPhotoContext | null {
  if (item.feedbackType !== REPORTED_PHOTO_TYPE || !item.contextData) return null;
  const data = item.contextData;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null);
  const reportId = text(data.visualId);
  if (!reportId || !UUID.test(reportId)) return null;
  // Never truncated: a shortened URL is a different URL.
  const url = typeof data.imageUrl === 'string' ? data.imageUrl.trim() : '';
  let imageUrl: string | null = null;
  try {
    if (url && url.length <= 2048 && new URL(url).protocol === 'https:') imageUrl = url;
  } catch {
    /* Not a URL: show no preview. */
  }
  return {
    reportId,
    imageUrl,
    accessPointName: text(data.accessPointName),
    description: text(data.description),
  };
}

export function mapFeedbackRow(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    feedbackType: row.feedback_type as FeedbackType,
    userName: row.user_name,
    userEmail: row.user_email,
    message: row.message,
    imageUrl: row.image_url,
    contextType: row.context_type as FeedbackContextType | null,
    contextId: row.context_id,
    contextName: row.context_name,
    contextData: row.context_data as Record<string, unknown> | null,
    status: row.status as FeedbackStatus,
    adminNotes: row.admin_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type FeedbackUpdate = {
  status?: FeedbackStatus;
  admin_notes?: string | null;
  reviewed_at?: string;
  reviewed_by?: string;
  updated_at: string;
};

/**
 * Validate a status/notes PATCH body. A notes-only save does not touch the
 * review stamp, so writing a note never makes an item look reviewed.
 */
export function feedbackUpdate(
  body: unknown,
  reviewer: string,
  now = new Date(),
): { update: FeedbackUpdate } | { error: string } {
  const input = (body ?? {}) as { status?: unknown; adminNotes?: unknown };
  const stamp = now.toISOString();
  const update: FeedbackUpdate = { updated_at: stamp };
  if (input.status !== undefined) {
    if (!FEEDBACK_STATUSES.includes(input.status as FeedbackStatus))
      return { error: 'Invalid status' };
    update.status = input.status as FeedbackStatus;
    update.reviewed_at = stamp;
    update.reviewed_by = reviewer;
  }
  if (input.adminNotes !== undefined) {
    if (input.adminNotes !== null && typeof input.adminNotes !== 'string')
      return { error: 'Notes must be text' };
    const notes = typeof input.adminNotes === 'string' ? input.adminNotes.trim() : '';
    if (notes.length > MAX_ADMIN_NOTES_LENGTH)
      return { error: `Notes are too long (max ${MAX_ADMIN_NOTES_LENGTH} characters)` };
    update.admin_notes = notes || null;
  }
  if (update.status === undefined && update.admin_notes === undefined)
    return { error: 'No updates provided' };
  return { update };
}
