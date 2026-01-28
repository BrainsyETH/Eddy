// src/components/ui/Skeleton.tsx
// Reusable skeleton loading component for better perceived performance

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string;
  height?: string;
  count?: number;
}

export default function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  count = 1,
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-gradient-to-r from-neutral-200 via-neutral-100 to-neutral-200 bg-[length:200%_100%]';
  
  const variantClasses = {
    text: 'rounded h-4',
    rectangular: 'rounded-lg',
    circular: 'rounded-full',
  };

  const style = {
    width: width || (variant === 'text' ? '100%' : undefined),
    height: height || (variant === 'text' ? '1rem' : undefined),
  };

  const skeletonElement = (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );

  if (count === 1) {
    return skeletonElement;
  }

  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>{skeletonElement}</div>
      ))}
    </div>
  );
}

// Common skeleton patterns
export function SkeletonCard() {
  return (
    <div className="bg-white border-2 border-neutral-200 rounded-lg p-4 shadow-sm space-y-3">
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="text" count={3} />
      <Skeleton variant="rectangular" height="120px" />
    </div>
  );
}

export function SkeletonAccessPoint() {
  return (
    <div className="flex items-center gap-3 p-3 border-2 border-neutral-200 rounded-lg">
      <Skeleton variant="circular" width="40px" height="40px" />
      <div className="flex-1 space-y-2">
        <Skeleton variant="text" width="70%" />
        <Skeleton variant="text" width="40%" />
      </div>
    </div>
  );
}

export function SkeletonRiverList() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-white border border-neutral-200 rounded-lg">
          <Skeleton variant="rectangular" width="60px" height="40px" />
          <div className="flex-1 space-y-1">
            <Skeleton variant="text" width="50%" />
            <Skeleton variant="text" width="30%" />
          </div>
        </div>
      ))}
    </div>
  );
}
