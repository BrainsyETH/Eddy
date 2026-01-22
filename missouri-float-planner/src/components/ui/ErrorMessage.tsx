// src/components/ui/ErrorMessage.tsx
// Error message display component

interface ErrorMessageProps {
  message: string;
  onDismiss?: () => void;
}

export default function ErrorMessage({
  message,
  onDismiss,
}: ErrorMessageProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-red-800">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-4 text-red-400 hover:text-red-600"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}
