'use client';

// src/app/error.tsx
// Error boundary for the app

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-ozark-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Something went wrong!</h2>
        <p className="text-bluff-400 mb-6">
          {error.message || 'An unexpected error occurred'}
        </p>
        <button
          onClick={reset}
          className="btn-primary"
        >
          Try again
        </button>
        {error.digest && (
          <p className="text-xs text-bluff-500 mt-4">Error ID: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
