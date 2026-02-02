'use client';

// src/components/ui/FeedbackModal.tsx
// Modal for submitting feedback and data issue reports

import { useState } from 'react';
import { X, Flag, Send, CheckCircle } from 'lucide-react';
import type { FeedbackType, FeedbackContext } from '@/types/api';

const FEEDBACK_TYPES: { value: FeedbackType; label: string; description: string }[] = [
  { value: 'inaccurate_data', label: 'Inaccurate Data', description: 'Gauge readings, water levels, or other data seems wrong' },
  { value: 'missing_access_point', label: 'Missing Access Point', description: 'Know of an access point that\'s not listed?' },
  { value: 'suggestion', label: 'Suggestion', description: 'Ideas to improve Eddy' },
  { value: 'bug_report', label: 'Bug Report', description: 'Something isn\'t working correctly' },
  { value: 'other', label: 'Other', description: 'General feedback or questions' },
];

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  context?: FeedbackContext;
}

export default function FeedbackModal({ isOpen, onClose, context }: FeedbackModalProps) {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('inaccurate_data');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!userEmail.trim()) {
      setError('Email is required');
      return;
    }

    if (!message.trim()) {
      setError('Please provide details about your feedback');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackType,
          userName: userName.trim() || undefined,
          userEmail: userEmail.trim(),
          message: message.trim(),
          context,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit feedback');
      }

      setSuccess(true);
      // Reset form after short delay
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset state
    setFeedbackType('inaccurate_data');
    setUserName('');
    setUserEmail('');
    setMessage('');
    setError(null);
    setSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  // Format context display
  const contextDisplay = context ? (
    <div className="p-3 bg-bluff-50 rounded-lg text-sm mb-4">
      <span className="font-medium text-bluff-700">Reporting about:</span>{' '}
      <span className="text-bluff-600">
        {context.name || context.id || context.type}
      </span>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-bluff-200">
          <div className="flex items-center gap-2">
            <Flag size={20} className="text-accent-500" />
            <h2 className="text-lg font-semibold text-ozark-800">Report Issue</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-bluff-100 rounded-full transition-colors"
          >
            <X size={20} className="text-bluff-500" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <CheckCircle size={48} className="text-support-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">Thank You!</h3>
            <p className="text-neutral-600">
              Your feedback has been submitted. We appreciate you helping improve Eddy!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            {contextDisplay}

            <div>
              <label className="block text-sm font-medium text-bluff-700 mb-1">
                What type of feedback?
              </label>
              <select
                value={feedbackType}
                onChange={(e) => setFeedbackType(e.target.value as FeedbackType)}
                className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-river-500 focus:border-transparent"
              >
                {FEEDBACK_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-bluff-500 mt-1">
                {FEEDBACK_TYPES.find((t) => t.value === feedbackType)?.description}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-bluff-700 mb-1">
                Your Name <span className="text-bluff-400">(optional)</span>
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-river-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-bluff-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-river-500 focus:border-transparent"
                required
              />
              <p className="text-xs text-bluff-500 mt-1">
                In case we need to follow up
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-bluff-700 mb-1">
                Details <span className="text-red-500">*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Please describe the issue or your feedback..."
                rows={4}
                className="w-full px-3 py-2 border border-bluff-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-river-500 focus:border-transparent resize-none"
                required
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-accent-500 text-white rounded-lg text-sm font-medium hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Submit
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
