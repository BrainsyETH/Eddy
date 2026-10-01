/** Pure geometry for the compact chart; all dimensions are layout points. */
export interface ChartRect { x: number; y: number; width: number; height: number }
export interface ChartAnchor { x: number; y: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function chartGutters(axisLabels: string[], railLabels: string[], fontSize: number, showRail: boolean) {
  // Axis values use Geist Mono. Reserve its character width plus the tick gap;
  // use the same conservative width for the rail's proportional labels.
  const longest = (labels: string[]) => Math.max(0, ...labels.map(label => label.length));
  return {
    left: Math.ceil(Math.max(28, longest(axisLabels) * fontSize * 0.62 + 10)),
    right: showRail ? Math.ceil(Math.max(48, ...railLabels.map(label => label.length * fontSize * 0.62 + (/^[↑↓]/.test(label) ? 10 : 20)))) : 8,
  };
}

function overlapArea(a: ChartRect, b: ChartRect): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

/** Keep the selected sample clear, then choose the position least covered by
 * the finger. Null means the measured content cannot fit without hiding data. */
export function placeChartReadout(bounds: ChartRect, size: { width: number; height: number }, point: ChartAnchor, finger?: ChartAnchor | null): ChartRect | null {
  const gap = 12;
  if (size.width <= 0 || size.height <= 0 || size.width > bounds.width || size.height > bounds.height) return null;
  const maxX = bounds.x + bounds.width - size.width;
  const maxY = bounds.y + bounds.height - size.height;
  const target = finger ?? point;
  const preferredX = target.x > bounds.x + bounds.width / 2 ? target.x - gap - size.width : target.x + gap;
  const x = clamp(preferredX, bounds.x, maxX);
  const y = clamp(point.y - size.height / 2, bounds.y, maxY);
  const candidatePositions = [
    { x, y: point.y + gap },
    { x, y: point.y - gap - size.height },
    { x: point.x - gap - size.width, y },
    { x: point.x + gap, y },
    { x: bounds.x, y: bounds.y },
    { x: maxX, y: bounds.y },
    { x: bounds.x, y: maxY },
    { x: maxX, y: maxY },
  ];
  const protectedPoint = { x: point.x - gap, y: point.y - gap, width: gap * 2, height: gap * 2 };
  const touch = { x: target.x - 22, y: target.y - 22, width: 44, height: 44 };
  return candidatePositions.map(position => ({ ...position, ...size }))
    .filter(rect => rect.x >= bounds.x && rect.x <= maxX && rect.y >= bounds.y && rect.y <= maxY && overlapArea(rect, protectedPoint) === 0)
    .sort((a, b) => overlapArea(a, touch) - overlapArea(b, touch))[0] ?? null;
}

export interface ChartRailLabel {
  id: string;
  y: number;
  height: number;
  priority: number;
  text: string;
  kind: 'name' | 'value' | 'offscreen';
  secondLine?: string;
}

/** Labels keep their true y positions. Drop a lower-priority label rather than
 * nudging a threshold to an incorrect height. This includes offscreen arrows. */
export function selectChartRailLabels(labels: ChartRailLabel[], top: number, bottom: number, gap = 4): ChartRailLabel[] {
  const selected: ChartRailLabel[] = [];
  for (const label of [...labels].sort((a, b) => a.priority - b.priority || a.y - b.y)) {
    if (label.y - label.height / 2 < top || label.y + label.height / 2 > bottom) continue;
    if (selected.some(other => Math.abs(other.y - label.y) < (other.height + label.height) / 2 + gap)) continue;
    selected.push(label);
  }
  return selected.sort((a, b) => a.y - b.y);
}

/** Prefer reference lines, but keep a sparse grid when the visible window has
 * too few separated boundaries to explain the scale. */
export function chartGridValues(ticks: number[], referenceValues: number[], domain: { min: number; max: number }, height: number, minGap = 18): number[] {
  const pixelDistance = (a: number, b: number) => Math.abs(a - b) / (domain.max - domain.min || 1) * height;
  const references = referenceValues.filter(value => value >= domain.min && value <= domain.max).sort((a, b) => a - b);
  if (references.length > 1 && pixelDistance(references[0], references[references.length - 1]) >= minGap) return [];
  const available = ticks.filter(value => references.every(reference => pixelDistance(value, reference) >= minGap));
  const count = references.length ? 2 : 3;
  if (available.length <= count) return available;
  return Array.from({ length: count }, (_, index) => available[Math.round(index * (available.length - 1) / (count - 1))]);
}
