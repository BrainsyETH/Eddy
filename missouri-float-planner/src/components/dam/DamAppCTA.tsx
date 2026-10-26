import { ArrowRight } from 'lucide-react';
import AppLink from '@/components/AppLink';
import { getDamAppPromotion } from '@/lib/dam-app-promotion';

export default function DamAppCTA({ damId }: { damId: string }) {
  const dam = getDamAppPromotion(damId);
  if (!dam) return null;

  return (
    <aside aria-label="Eddy for iPhone" data-dam-app-cta={dam.id} className="card-framed flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-lg font-semibold text-primary-800">Check {dam.name} on your iPhone.</p>
      <AppLink
        campaign={dam.campaign}
        damId={dam.id}
        data-ga-event="app_landing_click"
        data-ga-label="dam_schedule"
        data-ga-dam-id={dam.id}
        className="btn-primary min-h-11 !text-neutral-900 sm:shrink-0"
      >
        Get Eddy for iPhone <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
      </AppLink>
    </aside>
  );
}
