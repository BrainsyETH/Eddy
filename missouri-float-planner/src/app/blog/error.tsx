'use client';

export default function BlogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center" role="alert">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
          <span className="text-2xl" aria-hidden="true">📝</span>
        </div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">
          Couldn&apos;t load blog content
        </h2>
        <p className="text-neutral-500 text-sm mb-6">
          {error.message || 'We had trouble loading this content. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
