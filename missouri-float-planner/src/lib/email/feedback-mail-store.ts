import type { SupabaseClient } from '@supabase/supabase-js';
import { FeedbackMailError, feedbackReplyToken, mailbox, type FeedbackMailStore, type FeedbackReplyRow } from './feedback-mail';

export function feedbackMailStore(db: SupabaseClient): FeedbackMailStore {
  return {
    async feedback(id) {
      const { data, error } = await db.from('feedback').select('id,user_email,message,context_name,created_at,email_thread_token').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
    async reply(id) {
      const { data, error } = await db.from('feedback_email_replies').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as FeedbackReplyRow | null;
    },
    async replies(id) {
      const { data, error } = await db.from('feedback_email_replies').select('*').eq('feedback_id', id).order('created_at');
      if (error) throw error;
      return (data || []) as FeedbackReplyRow[];
    },
    async inbound(id) {
      const { data, error } = await db.from('inbound_emails')
        .select('id,from_address,message_id,subject,text_body,html_body,headers,created_at,resend_created_at,body_fetched,status')
        .eq('feedback_id', id).order('created_at');
      if (error) throw error;
      return data || [];
    },
    async insert(row) {
      const { error } = await db.from('feedback_email_replies').insert(row);
      if (error?.code === '23505') throw new FeedbackMailError('A reply is already being sent. Refresh and retry the saved reply.', 409);
      if (error) throw error;
    },
    async update(id, patch, onlySending) {
      let query = db.from('feedback_email_replies').update(patch).eq('id', id);
      if (onlySending) query = query.eq('status', 'sending');
      else if (patch.status === 'sending') query = query.neq('status', 'sent');
      const { error } = await query;
      if (error?.code === '23505') throw new FeedbackMailError('Another reply is being sent. Refresh the conversation.', 409);
      if (error) throw error;
    },
  };
}

/** Called only after webhook signature verification. Never link by sender alone. */
export async function linkFeedbackEmail(db: SupabaseClient, email: {
  emailId: string; from: string; recipients: string[];
}): Promise<string | null> {
  const token = feedbackReplyToken(email.recipients);
  if (!token) return null;
  const { data: feedback, error } = await db.from('feedback').select('id,user_email').eq('email_thread_token', token).maybeSingle();
  if (error) throw error;
  if (!feedback || !mailbox(email.from) || mailbox(email.from) !== mailbox(feedback.user_email)) return null;
  const { error: linkError } = await db.from('inbound_emails').update({ feedback_id: feedback.id }).eq('email_id', email.emailId);
  if (linkError) throw linkError;
  return feedback.id;
}
