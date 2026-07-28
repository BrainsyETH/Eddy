// src/app/api/me/notification-preferences/route.ts
// GET /api/me/notification-preferences — quiet hours for the caller
// PUT /api/me/notification-preferences — set them
//
// requireUser, not requirePermanentUser, on BOTH verbs. Every other /api/me
// write demands a permanent account because push needs a durable identity to
// route to — but this row only ever makes the app quieter, so a gate here would
// be one with nothing behind it, and it would be reached by an anonymous user
// trying to stop being buzzed.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser } from '@/lib/supabase/request';
import type { NotificationPreferences, NotificationPreferencesResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

/** What a user with no row has. Quiet hours off — nothing is suppressed. */
const DEFAULTS: NotificationPreferences = {
  quietHoursEnabled: false,
  quietStartMinute: null,
  quietEndMinute: null,
  timezone: 'America/Chicago',
  safetyOverridesQuiet: true,
};

interface PrefRow {
  quiet_hours_enabled: boolean;
  quiet_start_minute: number | null;
  quiet_end_minute: number | null;
  timezone: string | null;
  safety_overrides_quiet: boolean;
}

function toPreferences(row: PrefRow | null): NotificationPreferences {
  if (!row) return DEFAULTS;
  return {
    quietHoursEnabled: row.quiet_hours_enabled,
    quietStartMinute: row.quiet_start_minute,
    quietEndMinute: row.quiet_end_minute,
    timezone: row.timezone ?? DEFAULTS.timezone,
    safetyOverridesQuiet: row.safety_overrides_quiet,
  };
}

/** A minute-of-day, 0-1439. */
function validMinute(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1439;
}

/**
 * Is this a zone the delivery pass will be able to resolve?
 *
 * Validated on WRITE because the alternative is discovering it at send time,
 * where isQuietAt() fails open and silently stops honouring the window the user
 * carefully set.
 */
function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const limited = await rateLimit(`me-notif-prefs-read:${user.id}`, 120, 15 * 60 * 1000);
    if (limited) return limited;

    const { data, error } = await supabase
      .from('notification_preferences')
      .select('quiet_hours_enabled, quiet_start_minute, quiet_end_minute, timezone, safety_overrides_quiet')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error reading notification preferences:', error);
      return jsonPrivate({ error: 'Could not load preferences' }, { status: 500 });
    }

    const response: NotificationPreferencesResponse = { preferences: toPreferences(data) };
    return jsonPrivate(response);
  } catch (error) {
    console.error('Error reading notification preferences:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

interface PutBody {
  quietHoursEnabled?: boolean;
  quietStartMinute?: number | null;
  quietEndMinute?: number | null;
  timezone?: string;
  safetyOverridesQuiet?: boolean;
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const limited = await rateLimit(`me-notif-prefs-write:${user.id}`, 60, 15 * 60 * 1000);
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) as PutBody | null;
    if (!body) return jsonPrivate({ error: 'Body required' }, { status: 400 });

    const enabled = body.quietHoursEnabled ?? false;
    const start = body.quietStartMinute ?? null;
    const end = body.quietEndMinute ?? null;

    if (enabled) {
      if (!validMinute(start) || !validMinute(end)) {
        return jsonPrivate(
          { error: 'quietStartMinute and quietEndMinute must be whole minutes between 0 and 1439' },
          { status: 400 }
        );
      }
      // Not a database constraint because an equal pair is a legal SHAPE and an
      // illegal INTENT: it reads as either "never quiet" or "always quiet", and
      // the evaluator has to pick one. Rejecting it here is how the user finds
      // out, rather than wondering why their window does nothing.
      if (start === end) {
        return jsonPrivate(
          { error: 'Quiet hours need a start and end that differ' },
          { status: 400 }
        );
      }
    }

    const timezone = body.timezone ?? DEFAULTS.timezone;
    if (!validTimezone(timezone)) {
      return jsonPrivate({ error: 'Unknown timezone' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: user.id,
          quiet_hours_enabled: enabled,
          // Bounds are kept when the window is switched off, so turning quiet
          // hours back on restores what the user had rather than a blank form.
          quiet_start_minute: validMinute(start) ? start : null,
          quiet_end_minute: validMinute(end) ? end : null,
          timezone,
          safety_overrides_quiet: body.safetyOverridesQuiet ?? true,
        },
        { onConflict: 'user_id' }
      )
      .select('quiet_hours_enabled, quiet_start_minute, quiet_end_minute, timezone, safety_overrides_quiet')
      .single();

    if (error) {
      console.error('Error saving notification preferences:', error);
      return jsonPrivate({ error: 'Could not save preferences' }, { status: 500 });
    }

    const response: NotificationPreferencesResponse = { preferences: toPreferences(data) };
    return jsonPrivate(response);
  } catch (error) {
    console.error('Error saving notification preferences:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}
