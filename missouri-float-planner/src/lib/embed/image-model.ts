// src/lib/embed/image-model.ts
// What the image renders say — pure, so the PNG (Satori) and the SVG (hand
// built) routes paint the same words and colors, and a test can check them
// without rendering anything.
//
// Images exist for the hosts that strip iframes: Substack, Medium, GitHub
// READMEs, and email newsletters — an outfitter's weekly email can carry a
// live condition pill that no iframe could. They are the badge and the
// strip only; anything richer deserves the real widget.

import { conditionChip } from '@shared/condition-system';
import { damWidgetSnapshot } from '@shared/dam-widget';
import type { DamSnapshot } from '@shared/dam-types';
import {
  embedTokensFor,
  formatReading,
  headlineReading,
  shortAge,
  TREND_GLYPH,
  type EmbedOptions,
  type EmbedTokens,
} from './options';
import type { RiverEmbedData } from './river-data';

export interface EmbedImageModel {
  /** River or dam name. */
  title: string;
  /** Station line under the title on the strip. */
  subtitle: string | null;
  /** Condition / generation word in the pill. */
  status: string;
  /** Pill colors from the canonical system (river) or brand tokens (dam). */
  statusInk: string;
  statusBg: string;
  statusBorder: string;
  dot: string;
  /** "51.9" / "6,600"; null when there is no reading. */
  reading: string | null;
  unit: string | null;
  trend: string | null;
  /** "1h" style observation age, or null. */
  age: string | null;
  tokens: EmbedTokens;
  /** Everything a screen reader or <img alt> should say. */
  alt: string;
}

export function riverImageModel(
  data: RiverEmbedData,
  options: Pick<EmbedOptions, 'theme' | 'accent'>,
  now = Date.now(),
): EmbedImageModel {
  const chip = conditionChip(data.river.conditionCode);
  const reading = headlineReading(data);
  const trend = data.primary?.trend ?? null;
  const value = reading.value != null ? formatReading(reading.value, reading.unit) : null;
  return {
    title: data.river.name,
    subtitle: data.primary?.name ?? null,
    status: chip.label,
    statusInk: chip.color,
    statusBg: chip.background,
    statusBorder: chip.borderColor,
    dot: chip.solid,
    reading: value,
    unit: value ? reading.unit : null,
    trend: trend ? TREND_GLYPH[trend] : null,
    age: shortAge(data.primary?.readingTimestamp, now),
    tokens: embedTokensFor(options),
    alt: `${data.river.name}: ${chip.longLabel}${value ? `, ${value} ${reading.unit}` : ''}${trend ? `, ${trend}` : ''}. Live from Eddy.`,
  };
}

export function damImageModel(
  dam: DamSnapshot,
  options: Pick<EmbedOptions, 'theme' | 'accent'>,
  now = Date.now(),
): EmbedImageModel {
  const tokens = embedTokensFor(options);
  const moment = damWidgetSnapshot(dam, now).entries[0];
  const status = !moment.current
    ? moment.turbineCfs == null ? 'Unavailable' : 'Older reading'
    : moment.generationKind === 'generating'
      ? 'Generating'
      : moment.generationKind === 'not-generating'
        ? moment.minimumFlow ? 'Minimum flow' : 'No generation'
        : moment.status;
  const on = moment.current && moment.generationKind === 'generating';
  const value = moment.turbineCfs != null ? Math.round(moment.turbineCfs).toLocaleString('en-US') : null;
  return {
    title: dam.name,
    subtitle: moment.scheduleSummary,
    status,
    statusInk: on ? tokens.data : tokens.muted,
    statusBg: tokens.surface,
    statusBorder: tokens.border,
    dot: on ? tokens.data : tokens.muted,
    reading: value,
    unit: value ? 'cfs' : null,
    trend: null,
    age: moment.observedAt != null ? shortAge(new Date(moment.observedAt).toISOString(), now) : null,
    tokens,
    alt: `${dam.name}: ${moment.status}${value ? `, ${value} cfs through the turbines` : ''}. ${moment.scheduleSummary} Live from Eddy.`,
  };
}

// ── Geometry shared by both renderers ───────────────────────────────────────
// Fredoka SemiBold averages ~0.56 em per Latin glyph; digits in Geist Mono
// Bold are 0.6 em. Estimates, padded, and the SVG pins them with textLength.

export function estimateTextWidth(text: string, px: number, perEm = 0.56): number {
  return Math.ceil(text.length * px * perEm);
}

export const BADGE_HEIGHT = 36;
export const STRIP_WIDTH = 520;
export const STRIP_HEIGHT = 64;

export function badgeLayout(model: EmbedImageModel) {
  const padX = 12;
  const mark = 20;
  const gap = 8;
  const nameW = estimateTextWidth(model.title, 14);
  const statusText = model.status;
  const statusW = estimateTextWidth(statusText, 12, 0.62) + 8 /* dot */ + 5 + 16 /* pill pad */;
  const width = padX + mark + gap + nameW + gap + statusW + padX;
  return { width, height: BADGE_HEIGHT, padX, mark, gap, nameW, statusW };
}
