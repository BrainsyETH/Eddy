import type { ComponentProps } from 'react';
import AccessPointNav from '@/components/access-point/AccessPointNav';

/** What a shuttle endpoint needs: a name and somewhere to drive to. */
export type ShuttleEndpoint = ComponentProps<typeof AccessPointNav>['accessPoint'];

/**
 * The shuttle as a hand-off to Google or Apple Maps, not a number of our own.
 *
 * Eddy does not print a drive time or road mileage for the shuttle: most
 * access points have no driving coordinates yet and route from mid-river, so
 * the figure was routinely wrong (Pulltite → Cedargrove read 85 mi against
 * Google's 30). The map apps can time the drive honestly; this card just gets
 * the reader there in one tap. See the note on driveBack in /api/plan.
 *
 * One row — text left, icons right — so the 44px tap targets set the card's
 * height instead of stacking a second line of text under them.
 */
export default function ShuttleRoute({ plan }: { plan: { putIn: ShuttleEndpoint; takeOut: ShuttleEndpoint } }) {
  return (
    <section
      aria-label="Shuttle Route"
      className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white py-1 pl-3 pr-1"
    >
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-tight text-primary-700">Shuttle Route</h3>
        <p className="truncate text-xs leading-tight text-neutral-500">
          {plan.putIn.name} → {plan.takeOut.name} by road
        </p>
      </div>
      <AccessPointNav accessPoint={plan.takeOut} origin={plan.putIn} compact iconSize={34} />
    </section>
  );
}
