'use client';

// src/components/ui/EmailSignup.tsx
// Email signup form for weekly river reports — saves to Supabase

import { useState } from 'react';

interface EmailSignupProps {
  className?: string;
  variant?: 'light' | 'dark';
  source?: string;
}

export default function EmailSignup({ className = '', variant = 'dark', source = 'footer' }: EmailSignupProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setStatus('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      });

      if (res.ok) {
        setStatus('success');
        setEmail('');
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Something went wrong. Try again.');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  };

  const isDark = variant === 'dark';

  if (status === 'success') {
    return (
      <div className={`text-center py-3 ${className}`}>
        <p className={`text-sm font-medium ${isDark ? 'text-primary-100' : 'text-neutral-700'}`}>
          You&apos;re signed up! Watch for Eddy&apos;s weekly river report in your inbox.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className={`text-sm font-semibold mb-1.5 ${isDark ? 'text-white' : 'text-neutral-900'}`}>
        Get Weekly River Reports
      </p>
      <p className={`text-xs mb-3 ${isDark ? 'text-primary-200' : 'text-neutral-500'}`}>
        Eddy&apos;s conditions summary delivered to your inbox every Friday.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (status === 'error') setStatus('idle'); }}
          placeholder="your@email.com"
          required
          aria-label="Email address"
          className={`flex-1 px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-primary-500 ${
            isDark
              ? 'bg-primary-700/50 border-primary-600/30 text-white placeholder:text-primary-300'
              : 'bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400'
          }`}
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          aria-label="Subscribe to weekly river reports"
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#F07052' }}
        >
          {status === 'submitting' ? '...' : 'Subscribe'}
        </button>
      </form>
      {status === 'error' && errorMsg && (
        <p className={`text-xs mt-1.5 ${isDark ? 'text-red-300' : 'text-red-600'}`} role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
