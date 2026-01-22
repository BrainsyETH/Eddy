// src/app/not-found.tsx
// Custom 404 page

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-ozark-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-river-500/20 flex items-center justify-center">
          <span className="text-3xl">🌊</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">404 - Page Not Found</h2>
        <p className="text-bluff-400 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/" className="btn-primary inline-block">
          Go Home
        </Link>
      </div>
    </div>
  );
}
