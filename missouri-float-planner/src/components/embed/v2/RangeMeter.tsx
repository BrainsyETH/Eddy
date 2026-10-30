// src/components/embed/v2/RangeMeter.tsx
// Where today's reading sits on the river's ladder — the single glyph that
// answers "how low is Low" without a second tile. Bands come from the shared
// ladder maths (shared/threshold-zones.ts), the same equal-width track the
// river page and the iOS river screen draw, so a marker here lands in the same
// band it does there.

import { buildZones, findZoneIndex, zoneMarkerPercent } from '@shared/threshold-zones';
import { conditionChip } from '@shared/condition-system';
import { formatReading, type ReadingUnit } from '@/lib/embed/options';
import type { EmbedLadder } from '@/lib/embed/river-data';

export default function RangeMeter({
  ladder,
  value,
  conditionCode,
  unit,
}: {
  ladder: EmbedLadder;
  value: number | null;
  conditionCode: string;
  unit: ReadingUnit;
}) {
  const zones = buildZones(ladder);
  if (zones.length === 0) return null;
  const percent = zoneMarkerPercent(zones, value);
  const activeIndex = findZoneIndex(zones, conditionCode);
  const optimal = zones.find((z) => z.key === 'flowing');
  const summary = value != null
    ? `${formatReading(value, unit)} ${unit} is in the ${conditionChip(conditionCode).longLabel} band`
    : 'No current reading to place on the ladder';

  return (
    <div className="ew-meter" role="img" aria-label={`${summary}. ${optimal ? `Optimal ${formatReading(optimal.min, unit)} to ${formatReading(optimal.max, unit)} ${unit}.` : ''}`}>
      <div className="ew-meter-track">
        {zones.map((zone, index) => {
          const chip = conditionChip(zone.key);
          const active = index === activeIndex;
          return (
            <span
              key={zone.key}
              className={`ew-meter-band${active ? ' ew-meter-band-active' : ''}`}
              style={{
                background: active ? chip.solid : chip.background,
                borderColor: chip.borderColor,
              }}
              title={zone.label}
            />
          );
        })}
        {percent != null && (
          <span className="ew-meter-marker" style={{ left: `${percent}%` }} aria-hidden="true">
            <span className="ew-meter-marker-dot" style={{ background: conditionChip(conditionCode).solid }} />
          </span>
        )}
      </div>
      <div className="ew-meter-labels" aria-hidden="true">
        <span>{zones[0].label}</span>
        {optimal && (
          <span className="ew-meter-optimal">
            Optimal {formatReading(optimal.min, unit)}–{formatReading(optimal.max, unit)} {unit}
          </span>
        )}
        <span>{zones[zones.length - 1].label}</span>
      </div>
    </div>
  );
}
