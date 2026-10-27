import { RotateCcw } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function ClearRouteButton({ onClear }: { onClear: () => void }) {
  return <Button variant="ghost" onClick={onClear} title="Clear route & start over" aria-label="Clear route & start over"
    className="min-h-11 min-w-11 !p-2"><RotateCcw size={18} /></Button>;
}
