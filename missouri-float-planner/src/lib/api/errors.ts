import { NextResponse } from 'next/server';
import type { ApiErrorBody, ApiErrorCode } from '@eddy/types';

export function apiError(
  status: number,
  code: ApiErrorCode,
  error: string,
  details?: Record<string, unknown>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}
