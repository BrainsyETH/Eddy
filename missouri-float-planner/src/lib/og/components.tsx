// src/lib/og/components.tsx
// Reusable components for OG image generation

import type { ConditionCode } from './types';
import { getStatusStyles, getStatusGradient, BRAND_COLORS } from './colors';

// Eddy brand mark with avatar and text
export function EddyMark({
  avatarSrc,
  size = 28,
}: {
  avatarSrc: string;
  size?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          width: size,
          height: size,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${BRAND_COLORS.greenTreeline} 0%, ${BRAND_COLORS.mossGreen} 100%)`,
          border: '2px solid rgba(255,255,255,0.2)',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarSrc}
          width={size - 4}
          height={size - 4}
          alt=""
          style={{ objectFit: 'cover' }}
        />
      </div>
      <span
        style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 13,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.5)',
        }}
      >
        eddy.guide
      </span>
    </div>
  );
}

// Status badge with dot and label
export function StatusBadge({
  status,
  size = 'medium',
}: {
  status: ConditionCode;
  size?: 'small' | 'medium' | 'large';
}) {
  const styles = getStatusStyles(status);

  const sizeConfig = {
    small: { fontSize: 11, padding: '4px 10px', dotSize: 6 },
    medium: { fontSize: 14, padding: '8px 16px', dotSize: 8 },
    large: { fontSize: 16, padding: '10px 20px', dotSize: 10 },
  };

  const config = sizeConfig[size];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        backgroundColor: styles.bg,
        border: `1px solid ${styles.border}`,
        borderRadius: 100,
        padding: config.padding,
      }}
    >
      <div
        style={{
          width: config.dotSize,
          height: config.dotSize,
          borderRadius: '50%',
          backgroundColor: styles.solid,
        }}
      />
      <span
        style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: config.fontSize,
          fontWeight: 700,
          color: styles.text,
        }}
      >
        {styles.label}
      </span>
    </div>
  );
}

// Bottom accent bar with status gradient
export function StatusAccentBar({ status }: { status: ConditionCode }) {
  const [startColor, endColor] = getStatusGradient(status);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 4,
        background: `linear-gradient(90deg, ${startColor} 0%, ${endColor} 100%)`,
      }}
    />
  );
}

// Metadata label + value stack
export function MetadataItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span
        style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 11,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.5)',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 20,
          fontWeight: 700,
          color: 'white',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// Pill badge for features
export function FeaturePill({
  text,
  color,
}: {
  text: string;
  color: 'blue' | 'green' | 'coral';
}) {
  const colorMap = {
    blue: {
      bg: 'rgba(57,160,202,0.2)',
      text: '#39a0ca',
      border: 'rgba(57,160,202,0.3)',
    },
    green: {
      bg: 'rgba(71,133,89,0.2)',
      text: '#81B29A',
      border: 'rgba(71,133,89,0.3)',
    },
    coral: {
      bg: 'rgba(240,112,82,0.15)',
      text: '#F07052',
      border: 'rgba(240,112,82,0.25)',
    },
  };

  const colors = colorMap[color];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: 100,
        padding: '6px 14px',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {text}
    </div>
  );
}

// River chip (for access point cards)
export function RiverChip({ name }: { name: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'rgba(57,160,202,0.15)',
        color: '#39a0ca',
        border: '1px solid rgba(57,160,202,0.25)',
        borderRadius: 100,
        padding: '5px 14px',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {name}
    </div>
  );
}

// Tagline at bottom
export function Tagline({ position = 'right' }: { position?: 'left' | 'right' }) {
  return (
    <span
      style={{
        position: 'absolute',
        bottom: 16,
        [position]: 24,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        fontWeight: 500,
        color: 'rgba(255,255,255,0.4)',
      }}
    >
      Plan your float trip with Eddy
    </span>
  );
}

// Domain watermark
export function DomainWatermark() {
  return (
    <span
      style={{
        position: 'absolute',
        bottom: 16,
        right: 24,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
      }}
    >
      eddy.guide
    </span>
  );
}

// Truncate text helper
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '...';
}
