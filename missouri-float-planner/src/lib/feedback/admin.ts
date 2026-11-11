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
