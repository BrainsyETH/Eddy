import { NextResponse } from 'next/server';
import type { AppConfigResponse } from '@eddy/types';

export const revalidate = 300;

function enabled(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  return value == null ? fallback : value === 'true';
}

export async function GET() {
  const response: AppConfigResponse = {
    minimumSupportedVersion: process.env.IOS_MIN_SUPPORTED_VERSION || '1.0.0',
    latestVersion: process.env.IOS_LATEST_VERSION || '1.0.0',
    maintenance: enabled('IOS_MAINTENANCE_MODE', false),
    features: {
      purchases: enabled('IOS_FEATURE_PURCHASES', false),
      pushAlerts: enabled('IOS_FEATURE_PUSH_ALERTS', false),
      offlineMaps: enabled('IOS_FEATURE_OFFLINE_MAPS', false),
      nativeMap: enabled('IOS_FEATURE_NATIVE_MAP', true),
    },
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' },
  });
}
