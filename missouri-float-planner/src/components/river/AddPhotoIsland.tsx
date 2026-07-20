'use client';

// src/components/river/AddPhotoIsland.tsx
// Client island for the dedicated Add-a-Photo page: loads the river's data and
// renders the submit form inline (not as a modal). Returning to the river on
// close/submit keeps the standalone page feeling like part of the river.

import { useRouter } from 'next/navigation';
import { useRiver } from '@/hooks/useRivers';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import { useConditions } from '@/hooks/useConditions';
import RiverVisualSubmitForm from './RiverVisualSubmitForm';

interface Props {
  riverSlug: string;
  /** Canonical river hub path to return to on close/submit. */
  riverHref: string;
}

export default function AddPhotoIsland({ riverSlug, riverHref }: Props) {
  const router = useRouter();
  const { data: river, isLoading } = useRiver(riverSlug);
  const { data: accessPoints } = useAccessPoints(riverSlug);
  const { data: conditionData } = useConditions(river?.id || null);
  const condition = conditionData?.condition ?? null;

  const goBack = () => router.push(riverHref);

  if (isLoading || !river) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-6 text-center text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  return (
    <RiverVisualSubmitForm
      riverId={river.id}
      riverSlug={riverSlug}
      accessPoints={accessPoints}
      currentGaugeHeightFt={condition?.gaugeHeightFt ?? null}
      currentDischargeCfs={condition?.dischargeCfs ?? null}
      gaugeStationId={conditionData?.gauges?.find((g) => g.isPrimary)?.id}
      onSubmitted={goBack}
      onClose={goBack}
    />
  );
}
