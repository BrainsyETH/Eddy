'use client';

// src/components/embed/PartnerModal.tsx
// Structured "Partner with Eddy" form for the embed workbench. Rides the
// existing feedback pipeline (feedback_type='partner', migration 00163) so
// partner requests land in the same admin triage queue — but with the fields
// a partner conversation actually needs, instead of a blank feedback box.
// The success state points straight at the co-branded card, which needs no
// approval at all.

import { useState, useEffect } from 'react';
import { X, HeartHandshake, Send, CheckCircle } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

const INTERESTS = [
  { value: 'listing', label: 'Get (or fix) my directory listing' },
  { value: 'co_branded_widgets', label: 'Co-branded widgets for my site' },
  { value: 'content', label: 'Work together on guides / content' },
  { value: 'other', label: 'Something else' },
];

interface PartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Jump the workbench to the co-branded card after a successful submit. */
  onSelectCard?: () => void;
}

export default function PartnerModal({ isOpen, onClose, onSelectCard }: PartnerModalProps) {
  const [businessName, setBusinessName] = useState('');
  const [website, setWebsite] = useState('');
  const [rivers, setRivers] = useState('');
  const [interest, setInterest] = useState('co_branded_widgets');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleClose = () => {
    setError(null);
    setSuccess(false);
    onClose();
  };

  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen, handleClose);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!businessName.trim()) {
      setError('Business name is required');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setSubmitting(true);
    try {
      const interestLabel = INTERESTS.find(i => i.value === interest)?.label || interest;
      const message = [
        `Business: ${businessName.trim()}`,
        website.trim() ? `Website: ${website.trim()}` : null,
        rivers.trim() ? `River(s): ${rivers.trim()}` : null,
        `Interested in: ${interestLabel}`,
        notes.trim() ? `Notes: ${notes.trim()}` : null,
      ].filter(Boolean).join('\n');

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackType: 'partner',
          userName: businessName.trim(),
          userEmail: email.trim(),
          message,
          context: { type: 'general', name: 'Partner with Eddy' },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send — try again');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent';
  const labelCls = 'block text-sm font-medium text-neutral-700 mb-1';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="presentation"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="partner-modal-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <HeartHandshake size={20} className="text-accent-500" aria-hidden="true" />
            <h2 id="partner-modal-title" className="text-lg font-semibold text-neutral-900">Partner with Eddy</h2>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close partner form"
            className="p-1 hover:bg-neutral-100 rounded-full transition-colors"
          >
            <X size={20} className="text-neutral-500" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <CheckCircle size={48} className="text-support-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">Got it — we&apos;ll be in touch!</h3>
            <p className="text-neutral-600 text-sm mb-5">
              Meanwhile, you don&apos;t have to wait: the co-branded <strong>Floatable From Here</strong> card
              — your logo, your color, your booking button — takes two minutes and needs no approval.
            </p>
            {onSelectCard && (
              <button
                onClick={() => { onSelectCard(); handleClose(); }}
                className="inline-flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
                style={{ background: '#F07052', boxShadow: '2px 2px 0 #A33122' }}
              >
                Create my card now &rarr;
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <p className="text-sm text-neutral-600">
              Run an outfitter, campground, cabin or vacation rental? Tell us about your business —
              listings, co-branded widgets and priority support are free for local businesses.
            </p>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600" role="alert">
                {error}
              </div>
            )}

            <div>
              <label className={labelCls} htmlFor="partner-business">Business name <span className="text-red-500">*</span></label>
              <input id="partner-business" type="text" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Pine Valley Canoe Rental" className={inputCls} required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="partner-website">Website</label>
                <input id="partner-website" type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yoursite.com" className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="partner-rivers">River(s)</label>
                <input id="partner-rivers" type="text" value={rivers} onChange={e => setRivers(e.target.value)} placeholder="Current, Jacks Fork" className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls} htmlFor="partner-interest">What are you interested in?</label>
              <select id="partner-interest" value={interest} onChange={e => setInterest(e.target.value)} className={inputCls}>
                {INTERESTS.map(i => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="partner-email">Email <span className="text-red-500">*</span></label>
              <input id="partner-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourbusiness.com" className={inputCls} required />
            </div>

            <div>
              <label className={labelCls} htmlFor="partner-notes">Anything else? <span className="text-neutral-400">(optional)</span></label>
              <textarea id="partner-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Tell us what you have in mind..." className={`${inputCls} resize-none`} />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-300 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-accent-500 text-white rounded-lg text-sm font-medium hover:bg-accent-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
